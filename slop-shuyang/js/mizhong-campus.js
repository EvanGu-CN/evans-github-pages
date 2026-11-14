import * as THREE from 'three/webgpu';
import { REAL_BUILDINGS } from './building-geodata.js';

// 江苏省沭阳高级中学（东关大街132号本部）校园建筑精细化。
//
// 依据：2026-11-13 高德在线卫星图层（官方未公开拍摄日）、高德校园实景（育华楼正立面、
// 教学楼内院、校门）、江苏省住建厅"时光宝筑"大礼堂官方影像、校园游记文字考据
// （美篇《永远的沭中》）、百度百科校园道路命名表。
// 可辨要素：育华楼中央山花与金色楼名、教学楼灰面砖与外廊、大礼堂1961年青砖坡顶、
// 北侧宿舍楼群、400 m塑胶跑道与足球场。
//
// 本模块只在23条来源校园轮廓上叠加立面构件与地表设施，不新增也不替换任何楼体。
// 楼宇名称、层数推算、窗格排布均为类型化展示估计，不是逐栋测绘。

// ---- 23 栋校园来源楼体的角色判定（质心坐标 → 用途）----
// 判据：相对校门(998,32)与育华楼(1070,-5)的位置、体量、层高、
// 游记"大礼堂东—育华楼—科技楼西"轴线索引、卫星图屋顶特征。
const ROLE_BY_CENTROID = [
  // 育华楼区（校门正北方，山花立面+泰山石前庭）
  { cx: 1070, cz: -5, role: 'yuhua' },
  // 大礼堂（育华路以西，1961年青砖坡顶）
  { cx: 940, cz: -88, role: 'auditorium' },
  // 老建筑（行知楼/校史馆一类）
  { cx: 895, cz: -89, role: 'historic' },
  // 教学楼（灰面砖外廊式）
  { cx: 990, cz: -166, role: 'teaching' },
  { cx: 947, cz: -191, role: 'teaching' },
  { cx: 1042, cz: -68, role: 'teaching' },
  { cx: 1063, cz: -102, role: 'teaching' },
  { cx: 1027, cz: -126, role: 'teaching' },
  // 教学楼群（培源/培根、振宁/振道等大型组合体）
  { cx: 1135, cz: -260, role: 'teachingBlock' },
  { cx: 1003, cz: -283, role: 'teachingBlock' },
  // 低层大跨度（科技楼群/食堂/活动中心）
  { cx: 1066, cz: -171, role: 'lowWide' },
  { cx: 1133, cz: -87, role: 'lowWide' },
  { cx: 1172, cz: -142, role: 'lowWide' },
  { cx: 1010, cz: -285, role: 'lowWide' },
  // 体育馆/看台（贴操场）
  { cx: 1220, cz: -286, role: 'gymStand' },
  { cx: 1244, cz: -118, role: 'service' },
  // 食堂（北侧大体量）
  { cx: 1197, cz: -420, role: 'canteen' },
  { cx: 1055, cz: -363, role: 'canteen' },
  // 宿舍楼群（北侧行列式）
  { cx: 1107, cz: -351, role: 'dorm' },
  { cx: 1212, cz: -349, role: 'dorm' },
  { cx: 1194, cz: -326, role: 'dorm' },
  { cx: 1168, cz: -316, role: 'dorm' },
  { cx: 1130, cz: -390, role: 'dorm' }
];

// 400 m 塑胶跑道（OSM way/497324861：最小外接矩形 154.9×92.3 m，长轴 124.5°）
// 2026-11-14 高德 z18 卫星图核对：真实跑道是"直道+两弯"体育场形、长轴东北—西南；
// 此前的轴对齐椭圆与影像不符，改为按 OSM 角度旋转的体育场形。
const TRACK = {
  cx: 1281, cz: -245,
  halfS: 31.3,          // 直道半长 = L/2 − 外弯半径
  rOut: 46.15,          // 外弯半径 = W/2
  laneW: 1.22, lanes: 6,
  angle: 124.5 * Math.PI / 180  // 长轴方向（x→z 平面）
};
// 足球场（跑道内场）
const FIELD = { cx: 1281, cz: -245, halfS: 31.3, rIn: 46.15 - 6 * 1.22 };
// 篮球场（OSM way/1371978242：31.1×29.5 m，长轴 22.7°）
const COURT = { cx: 1246, cz: -387, w: 31, d: 29.5, angle: 22.7 * Math.PI / 180 };
// 蓝膜球场顶棚（OSM way/497324863 一带，卫星图可见蓝色膜结构屋面）
const MEMBRANE = { cx: 1345, cz: -195, w: 72, d: 44, angle: -55.7 * Math.PI / 180 };
// 泰山石前庭（育华楼前，way/1467637938 green 东侧）
const FORECOURT = { cx: 1078, cz: 18, r: 16 };

const FLOOR_H = 3.1;

// ---- 几何工具 ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
  }
  return a / 2;
}

function orientedRect(ring) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 2) continue;
    const ux = dx / len, uz = dz / len, vx = -uz, vz = ux;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of ring) {
      const u = p.x * ux + p.z * uz, v = p.x * vx + p.z * vz;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const L = Math.max(maxU - minU, maxV - minV), W = Math.min(maxU - minU, maxV - minV);
    const area = L * W;
    if (area <= 0) continue;
    const along = (maxU - minU) >= (maxV - minV) ? { x: ux, z: uz } : { x: vx, z: vz };
    const across = { x: -along.z, z: along.x };
    if (!best || area < best.area) {
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      best = {
        ux: along.x, uz: along.z, vx: across.x, vz: across.z,
        L, W, area, cx: cu * ux + cv * vx, cz: cu * uz + cv * vz
      };
    }
  }
  return best;
}

function createBatch(material, name) {
  const positions = [], normals = [], uvs = [];
  const vertex = (p, n, uv) => {
    positions.push(p[0], p[1], p[2]);
    normals.push(n[0], n[1], n[2]);
    uvs.push(uv[0], uv[1]);
  };
  const faceNormal = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  };
  const triRaw = (a, b, c, ua, ub, uc) => {
    const n = faceNormal(a, b, c);
    vertex(a, n, ua); vertex(b, n, ub); vertex(c, n, uc);
  };
  const tri = (a, b, c, dir = null, ua = [0, 0], ub = [1, 0], uc = [1, 1]) => {
    if (dir) {
      const n = faceNormal(a, b, c);
      if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) return triRaw(a, c, b, ua, uc, ub);
    }
    triRaw(a, b, c, ua, ub, uc);
  };
  const quad = (a, b, c, d, dir = null, uvs = null) => {
    const uv = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    tri(a, b, c, dir, uv[0], uv[1], uv[2]);
    tri(a, c, d, dir, uv[0], uv[2], uv[3]);
  };
  const box = (cx, y, cz, w, h, d, ry = 0) => {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const hw = w / 2, hd = d / 2;
    const local = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    const world = local.map(([lx, lz]) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]);
    const low = world.map(p => [p[0], y, p[1]]);
    const high = world.map(p => [p[0], y + h, p[1]]);
    quad(low[0], low[1], low[2], low[3], [0, -1, 0]);
    quad(high[0], high[1], high[2], high[3], [0, 1, 0]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const mx = (low[i][0] + low[j][0]) / 2 - cx, mz = (low[i][2] + low[j][2]) / 2 - cz;
      const len = Math.hypot(mx, mz) || 1;
      quad(low[i], low[j], high[j], high[i], [mx / len, 0, mz / len]);
    }
  };
  return {
    tri, quad, box,
    get empty() { return positions.length === 0; },
    build() {
      if (!positions.length) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    }
  };
}

// 青砖纹：横缝 + 竖缝交错
function brickTexture(base, mortar) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = mortar; g.lineWidth = 1.5;
  for (let y = 0; y < 64; y += 8) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke();
    const off = (y / 8) % 2 ? 0 : 16;
    for (let x = off; x < 64; x += 32) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 楼名文字贴图（金色字 + 深色底）
function nameTexture(text, bg = '#2c3e50', fg = '#d4af37', vertical = true) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const chars = [...text];
  const cw = 48, ch = 48;
  const w = vertical ? cw : cw * chars.length;
  const h = vertical ? ch * chars.length : ch;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${ch * 0.72}px "KaiTi","STKaiti",serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  chars.forEach((chr, i) => {
    const x = vertical ? cw / 2 : cw * (i + 0.5);
    const y = vertical ? ch * (i + 0.5) : ch / 2;
    g.fillText(chr, x, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- 主构建 ----
function buildMizhongCampus(root) {
  // 按质心匹配 23 栋校园楼体
  const matched = [];
  for (const spec of ROLE_BY_CENTROID) {
    let best = null;
    for (const b of REAL_BUILDINGS) {
      const d = Math.hypot(b.cx - spec.cx, b.cz - spec.cz);
      if (d < 12 && (!best || d < best.d)) best = { d, b };
    }
    if (!best) continue;
    const ring = best.b.polygons[0].outer.map(p => ({ x: p.x, z: p.z }));
    const rect = orientedRect(ring);
    if (!rect) continue;
    matched.push({ ...spec, building: best.b, ring, rect, d: best.d });
  }
  if (!matched.length) return null;

  const group = new THREE.Group();
  group.name = '校园·沭阳高级中学';

  const std = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...o });
  const M = {
    wall: std(0xb8bcc0),          // 灰面砖主墙（教学楼实景）
    wallLight: std(0xcdd0d2),     // 浅灰墙带
    wallBlue: std(0x8a97a4),      // 育华楼蓝灰
    wallBrick: new THREE.MeshStandardNodeMaterial({
      color: 0x9a9590, roughness: 0.92,
      map: brickTexture('#9a9590', '#7e7a75')
    }),
    base: std(0xd6cfc0),          // 米色石材勒脚/基座
    accent: std(0xc4794e),        // 橙粉装饰墙板（教学楼实景）
    corridor: std(0xa8adb0),      // 外廊栏板
    glass: std(0x3a5058, { roughness: 0.22, metalness: 0.42 }),
    frame: std(0x6e7478, { roughness: 0.5, metalness: 0.38 }),
    door: std(0x5a3e2e, { roughness: 0.72 }),
    redFrame: std(0x6e2c22, { roughness: 0.68 }),  // 大礼堂红窗框
    roofBlue: std(0x5a7387, { roughness: 0.88 }),  // 大礼堂蓝瓦
    roofGrey: std(0x8a8d90, { roughness: 0.9 }),
    parapet: std(0xa8a8a2, { roughness: 0.86 }),
    pediment: std(0x9aa4ae, { roughness: 0.82 }),  // 山花
    gold: std(0xc9a84c, { roughness: 0.55, metalness: 0.35 }),
    trackRed: std(0xb04a38, { roughness: 0.92 }),
    trackLine: std(0xe8e2d8, { roughness: 0.9 }),
    fieldGreen: std(0x4a7a42, { roughness: 0.96 }),
    courtGreen: std(0x5a8a72, { roughness: 0.94 }),
    hedge: std(0x4e6a3e, { roughness: 0.96 }),
    tree: std(0x3e6634, { roughness: 0.98 }),
    trunk: std(0x6b5238, { roughness: 0.94 }),
    plaza: std(0xb5b0a4, { roughness: 0.94 }),
    stone: std(0x8a8478, { roughness: 0.92 }),     // 泰山石
    flower: std(0xc45c38, { roughness: 0.92 }),
    ivy: std(0x5a4a32, { roughness: 0.96 }),       // 爬藤
    metal: std(0x9aa0a4, { roughness: 0.5, metalness: 0.42 }),
    membrane: std(0x2f5fa8, { roughness: 0.55, metalness: 0.2 }),  // 蓝色膜结构顶棚
    goldPlate: std(0xc9a84c, { roughness: 0.5, metalness: 0.4 }),  // 金字牌匾/碑刻
    bronze: std(0x8a6b3c, { roughness: 0.55, metalness: 0.5 }),    // 铜雕/智慧门
    redStone: std(0x8e3a2e, { roughness: 0.85 }),                  // 红石碑刻
    darkBoard: std(0x2a2622, { roughness: 0.8 })                   // 黑底匾额
  };

  const batches = {
    wall: createBatch(M.wall, '沭中·灰面砖墙'),
    wallLight: createBatch(M.wallLight, '沭中·浅灰墙带'),
    wallBlue: createBatch(M.wallBlue, '沭中·蓝灰墙'),
    wallBrick: createBatch(M.wallBrick, '沭中·青砖墙'),
    base: createBatch(M.base, '沭中·基座'),
    accent: createBatch(M.accent, '沭中·橙粉墙板'),
    corridor: createBatch(M.corridor, '沭中·外廊栏板'),
    glass: createBatch(M.glass, '沭中·窗玻璃'),
    frame: createBatch(M.frame, '沭中·窗框'),
    door: createBatch(M.door, '沭中·门'),
    redFrame: createBatch(M.redFrame, '沭中·红窗框'),
    roofBlue: createBatch(M.roofBlue, '沭中·蓝瓦坡顶'),
    roofGrey: createBatch(M.roofGrey, '沭中·灰屋面'),
    parapet: createBatch(M.parapet, '沭中·女儿墙'),
    pediment: createBatch(M.pediment, '沭中·山花'),
    gold: createBatch(M.gold, '沭中·金字'),
    trackRed: createBatch(M.trackRed, '沭中·跑道'),
    trackLine: createBatch(M.trackLine, '沭中·跑道线'),
    fieldGreen: createBatch(M.fieldGreen, '沭中·足球场'),
    courtGreen: createBatch(M.courtGreen, '沭中·球场'),
    hedge: createBatch(M.hedge, '沭中·绿篱'),
    tree: createBatch(M.tree, '沭中·树冠'),
    trunk: createBatch(M.trunk, '沭中·树干'),
    plaza: createBatch(M.plaza, '沭中·广场铺装'),
    stone: createBatch(M.stone, '沭中·泰山石'),
    flower: createBatch(M.flower, '沭中·花坛'),
    ivy: createBatch(M.ivy, '沭中·爬藤'),
    metal: createBatch(M.metal, '沭中·金属件'),
    membrane: createBatch(M.membrane, '沭中·蓝膜顶棚'),
    goldPlate: createBatch(M.goldPlate, '沭中·碑刻金字'),
    bronze: createBatch(M.bronze, '沭中·铜雕'),
    redStone: createBatch(M.redStone, '沭中·红石碑'),
    darkBoard: createBatch(M.darkBoard, '沭中·匾额')
  };

  const stats = { buildings: 0, yuhua: 0, auditorium: 0, teaching: 0, dorm: 0, canteen: 0, gym: 0, track: 0, windows: 0 };
  const rand = mulberry32(20261113);

  // ---- 逐栋立面 ----
  for (const item of matched) {
    const { role, ring, rect, building } = item;
    const top = building.height;
    const floors = Math.max(2, Math.round(top / FLOOR_H));
    const ry = -Math.atan2(rect.uz, rect.ux);
    stats.buildings++;

    // 每栋沿四边放窗带（按角色调样式）
    const addFacade = (mat, glassMat, frameMat, opts = {}) => {
      const { cx, cz, ux, uz, vx, vz, L, W } = rect;
      const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
      // 四边：±L/2 沿 u、±W/2 沿 v
      const edges = [
        { o: at(0, W / 2), dir: { x: vx, z: vz }, len: L, ry: ry },
        { o: at(0, -W / 2), dir: { x: -vx, z: -vz }, len: L, ry: ry + Math.PI },
        { o: at(L / 2, 0), dir: { x: ux, z: uz }, len: W, ry: ry - Math.PI / 2 },
        { o: at(-L / 2, 0), dir: { x: -ux, z: -uz }, len: W, ry: ry + Math.PI / 2 }
      ];
      for (const e of edges) {
        const halfLen = e.len / 2 - 0.8;
        const bay = opts.bay || 3.2;
        const n = Math.max(1, Math.floor((halfLen * 2) / bay));
        for (let f = 0; f < floors; f++) {
          const y = 0.6 + f * FLOOR_H;
          for (let k = 0; k < n; k++) {
            const u = -halfLen + bay * (k + 0.5);
            const p = {
              x: e.o.x + e.dir.x * 0 + (e.dir.z !== 0 ? 0 : 0),
              z: e.o.z
            };
            // 沿边偏移
            const tangent = { x: -e.dir.z, z: e.dir.x };
            const wx = e.o.x + tangent.x * u + e.dir.x * 0.12;
            const wz = e.o.z + tangent.z * u + e.dir.z * 0.12;
            // 窗
            batches.glass.box(wx, y + 0.35, wz, opts.winW || 1.6, opts.winH || 1.5, 0.08, e.ry);
            batches.frame.box(wx, y + 0.35, wz, (opts.winW || 1.6) + 0.16, (opts.winH || 1.5) + 0.16, 0.05, e.ry);
            stats.windows++;
            // 橙粉装饰板（每 2 开间一块）
            if (opts.accent && k % 2 === 0) {
              batches.accent.box(wx + tangent.x * (bay * 0.5), y + 1.2, wz + tangent.z * (bay * 0.5), 0.5, 2.4, 0.1, e.ry);
            }
          }
          // 层间腰线
          batches.wallLight.box(e.o.x + e.dir.x * 0.1, y + FLOOR_H - 0.18, e.o.z + e.dir.z * 0.1, e.len - 1.2, 0.18, 0.12, e.ry);
        }
        // 外廊栏板（教学楼）
        if (opts.corridor) {
          for (let f = 1; f < floors; f++) {
            const y = f * FLOOR_H;
            batches.corridor.box(e.o.x + e.dir.x * 0.55, y, e.o.z + e.dir.z * 0.55, e.len - 1.2, 1.05, 0.14, e.ry);
            // 扶手
            batches.metal.box(e.o.x + e.dir.x * 0.55, y + 1.05, e.o.z + e.dir.z * 0.55, e.len - 1.2, 0.06, 0.2, e.ry);
          }
        }
      }
    };

    switch (role) {
      case 'yuhua': {
        stats.yuhua++;
        // 蓝灰主墙
        const { cx, cz, ux, uz, vx, vz, L, W } = rect;
        const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });

        // 中央山花：宽 16 m、高 5 m 的弧面山墙（照片：育华楼正立面顶部曲线山花）
        const pedW = 16, pedH = 5.2;
        const pC = at(0, W / 2 + 0.35);
        const pRy = ry; // 正面朝 +v
        // 山花底座
        batches.pediment.box(pC.x, top, pC.z, pedW, 1.2, 1.4, pRy);
        // 弧形山花（分段逼近）
        const segs = 10;
        for (let i = 0; i < segs; i++) {
          const t0 = i / segs, t1 = (i + 1) / segs;
          const x0 = -pedW / 2 + pedW * t0, x1 = -pedW / 2 + pedW * t1;
          const y0 = top + 1.2 + pedH * Math.sin(Math.PI * t0) * 0.85;
          const y1 = top + 1.2 + pedH * Math.sin(Math.PI * t1) * 0.85;
          const pa = at(x0, W / 2 + 0.35), pb = at(x1, W / 2 + 0.35);
          const na = { x: vx, z: vz };
          batches.pediment.quad(
            [pa.x, top + 1.2, pa.z], [pb.x, top + 1.2, pb.z],
            [pb.x, y1, pb.z], [pa.x, y0, pa.z], na
          );
          // 山花厚度
          batches.pediment.quad(
            [pa.x, y0, pa.z], [pb.x, y1, pb.z],
            [pb.x, y1, pb.z - 1.0 * vz], [pa.x, y0, pa.z - 1.0 * vz], [0, 1, 0]
          );
        }
        // 校徽（山花顶部圆形）
        const crest = at(0, W / 2 + 0.4);
        batches.gold.box(crest.x, top + 1.2 + pedH * 0.85, crest.z, 1.8, 1.8, 0.25, pRy);
        batches.wallBlue.box(crest.x, top + 1.2 + pedH * 0.85 + 0.28, crest.z, 1.2, 1.2, 0.1, pRy);

        // 中央拱窗（照片：跨 3-4 层的大型拱窗）
        const archW = 7, archH = 8;
        const aC = at(0, W / 2 + 0.2);
        batches.glass.box(aC.x, 2.2 + archH * 0.35, aC.z, archW, archH * 0.75, 0.12, pRy);
        // 拱顶分段
        for (let i = 0; i < 8; i++) {
          const t0 = i / 8, t1 = (i + 1) / 8;
          const x0 = -archW / 2 + archW * t0, x1 = -archW / 2 + archW * t1;
          const y0 = 2.2 + archH * 0.75 + archW / 2 * Math.sin(Math.PI * t0) * 0.55;
          const y1 = 2.2 + archH * 0.75 + archW / 2 * Math.sin(Math.PI * t1) * 0.55;
          const qa = at(x0, W / 2 + 0.2), qb = at(x1, W / 2 + 0.2);
          batches.glass.quad(
            [qa.x, 2.2 + archH * 0.75, qa.z], [qb.x, 2.2 + archH * 0.75, qb.z],
            [qb.x, y1, qb.z], [qa.x, y0, qa.z], { x: vx, z: vz }
          );
        }
        // 拱窗框
        batches.frame.box(aC.x, 2.2 + archH * 0.38, aC.z, archW + 0.3, archH * 0.8, 0.08, pRy);

        // 金色楼名"育华楼"（照片：竖排金字）
        const nameTex = nameTexture('育华楼', '#2a3540', '#d4af37', true);
        if (nameTex) {
          const nameMat = new THREE.MeshBasicNodeMaterial({ map: nameTex });
          const nameBatch = createBatch(nameMat, '沭中·育华楼名牌');
          const nC = at(-archW / 2 - 1.8, W / 2 + 0.18);
          nameBatch.quad(
            [nC.x - 0.65, top - 4.5, nC.z], [nC.x + 0.65, top - 4.5, nC.z],
            [nC.x + 0.65, top - 0.2, nC.z], [nC.x - 0.65, top - 0.2, nC.z],
            { x: vx, z: vz }
          );
          const nm = nameBatch.build();
          if (nm) group.add(nm);
        }

        // 两翼常规窗 + 空调机位
        for (const s of [-1, 1]) {
          for (let f = 0; f < floors; f++) {
            const y = 0.7 + f * FLOOR_H;
            for (let k = 0; k < 5; k++) {
              const u = s * (pedW / 2 + 2.4 + k * 3.1);
              const p = at(u, W / 2 + 0.15);
              batches.glass.box(p.x, y, p.z, 1.7, 1.5, 0.08, pRy);
              batches.frame.box(p.x, y, p.z, 1.9, 1.7, 0.05, pRy);
              stats.windows++;
              // 空调外机（照片：两翼外墙上密集空调机位）
              if (f > 0 && k % 2 === 1) {
                const q = at(u + 1.0, W / 2 + 0.5);
                batches.metal.box(q.x, y - 0.15, q.z, 0.85, 0.55, 0.6, pRy);
              }
            }
          }
        }
        // 米色基座（照片：育华楼底层米色石材）
        for (const s of [-1, 1]) {
          const p = at(s * L * 0.3, W / 2 + 0.1);
          batches.base.box(p.x, 0, p.z, L * 0.55, 3.2, 0.3, pRy);
        }
        const pM = at(0, W / 2 + 0.1);
        batches.base.box(pM.x, 0, pM.z, pedW + 2, 3.4, 0.35, pRy);
        // 入口台阶与门廊
        const eC = at(0, W / 2 + 1.2);
        batches.base.box(eC.x, 0, eC.z, 8, 0.35, 3.2, pRy);
        batches.base.box(eC.x, 0.35, eC.z, 7, 0.35, 2.4, pRy);
        batches.base.box(eC.x, 0.7, eC.z, 6, 0.35, 1.6, pRy);
        batches.door.box(eC.x, 1.05, eC.z - 0.6, 4.2, 2.6, 0.18, pRy);
        // 门廊雨棚
        batches.pediment.box(eC.x, 3.65, eC.z + 0.4, 9, 0.3, 3.6, pRy);

        // 泰山石前庭（照片：育华楼前泰山石与花坛）
        const sc = FORECOURT;
        batches.plaza.box(sc.cx, 0.06, sc.cz, sc.r * 2, 0.12, sc.r * 1.6, 0);
        // 石体（不规则块体叠放）
        batches.stone.box(sc.cx, 0.12, sc.cz, 4.2, 3.6, 2.8, 0.3);
        batches.stone.box(sc.cx + 0.5, 3.72, sc.cz - 0.3, 2.8, 1.1, 2.0, -0.2);
        batches.stone.box(sc.cx - 0.8, 0.12, sc.cz + 1.5, 2.0, 1.4, 1.5, 0.6);
        // 环形花坛（照片：橙红花带）
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const fx = sc.cx + Math.cos(a) * 6.5, fz = sc.cz + Math.sin(a) * 5.2;
          batches.flower.box(fx, 0.12, fz, 2.2, 0.75, 1.2, a);
        }
        break;
      }

      case 'auditorium': {
        stats.auditorium++;
        const { cx, cz, ux, uz, vx, vz, L, W } = rect;
        const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });

        // 青砖墙面（照片：1961年灰砖）
        for (const s of [-1, 1]) {
          const p = at(0, s * (W / 2 + 0.08));
          batches.wallBrick.box(p.x, 0, p.z, L, top, 0.16, ry + (s > 0 ? 0 : Math.PI));
          const q = at(s * (L / 2 + 0.08), 0);
          batches.wallBrick.box(q.x, 0, q.z, W, top, 0.16, ry - s * Math.PI / 2);
        }

        // 大坡顶（照片：蓝瓦人字坡顶，山墙朝向主立面）
        const rise = 4.6, oh = 0.7;
        const eaveY = top + 0.02, ridgeY = top + rise;
        // 两片坡面（沿长轴起脊）
        for (const s of [-1, 1]) {
          const e0 = at(-L / 2 - oh, s * (W / 2 + oh)), e1 = at(L / 2 + oh, s * (W / 2 + oh));
          const r0 = at(-L / 2 - oh, 0), r1 = at(L / 2 + oh, 0);
          batches.roofBlue.quad(
            [e0.x, eaveY, e0.z], [e1.x, eaveY, e1.z],
            [r1.x, ridgeY, r1.z], [r0.x, ridgeY, r0.z], [vx * s, 0.7, vz * s]
          );
        }
        // 山墙尖（照片：正面人字山墙）
        for (const s of [-1, 1]) {
          const a0 = at(s * (L / 2 + oh * 0.4), -W / 2), a1 = at(s * (L / 2 + oh * 0.4), W / 2), r = at(s * (L / 2 + oh * 0.4), 0);
          batches.wallBrick.tri([a1.x, eaveY, a1.z], [a0.x, eaveY, a0.z], [r.x, ridgeY, r.z], [ux * s, 0, uz * s]);
          // 博风板
          batches.roofBlue.box(at(s * (L / 2 + oh * 0.5), 0).x, ridgeY - 0.15, at(s * (L / 2 + oh * 0.5), 0).z,
            0.22, 0.28, W + oh * 1.2, ry);
        }
        // 屋脊
        batches.roofBlue.box(at(0, 0).x, ridgeY - 0.08, at(0, 0).z, L + oh * 2 + 0.3, 0.18, 0.4, ry);

        // 红框格窗（照片：上下两排红框多格窗）
        const facades = [
          { o: at(0, W / 2 + 0.12), dir: { x: vx, z: vz }, len: L, ry },
          { o: at(0, -W / 2 - 0.12), dir: { x: -vx, z: -vz }, len: L, ry: ry + Math.PI }
        ];
        for (const e of facades) {
          const n = Math.max(3, Math.floor(e.len / 4.2));
          for (let k = 0; k < n; k++) {
            const u = -e.len / 2 + 2.4 + k * 4.2;
            const tangent = { x: -e.dir.z, z: e.dir.x };
            for (const wy of [1.6, 5.2]) {
              const wx = e.o.x + tangent.x * u + e.dir.x * 0.14;
              const wz = e.o.z + tangent.z * u + e.dir.z * 0.14;
              batches.glass.box(wx, wy, wz, 1.55, 1.9, 0.07, e.ry);
              batches.redFrame.box(wx, wy, wz, 1.75, 2.1, 0.05, e.ry);
              stats.windows++;
            }
          }
        }
        // 山墙小圆窗
        for (const s of [-1, 1]) {
          const p = at(s * (L / 2 + 0.14), 0);
          batches.glass.box(p.x, top + 2.2, p.z, 1.1, 1.1, 0.08, ry - s * Math.PI / 2);
          batches.redFrame.box(p.x, top + 2.2, p.z, 1.35, 1.35, 0.05, ry - s * Math.PI / 2);
        }
        // 入口台阶 + 红门（照片：中央红门、石阶、爬藤）
        const eC = at(0, W / 2 + 1.0);
        batches.base.box(eC.x, 0, eC.z, 4.2, 0.28, 2.6, ry);
        batches.base.box(eC.x, 0.28, eC.z, 3.6, 0.28, 2.0, ry);
        batches.base.box(eC.x, 0.56, eC.z, 3.0, 0.28, 1.4, ry);
        batches.door.box(eC.x, 0.84, eC.z - 0.55, 2.2, 2.7, 0.16, ry);
        batches.redFrame.box(eC.x, 0.84, eC.z - 0.6, 2.6, 3.0, 0.1, ry);
        // 爬藤（照片：立面大片爬山虎）
        for (let i = 0; i < 12; i++) {
          const u = -L / 2 + 1.5 + rand() * (L - 3);
          const v = (W / 2 + 0.2) * (rand() > 0.5 ? 1 : -1);
          const p = at(u, v);
          batches.ivy.box(p.x, 1 + rand() * 2.2, p.z, 1.2 + rand() * 1.8, 1.6 + rand() * 1.6, 0.1, ry);
        }
        break;
      }

      case 'teaching': {
        stats.teaching++;
        // 灰面砖 + 橙粉墙板 + 外廊
        addFacade(M.wall, M.glass, M.frame, { bay: 3.0, winW: 1.7, winH: 1.55, accent: true, corridor: true });
        // 女儿墙
        batches.parapet.box(rect.cx, top, rect.cz, rect.L + 0.5, 0.9, rect.W + 0.5, ry);
        // 勒脚
        batches.base.box(rect.cx, 0, rect.cz, rect.L + 0.35, 1.1, rect.W + 0.35, ry);
        // 端部楼梯间（实墙）
        for (const s of [-1, 1]) {
          const p = { x: rect.cx + rect.ux * s * (rect.L / 2 - 1.2), z: rect.cz + rect.uz * s * (rect.L / 2 - 1.2) };
          batches.wall.box(p.x, 0, p.z, 3.2, top, rect.W + 0.4, ry);
          // 顶部水箱
          batches.parapet.box(p.x, top + 0.9, p.z, 2.2, 1.4, 2.2, ry);
        }
        break;
      }

      case 'teachingBlock': {
        stats.teaching++;
        addFacade(M.wall, M.glass, M.frame, { bay: 3.1, winW: 1.65, winH: 1.5, accent: true, corridor: true });
        batches.parapet.box(rect.cx, top, rect.cz, rect.L + 0.5, 0.85, rect.W + 0.5, ry);
        batches.base.box(rect.cx, 0, rect.cz, rect.L + 0.35, 1.0, rect.W + 0.35, ry);
        break;
      }

      case 'dorm': {
        stats.dorm++;
        // 宿舍：密窗格 + 阳台板
        const { cx, cz, ux, uz, vx, vz, L, W } = rect;
        const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
        const edges = [
          { o: at(0, W / 2), dir: { x: vx, z: vz }, len: L, ry },
          { o: at(0, -W / 2), dir: { x: -vx, z: -vz }, len: L, ry: ry + Math.PI }
        ];
        for (const e of edges) {
          const n = Math.max(2, Math.floor(e.len / 3.0));
          for (let f = 0; f < floors; f++) {
            const y = 0.7 + f * FLOOR_H;
            for (let k = 0; k < n; k++) {
              const u = -e.len / 2 + 1.8 + k * 3.0;
              const tangent = { x: -e.dir.z, z: e.dir.x };
              const wx = e.o.x + tangent.x * u + e.dir.x * 0.12;
              const wz = e.o.z + tangent.z * u + e.dir.z * 0.12;
              batches.glass.box(wx, y, wz, 1.55, 1.45, 0.07, e.ry);
              batches.frame.box(wx, y, wz, 1.72, 1.62, 0.05, e.ry);
              stats.windows++;
              // 阳台栏板（每开间）
              batches.corridor.box(wx, y - 0.35, wz, 2.2, 0.95, 0.12, e.ry);
            }
            batches.wallLight.box(e.o.x + e.dir.x * 0.1, y + FLOOR_H - 0.16, e.o.z + e.dir.z * 0.1, e.len - 1.0, 0.16, 0.1, e.ry);
          }
        }
        // 山墙面小窗
        for (const s of [-1, 1]) {
          const p = at(s * (L / 2 + 0.1), 0);
          for (let f = 0; f < floors; f++) {
            batches.glass.box(p.x, 0.8 + f * FLOOR_H, p.z, 0.12, 1.2, 1.3, ry - s * Math.PI / 2);
          }
        }
        batches.parapet.box(cx, top, cz, L + 0.45, 0.85, W + 0.45, ry);
        batches.base.box(cx, 0, cz, L + 0.3, 1.0, W + 0.3, ry);
        // 楼顶晾衣杆
        for (let i = 0; i < 3; i++) {
          const p = at(-L / 4 + i * L / 4, 0);
          batches.metal.box(p.x, top + 0.85, p.z, 0.08, 1.6, W * 0.55, ry);
        }
        break;
      }

      case 'canteen': {
        stats.canteen++;
        // 食堂：大窗 + 宽檐
        const { cx, cz, ux, uz, vx, vz, L, W } = rect;
        const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
        // 两层通高大窗（底层就餐区）
        for (const s of [-1, 1]) {
          const e = { o: at(0, s * (W / 2 + 0.12)), dir: { x: vx * s, z: vz * s }, ry };
          const n = Math.max(3, Math.floor(L / 5.5));
          for (let k = 0; k < n; k++) {
            const u = -L / 2 + 3 + k * 5.5;
            const tangent = { x: -e.dir.z, z: e.dir.x };
            const wx = e.o.x + tangent.x * u, wz = e.o.z + tangent.z * u;
            batches.glass.box(wx, 1.6, wz, 3.8, 2.6, 0.1, e.ry);
            batches.frame.box(wx, 1.6, wz, 4.1, 2.9, 0.06, e.ry);
            stats.windows++;
            if (floors > 1) {
              batches.glass.box(wx, 4.6, wz, 3.2, 1.8, 0.08, e.ry);
              batches.frame.box(wx, 4.6, wz, 3.5, 2.1, 0.05, e.ry);
            }
          }
          // 宽檐口
          batches.parapet.box(e.o.x + e.dir.x * 0.8, top - 0.3, e.o.z + e.dir.z * 0.8, L + 1.2, 0.55, 1.6, e.ry);
        }
        batches.parapet.box(cx, top, cz, L + 0.5, 0.95, W + 0.5, ry);
        batches.base.box(cx, 0, cz, L + 0.35, 1.2, W + 0.35, ry);
        break;
      }

      case 'gymStand': {
        stats.gym++;
        // 体育馆/看台：高窗带 + 大跨体量
        const { cx, cz, ux, uz, vx, vz, L, W } = rect;
        const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
        // 朝向操场一侧高窗（+x 侧为操场）
        const e = { o: at(L / 2 + 0.12, 0), dir: { x: ux, z: uz }, ry: ry - Math.PI / 2 };
        for (let f = 1; f < floors; f++) {
          const y = 0.8 + f * FLOOR_H;
          const n = Math.max(3, Math.floor(W / 4.0));
          for (let k = 0; k < n; k++) {
            const u = -W / 2 + 2.4 + k * 4.0;
            const tangent = { x: -e.dir.z, z: e.dir.x };
            const wx = e.o.x + tangent.x * u, wz = e.o.z + tangent.z * u;
            batches.glass.box(wx, y, wz, 0.08, 1.8, 2.6, e.ry);
            batches.frame.box(wx, y, wz, 0.05, 2.0, 2.9, e.ry);
            stats.windows++;
          }
        }
        // 看台斜面（朝操场的斜坡体）
        const stand = at(L / 2 + 3.5, 0);
        batches.parapet.box(stand.x, 0, stand.z, 7, top * 0.7, W * 0.85, ry - Math.PI / 2);
        batches.parapet.box(cx, top, cz, L + 0.5, 0.9, W + 0.5, ry);
        batches.base.box(cx, 0, cz, L + 0.35, 1.1, W + 0.35, ry);
        break;
      }

      case 'lowWide': {
        // 低层大跨度（科技楼群/活动中心）
        addFacade(M.wall, M.glass, M.frame, { bay: 3.4, winW: 1.9, winH: 1.7, accent: false, corridor: false });
        batches.parapet.box(rect.cx, top, rect.cz, rect.L + 0.5, 0.85, rect.W + 0.5, ry);
        batches.base.box(rect.cx, 0, rect.cz, rect.L + 0.35, 1.05, rect.W + 0.35, ry);
        break;
      }

      case 'historic': {
        // 老建筑：灰砖 + 坡顶
        const { cx, cz, ux, uz, vx, vz, L, W } = rect;
        const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
        for (const s of [-1, 1]) {
          const p = at(0, s * (W / 2 + 0.07));
          batches.wallBrick.box(p.x, 0, p.z, L, top, 0.14, ry + (s > 0 ? 0 : Math.PI));
        }
        // 小坡顶
        const rise = 2.4, oh = 0.5;
        const eaveY = top + 0.02, ridgeY = top + rise;
        for (const s of [-1, 1]) {
          const e0 = at(-L / 2 - oh, s * (W / 2 + oh)), e1 = at(L / 2 + oh, s * (W / 2 + oh));
          const r0 = at(-L / 2 - oh, 0), r1 = at(L / 2 + oh, 0);
          batches.roofGrey.quad(
            [e0.x, eaveY, e0.z], [e1.x, eaveY, e1.z],
            [r1.x, ridgeY, r1.z], [r0.x, ridgeY, r0.z], [vx * s, 0.7, vz * s]
          );
        }
        // 窗
        const n = Math.max(2, Math.floor(L / 3.8));
        for (const s of [-1, 1]) {
          for (let k = 0; k < n; k++) {
            const u = -L / 2 + 2.2 + k * 3.8;
            for (let f = 0; f < Math.min(3, floors); f++) {
              const p = at(u, s * (W / 2 + 0.12));
              batches.glass.box(p.x, 1.2 + f * 3.0, p.z, 1.3, 1.6, 0.07, ry);
              batches.frame.box(p.x, 1.2 + f * 3.0, p.z, 1.5, 1.8, 0.05, ry);
            }
          }
        }
        batches.base.box(cx, 0, cz, L + 0.3, 1.0, W + 0.3, ry);
        break;
      }

      case 'service':
      default: {
        // 服务用房：简洁窗带
        addFacade(M.wall, M.glass, M.frame, { bay: 3.2, winW: 1.5, winH: 1.4, accent: false });
        batches.parapet.box(rect.cx, top, rect.cz, rect.L + 0.45, 0.8, rect.W + 0.45, ry);
        batches.base.box(rect.cx, 0, rect.cz, rect.L + 0.3, 1.0, rect.W + 0.3, ry);
        break;
      }
    }
  }

  // ---- 400 m 塑胶跑道 + 足球场（旋转体育场形：直道+两弯）----
  {
    const t = TRACK;
    const cosA = Math.cos(t.angle), sinA = Math.sin(t.angle);
    // 局部坐标 (s 沿长轴, r 沿短轴) → 世界
    const wp = (s, r) => [t.cx + s * cosA - r * sinA, t.cz + s * sinA + r * cosA];
    // 弯道参数：直道半长 halfS，外弯半径 rOut
    const ringPoint = (radius, phase) => {
      // phase 0..1 绕体育场一圈：0..0.25 右弯，0.25..0.5 直道（+s 边），0.5..0.75 左弯，0.75..1 直道
      const seg = (phase % 1 + 1) % 1;
      if (seg < 0.25) {
        const a = (seg / 0.25) * Math.PI - Math.PI / 2;   // 右弯 -90°→+90°
        return wp(t.halfS + Math.cos(a) * radius, Math.sin(a) * radius);
      } else if (seg < 0.5) {
        const u = 1 - (seg - 0.25) / 0.25;
        return wp(-t.halfS + 2 * t.halfS * u, radius);
      } else if (seg < 0.75) {
        const a = (seg - 0.5) / 0.25 * Math.PI + Math.PI / 2;  // 左弯 +90°→+270°
        return wp(-t.halfS + Math.cos(a) * radius, Math.sin(a) * radius);
      }
      const u = (seg - 0.75) / 0.25;
      return wp(-t.halfS + 2 * t.halfS * u, -radius);
    };
    const segs = 96;
    const rIn = FIELD.rIn, rOut = t.rOut;
    // 跑道面（环带）+ 分道线
    for (let i = 0; i < segs; i++) {
      const p0 = i / segs, p1 = (i + 1) / segs;
      const o0 = ringPoint(rOut, p0), o1 = ringPoint(rOut, p1);
      const i0 = ringPoint(rIn, p0), i1 = ringPoint(rIn, p1);
      batches.trackRed.quad(
        [o0[0], 0.3, o0[1]], [o1[0], 0.3, o1[1]],
        [i1[0], 0.3, i1[1]], [i0[0], 0.3, i0[1]], [0, 1, 0]
      );
      for (let lane = 1; lane < t.lanes; lane++) {
        const r = rIn + (rOut - rIn) * lane / t.lanes;
        const l0 = ringPoint(r, p0), l1 = ringPoint(r, p1);
        batches.trackLine.quad(
          [l0[0], 0.31, l0[1]], [l1[0], 0.31, l1[1]],
          [l1[0], 0.31, l1[1]], [l0[0], 0.31, l0[1]], [0, 1, 0]
        );
      }
    }
    // 内场草坪
    for (let i = 0; i < segs; i++) {
      const p0 = i / segs, p1 = (i + 1) / segs;
      const c0 = [t.cx, 0.29, t.cz];
      const i0 = ringPoint(rIn, p0), i1 = ringPoint(rIn, p1);
      batches.fieldGreen.tri(c0, [i1[0], 0.29, i1[1]], [i0[0], 0.29, i0[1]], [0, 1, 0]);
    }
    // 足球场白线（中线+中圈）
    {
      const a = wp(0, -rIn + 2), b = wp(0, rIn - 2);
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      batches.trackLine.box(mx, 0.31, mz, 0.18, 0.02, (rIn - 2) * 2, t.angle + Math.PI / 2);
      // 中圈近似为正方形环
      const seg2 = 20;
      for (let i = 0; i < seg2; i++) {
        const a0 = (i / seg2) * Math.PI * 2, a1 = ((i + 1) / seg2) * Math.PI * 2;
        const q0 = wp(Math.cos(a0) * 8, Math.sin(a0) * 8), q1 = wp(Math.cos(a1) * 8, Math.sin(a1) * 8);
        batches.trackLine.quad(
          [q0[0], 0.31, q0[1]], [q1[0], 0.31, q1[1]],
          [q1[0], 0.31, q1[1]], [q0[0], 0.31, q0[1]], [0, 1, 0]
        );
      }
    }
    stats.track++;
  }

  // ---- 篮球场（OSM way/1371978242，长轴 22.7°）----
  {
    const cc = COURT;
    batches.courtGreen.box(cc.cx, 0.28, cc.cz, cc.w, 0.04, cc.d, cc.angle);
    batches.trackLine.box(cc.cx, 0.31, cc.cz, 0.15, 0.02, cc.d * 0.9, cc.angle);
    for (const s of [-1, 1]) {
      batches.trackLine.box(cc.cx + s * cc.w * 0.35 * Math.cos(cc.angle), 0.31,
        cc.cz + s * cc.w * 0.35 * Math.sin(cc.angle), 0.15, 0.02, cc.d * 0.7, cc.angle);
    }
  }

  // ---- 蓝膜球场顶棚（OSM way/497324863 一带，卫星图可见大跨蓝色膜结构）----
  {
    const m = MEMBRANE;
    batches.membrane.box(m.cx, 9.5, m.cz, m.w, 0.6, m.d, m.angle);
    // 支撑柱
    for (const s of [-1, 1]) {
      for (const r of [-1, 1]) {
        const px = m.cx + s * m.w * 0.42 * Math.cos(m.angle) - r * m.d * 0.4 * Math.sin(m.angle);
        const pz = m.cz + s * m.w * 0.42 * Math.sin(m.angle) + r * m.d * 0.4 * Math.cos(m.angle);
        batches.metal.box(px, 0, pz, 0.7, 9.5, 0.7, m.angle);
      }
    }
  }

  // ---- 校园绿化：银杏/梧桐行道树（育华路、银杏大道）----
  {
    // 育华楼前广场两侧
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const tx = 1078 + s * 11, tz = 8 + i * 10;
        batches.trunk.box(tx, 0, tz, 0.5, 4.2, 0.5, 0);
        batches.tree.box(tx, 3.6, tz, 3.8, 3.6, 3.8, 0);
      }
    }
    // 教学区主轴
    for (let i = 0; i < 6; i++) {
      const tz = -30 - i * 14;
      for (const s of [-1, 1]) {
        const tx = 1030 + s * 8;
        batches.trunk.box(tx, 0, tz, 0.45, 3.8, 0.45, 0);
        batches.tree.box(tx, 3.3, tz, 3.2, 3.2, 3.2, 0);
      }
    }
    // 宿舍区行道树
    for (let i = 0; i < 5; i++) {
      const tx = 1150, tz = -330 - i * 12;
      batches.trunk.box(tx, 0, tz, 0.45, 3.6, 0.45, 0);
      batches.tree.box(tx, 3.1, tz, 3.0, 3.0, 3.0, 0);
    }
    // 楼前绿篱
    for (const item of matched) {
      if (item.role === 'dorm' || item.role === 'teaching') {
        const r = item.rect;
        const fy = 0;
        for (const s of [-1, 1]) {
          const hx = r.cx + r.vx * s * (r.W / 2 + 1.6), hz = r.cz + r.vz * s * (r.W / 2 + 1.6);
          batches.hedge.box(hx, fy, hz, r.L * 0.7, 0.75, 0.9, -Math.atan2(r.uz, r.ux));
        }
      }
    }
  }

  // ---- 文化节点（2026-11-14 实拍：智慧门/四风广场/紫藤长廊/校史馆/印咸书屋/科技楼）----
  // 依据美篇《永远的沭中》实拍（图在题注前，已交叉验证）与校园十佳景点文字。
  {
    const nameQuad = (text, x, y, z, w, h, ry, bg, fg, vertical) => {
      const tex = nameTexture(text, bg || '#222831', fg || '#d4af37', vertical);
      if (!tex) return;
      const mat = new THREE.MeshBasicNodeMaterial({ map: tex });
      const nb = createBatch(mat, '沭中·刻字');
      const cs = Math.cos(ry), sn = Math.sin(ry);
      const hw = w / 2;
      nb.quad(
        [x - hw * cs, y, z + hw * sn], [x + hw * cs, y, z - hw * sn],
        [x + hw * cs, y + h, z - hw * sn], [x - hw * cs, y + h, z + hw * sn],
        [sn, 0, cs]
      );
      const m = nb.build();
      if (m) group.add(m);
    };

    // 1) 智慧之门（钟书园，80 周年校庆县政府赠建；实拍：金色书卷弧列+圆柱"敦品励学"+太阳光芒镂空）
    //    位置为游记顺序推断：泰山石/四风广场西侧，向右偏转 30° 面向西大门。
    {
      const gx = 1052, gz = 30, gry = -0.52;
      const cs = Math.cos(gry), sn = Math.sin(gry);
      const at = (u, v) => [gx + u * cs + v * sn, gz - u * sn + v * cs];
      // 紫红瓷砖三层台阶平台
      batches.redStone.box(gx, 0, gz, 13, 0.36, 9, gry);
      batches.redStone.box(gx, 0.36, gz, 11.6, 0.36, 7.6, gry);
      batches.redStone.box(gx, 0.72, gz, 10.2, 0.36, 6.2, gry);
      // 九片书卷铜板（弧形排列）
      for (let i = 0; i < 9; i++) {
        const t = (i - 4) / 4;                       // -1..1
        const a = t * 0.62;
        const bx = Math.sin(a) * 4.6, bz = Math.cos(a) * 1.6 - 1.4;
        const p = at(bx, bz);
        batches.bronze.box(p[0], 1.08, p[1], 0.42, 4.6 - Math.abs(t) * 0.9, 3.2, gry + a);
      }
      // 中央圆柱（"敦品励学"）
      const c0 = at(0, -1.2);
      batches.bronze.box(c0[0], 1.08, c0[1], 2.1, 5.2, 2.1, gry);
      nameQuad('敦品励学', c0[0], 2.2, c0[1] + 1.08, 1.7, 2.8, gry, '#7c5c2e', '#e8cf8e', true);
      // 右侧太阳光芒镂空圆板
      const s0 = at(4.0, -0.6);
      batches.bronze.box(s0[0], 1.08, s0[1], 0.38, 4.2, 3.4, gry + 0.35);
      batches.goldPlate.box(s0[0] + 0.25 * sn, 3.1, s0[1] + 0.25 * cs, 0.22, 1.5, 1.5, gry + 0.35);
      // 前景说明牌（绿底金字"智慧之门"）
      const q0 = at(0, 4.2);
      batches.metal.box(q0[0], 0, q0[1], 0.12, 1.05, 0.12, gry);
      batches.darkBoard.box(q0[0], 1.0, q0[1], 3.0, 1.25, 0.16, gry);
      nameQuad('智慧之门', q0[0], 1.18, q0[1] + 0.1, 2.5, 0.85, gry, '#2c3a44', '#d4af37', false);
    }

    // 2) 四风广场碑刻 ×4（政风/教风/学风/校风，红色斜面石碑金字；实拍 sifeng.jpg）
    {
      const steles = [
        { dx: -13, dz: -11, text: '严 细 实 恒', cap: '政风' },
        { dx: 13, dz: -11, text: '博学 严谨 热忱 奉献', cap: '教风' },
        { dx: -13, dz: 11, text: '忠诚 刻苦 科学 进取', cap: '学风' },
        { dx: 13, dz: 11, text: '团结 拼搏 求实 创新', cap: '校风' }
      ];
      for (const st of steles) {
        const sx = FORECOURT.cx + st.dx, sz = FORECOURT.cz + st.dz;
        const ry = Math.atan2(FORECOURT.cz - sz, FORECOURT.cx - sx) + Math.PI / 2;
        batches.plaza.box(sx, 0.06, sz, 5.2, 0.12, 4.2, ry);
        batches.redStone.box(sx, 0.12, sz, 4.4, 0.85, 1.0, ry);
        // 斜面碑身
        batches.redStone.box(sx, 0.95, sz, 4.2, 1.5, 0.62, ry);
        nameQuad(st.cap, sx, 1.05, sz + 0.4, 1.2, 0.62, ry, '#8e3a2e', '#e8cf8e', false);
        nameQuad(st.text, sx, 1.72, sz + 0.4, 3.6, 0.62, ry, '#8e3a2e', '#e8cf8e', false);
      }
    }

    // 3) 泰山石"弘毅致和"红字（实拍 taishan.jpg：米黄石背刻红字，环形草坪+石缘）
    {
      const sc = FORECOURT;
      nameQuad('弘毅致和', sc.cx - 0.6, 2.2, sc.cz - 1.65, 5.0, 1.5, Math.PI, '#8a8478', '#c23a2a', false);
      // 石缘环 + 红灰格铺装
      const curbSeg = 28;
      for (let i = 0; i < curbSeg; i++) {
        const a0 = (i / curbSeg) * Math.PI * 2, a1 = ((i + 1) / curbSeg) * Math.PI * 2;
        const r = sc.r * 0.72;
        const cx0 = sc.cx + Math.cos(a0) * r, cz0 = sc.cz + Math.sin(a0) * r * 0.82;
        const cx1 = sc.cx + Math.cos(a1) * r, cz1 = sc.cz + Math.sin(a1) * r * 0.82;
        batches.trackLine.box((cx0 + cx1) / 2, 0.13, (cz0 + cz1) / 2,
          0.25, 0.1, Math.hypot(cx1 - cx0, cz1 - cz0) + 0.2, -Math.atan2(cz1 - cz0, cx1 - cx0));
      }
    }

    // 4) 紫藤长廊 ×2（育华楼南北各一；实拍 ziteng-lang.jpg：白方柱+红褐栏凳+绿藤棚）
    for (const perg of [{ cx: 1070, cz: 48, len: 46 }, { cx: 1070, cz: -58, len: 46 }]) {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const px = perg.cx - perg.len / 2 + (perg.len / (n - 1)) * i;
        batches.parapet.box(px, 0, perg.cz, 0.55, 3.1, 0.55, 0);
        if (i < n - 1) {
          const mx = px + perg.len / (n - 1) / 2;
          // 红褐坐凳栏板
          batches.door.box(mx, 0, perg.cz, perg.len / (n - 1) - 0.55, 0.5, 0.62, 0);
          batches.door.box(mx, 1.05, perg.cz, perg.len / (n - 1) - 0.55, 0.42, 0.22, 0);
        }
      }
      // 纵梁 + 藤棚
      batches.parapet.box(perg.cx, 3.1, perg.cz, perg.len + 1, 0.28, 0.4, 0);
      batches.hedge.box(perg.cx, 3.45, perg.cz, perg.len + 1.4, 0.55, 3.2, 0);
      batches.hedge.box(perg.cx, 3.85, perg.cz, perg.len * 0.94, 0.4, 2.4, 0);
    }

    // 5) 校史馆院门（实拍 wutong.jpg：灰砖门楼+黑匾金字+黑底对联+粉墙花格窗）
    {
      const hx = 895, hz = -62, hry = 0;   // historic 楼（895,-89）南侧院门
      // 门柱 + 门楼
      batches.wallBrick.box(hx - 2.6, 0, hz, 1.5, 4.4, 1.4, hry);
      batches.wallBrick.box(hx + 2.6, 0, hz, 1.5, 4.4, 1.4, hry);
      batches.wallBrick.box(hx, 3.9, hz, 6.7, 1.1, 1.4, hry);
      batches.roofGrey.box(hx, 5.0, hz, 7.3, 0.35, 2.1, hry);
      batches.darkBoard.box(hx, 4.05, hz + 0.75, 3.6, 0.95, 0.12, hry);
      nameQuad('校史馆', hx, 4.12, hz + 0.82, 3.1, 0.78, hry, '#2a2622', '#d4af37', false);
      // 对联
      nameQuad('校垂典范 史载春秋', hx + 2.6, 1.4, hz + 0.78, 1.1, 2.6, hry, '#2a2622', '#d4af37', true);
      nameQuad('弘毅驰千里 致和惠万家', hx - 2.6, 1.4, hz + 0.78, 1.1, 2.6, hry, '#2a2622', '#d4af37', true);
      // 粉墙 + 花格窗（两侧）
      for (const s of [-1, 1]) {
        batches.wallLight.box(hx + s * 9, 1.6, hz, 11, 3.2, 0.5, hry);
        for (let k = 0; k < 3; k++) {
          batches.darkBoard.box(hx + s * (5.5 + k * 3.2), 1.1, hz + 0.3, 1.7, 1.7, 0.12, hry);
        }
      }
      // 门前苏铁盆栽 ×2
      for (const s of [-1, 1]) {
        batches.flower.box(hx + s * 4.4, 0, hz + 2.2, 1.2, 0.55, 1.2, 0);
        batches.tree.box(hx + s * 4.4, 0.55, hz + 2.2, 1.6, 1.3, 1.6, 0);
      }
    }

    // 6) 大礼堂南门"印咸书屋"（实拍 dalitang.jpg：黑匾金字+红格栅门+对联+米黄条砖柱）
    {
      const ax = 940, az = -88 + 30.5;   // auditorium 楼（940,-88）南入口
      batches.base.box(ax, 0, az, 7.2, 3.6, 1.2, 0);
      batches.base.box(ax - 3.4, 0, az, 1.1, 3.9, 1.5, 0);
      batches.base.box(ax + 3.4, 0, az, 1.1, 3.9, 1.5, 0);
      batches.darkBoard.box(ax, 3.15, az + 0.75, 4.6, 1.15, 0.14, 0);
      nameQuad('印咸书屋', ax, 3.25, az + 0.85, 4.1, 0.92, 0, '#2a2622', '#d4af37', false);
      nameQuad('精神到处文章老', ax + 3.4, 1.15, az + 0.85, 1.05, 2.5, 0, '#2a2622', '#d4af37', true);
      nameQuad('学问深时意气平', ax - 3.4, 1.15, az + 0.85, 1.05, 2.5, 0, '#2a2622', '#d4af37', true);
      // 红格栅双开门
      batches.redFrame.box(ax - 1.35, 0, az + 0.62, 2.5, 3.0, 0.14, 0);
      batches.redFrame.box(ax + 1.35, 0, az + 0.62, 2.5, 3.0, 0.14, 0);
      for (let k = 0; k < 5; k++) {
        batches.goldPlate.box(ax - 1.35, 0.45 + k * 0.56, az + 0.72, 2.3, 0.07, 0.06, 0);
        batches.goldPlate.box(ax + 1.35, 0.45 + k * 0.56, az + 0.72, 2.3, 0.07, 0.06, 0);
      }
      // 东侧红钢花架（dlt-south.jpg）
      for (let i = 0; i < 5; i++) {
        batches.redStone.box(ax + 6.5 + i * 2.2, 0, az - 4, 0.22, 3.2, 0.22, 0);
      }
      batches.redStone.box(ax + 10.9, 3.2, az - 4, 11, 0.2, 0.22, 0);
      batches.hedge.box(ax + 10.9, 3.5, az - 4, 11, 0.5, 1.6, 0);
    }

    // 7) 科技楼（lowWide 1066,-171 推断绑定；实拍 ziteng.jpg：绿玻璃竖带+金字楼名+弧形门廊）
    {
      const item = matched.find(m => Math.abs(m.cx - 1066) < 15 && Math.abs(m.cz + 171) < 15);
      if (item) {
        const { cx, cz, ux, uz, vx, vz, L, W, } = item.rect;
        const ry = -Math.atan2(uz, ux);
        const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
        // 绿玻璃竖带（面向南侧大道）
        const g0 = at(0, W / 2 + 0.18);
        batches.wallBlue.box(g0.x, 0, g0.z, 6.5, item.building.height, 0.22, ry);
        const g1 = at(0, W / 2 + 0.32);
        batches.glass.box(g1.x, 0.8, g1.z, 5.6, item.building.height - 1.4, 0.18, ry);
        nameQuad('科技楼', g1.x, item.building.height - 5.6, g1.z + 0.2, 1.6, 4.6, ry, '#2e5d4a', '#d4af37', true);
        // 弧形入口雨棚 + 红字
        const e = at(0, W / 2 + 2.6);
        batches.parapet.box(e.x, 4.2, e.z, 12, 0.45, 4.6, ry);
        batches.base.box(e.x, 0, e.z, 11, 0.5, 3.8, ry);
        for (const s of [-1, 1]) {
          const p = at(s * 4.8, W / 2 + 4.2);
          batches.parapet.box(p.x, 0, p.z, 0.8, 4.2, 0.8, ry);
        }
        nameQuad('报告厅', e.x, 4.75, e.z + 1.2, 4.8, 1.2, ry, '#c9ccd0', '#a83226', false);
      }
    }

    // 8) 培源楼风格（实拍 peiyuan.jpg）：白墙+拱券外廊+红标语带+红顶塔楼
    for (const item of matched) {
      if (item.role !== 'teachingBlock') continue;
      const { cx, cz, ux, uz, vx, vz, L, W } = item.rect;
      const ry = -Math.atan2(uz, ux);
      const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
      const top = item.building.height;
      // 拱券外廊（每层 5 个拱）
      for (let f = 1; f < Math.max(2, Math.round(top / FLOOR_H)); f++) {
        const y = f * FLOOR_H;
        for (let k = 0; k < 5; k++) {
          const u = -L * 0.36 + k * (L * 0.18);
          const p = at(u, W / 2 + 0.55);
          batches.wallLight.box(p.x, y, p.z, L * 0.15, 1.15, 0.5, ry);   // 拱腹
          batches.wallLight.box(p.x, y + 1.15, p.z, L * 0.15, 0.55, 0.5, ry);
          for (const s of [-1, 1]) {
            const q = at(u + s * L * 0.075, W / 2 + 0.55);
            batches.wallLight.box(q.x, y, q.z, 0.35, 2.6, 0.5, ry);
          }
        }
        // 红标语带
        const s0 = at(0, W / 2 + 0.75);
        batches.redStone.box(s0.x, y + 1.35, s0.z, L * 0.78, 0.62, 0.12, ry);
      }
      // 端部红顶塔楼
      const t0 = at(-L / 2 + 2.4, 0);
      batches.wallLight.box(t0.x, 0, t0.z, 5.2, top + 2.2, 5.2, ry);
      batches.redStone.box(t0.x, top + 2.2, t0.z, 6.0, 2.4, 6.0, ry);
      const t1 = at(-L / 2 + 2.4, 0);
      batches.roofBlue.box(t1.x, top + 4.4, t1.z, 1.2, 1.2, 1.2, ry);
    }

    // 9) 校门区消防车道标线（实拍 highschool-amap-2.jpg：黄色网线+"消防车道 禁止占用"）
    {
      const gx = 998, gz = 40;
      for (let i = -2; i <= 2; i++) {
        batches.goldPlate.box(gx + i * 3.2, 0.08, gz + 6, 0.28, 0.03, 12, 0);
        batches.goldPlate.box(gx, 0.08, gz + 6 + i * 3.0, 14, 0.03, 0.28, 0);
      }
      nameQuad('消防车道 禁止占用', gx, 0.1, gz + 6, 11, 1.4, Math.PI, '#5a5a52', '#e8c23a', false);
    }
  }

  // 组装
  for (const batch of Object.values(batches)) {
    const mesh = batch.build();
    if (mesh) group.add(mesh);
  }

  group.userData = {
    photoBasis: 'AMap satellite/standard 2026-11-13 + 育华楼/大礼堂/校门实拍 + 美篇游记 + 百科道路命名表；楼宇名称与窗格为类型化估计',
    stats,
    campusNote: '本部23栋来源楼体全部保留原轮廓；育华楼山花/金字、大礼堂1961青砖坡顶、教学楼外廊灰面砖、宿舍密窗、400m跑道均按实景类型还原，不是逐栋测绘'
  };
  root.add(group);
  return { group, stats };
}

export { buildMizhongCampus };
