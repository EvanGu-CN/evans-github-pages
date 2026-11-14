import * as THREE from 'three/webgpu';
import { REAL_BUILDINGS } from './building-geodata.js';
import { NEIGHBORHOODS, ROADS } from './city-config.js';

// 八一·文枢院（沭城街道公园西路北侧、柴沂北路东侧）街区精细化。
//
// 依据：2026-11-13 取得的高德 zoom-18 标准图与卫星瓦片（官方未公开拍摄日，查询日不等于拍摄日）、
// 2026-02-13 沭阳县自然资源和规划局《八一文枢院小区三期工程21#—23#楼沿街2层商铺规划变更公示》、
// 法院拍卖公告（11幢/19幢在售，5层无电梯、约130㎡三室）。
// 图上可辨：南北向板楼成排、白色平屋顶与深色楼梯间/设备房、南向成组阳台、楼间停车与绿化；
// 公园西路一侧有沿街两层商铺，小区南门与售楼处在公园西路北侧。
//
// 本模块只在既有来源轮廓上叠加立面与场地构件，不新增也不替换任何楼体：
// 楼梯间数量、阳台排数、店招文字、车位划线都是类型化展示估计，不是逐栋测绘，
// 店招也不代表实际商户。原楼体仍由 buildings.js 渲染，本模块构件盖在其上。

const NEIGHBOURHOOD_NAME = '八一·文枢院';
const STREET_NAME = '公园西路';
const GATE_LABEL = { x: -732, z: -1128 };   // 南门：地图标注投影到小区南界（近似）
const SALES_OFFICE = { x: -732, z: -1142 }; // 售楼处：地图标注点位
const FLOOR_HEIGHT = 3.0;

// 类型化店招：两层沿街商铺的门头用语，不代表实际商户。
const SHOP_NAMES = [
  '便利店', '生鲜超市', '药房', '面馆', '理发', '快递驿站',
  '五金', '母婴', '洗衣', '早点', '烟酒', '水果',
  '手机维修', '熟食', '茶叶', '文具'
];
const SHOP_COLOURS = [
  ['#8f2f26', '#f6e6c8'], ['#1f4f63', '#eef4f1'], ['#2f5d3a', '#f2f0dd'],
  ['#8a5b21', '#fdf3dd'], ['#3a3f46', '#f4d977'], ['#7b2f4a', '#fbe9ee']
];

const CANVAS = typeof document !== 'undefined' && !!document.createElement;

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
function pointInRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// 最小面积外接矩形：长轴决定阳台与楼梯间排布方向，短轴决定进深。
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
      best = { ux: along.x, uz: along.z, vx: across.x, vz: across.z, L, W, area,
        cx: cu * ux + cv * vx, cz: cu * uz + cv * vz };
    }
  }
  return best;
}

// 最近的具名道路（含方向），用于判断底层商铺的临街面。
function nearestRoadHit(x, z, maxDistance) {
  let best = null;
  for (const road of ROADS) {
    if (!road.name || road.kind === 'service' || road.bridge) continue;
    for (let i = 0; i + 1 < road.pts.length; i++) {
      const a = road.pts[i], b = road.pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      const px = a.x + t * dx, pz = a.z + t * dz;
      const d = Math.hypot(px - x, pz - z);
      if (d > maxDistance || (best && d >= best.dist)) continue;
      best = { road, dist: d, toRoadX: (px - x) / (d || 1), toRoadZ: (pz - z) / (d || 1) };
    }
  }
  return best;
}

// 逐材质累积三角面；每种材质最后只留一个网格，交给场景统一的静态批处理。
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
  // 按期望的外法线方向自动选择绕向，避免背面剔除后出现空洞。
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
  // 长方体：y 为底面标高，ry 绕 Y 旋转；w 沿本地 x，d 沿本地 z。
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

// 一句式店招图集：16 个类型名共用一个材质，招牌面只改 UV。
function signAtlas() {
  const cols = 4, rows = 4, cell = 256;
  if (!CANVAS) return { texture: null, uvFor: () => [0, 0, 1, 1] };
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell; canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  SHOP_NAMES.forEach((text, i) => {
    const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
    const [bg, fg] = SHOP_COLOURS[i % SHOP_COLOURS.length];
    ctx.fillStyle = bg; ctx.fillRect(cx, cy, cell, cell);
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 4;
    ctx.strokeRect(cx + 6, cy + 6, cell - 12, cell - 12);
    ctx.fillStyle = fg;
    ctx.font = `700 ${text.length > 3 ? 62 : 76}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx + cell / 2, cy + cell / 2 + 4, cell - 26);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return {
    texture,
    uvFor: (i) => {
      const u0 = (i % cols) / cols, v1 = 1 - Math.floor(i / cols) / rows;
      return [u0, v1 - 1 / rows, u0 + 1 / cols, v1];
    }
  };
}

// 小区名牌图集：售楼处与南门共用“八一文枢院”题字。
function namePlate() {
  if (!CANVAS) return { texture: null, uv: [0, 0, 1, 1] };
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2c2b28'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#c8b78c'; ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 108);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = '700 72px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('八一文枢院', 256, 68, 470);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, uv: [0, 0, 1, 1] };
}

function buildBayiDistrict(root) {
  const neighbourhood = NEIGHBORHOODS.find(n => n.name === NEIGHBOURHOOD_NAME);
  if (!neighbourhood) return null;
  const rings = neighbourhood.polygons.map(p => p.outer);
  const holes = neighbourhood.polygons.map(p => p.holes || []);
  const inside = (x, z) => rings.some((ring, i) =>
    pointInRing(ring, x, z) && !holes[i].some(h => pointInRing(h, x, z)));

  // 板楼取住宅来源；售楼处/附属房（6-8 m）另行布置，不套用住宅立面。
  const buildings = REAL_BUILDINGS.filter(b =>
    b.category === 'residential' && b.height >= 8.5 && b.polygons[0] && inside(b.cx, b.cz));
  const support = REAL_BUILDINGS.filter(b =>
    b.height < 8.5 && b.polygons[0] && inside(b.cx, b.cz));
  if (!buildings.length) return null;

  const group = new THREE.Group();
  group.name = '街区·八一文枢院';

  const std = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.86, ...o });
  const M = {
    wall: std(0xe4e0d6),          // 浅色涂料外墙
    plinth: std(0x9a948a, { roughness: 0.92 }),
    trim: std(0xf1efe8, { roughness: 0.8 }),   // 檐口/女儿墙压顶（图上白色屋缘）
    parapet: std(0xd8d4c9, { roughness: 0.85 }),
    roofDeck: std(0xc9c5ba, { roughness: 0.94 }),
    core: std(0x5d6670, { roughness: 0.72 }),   // 楼梯间/设备房（图上深色屋面构件）
    coreTrim: std(0x8b939c, { roughness: 0.7 }),
    slab: std(0xdcd8ce, { roughness: 0.82 }),
    balcony: std(0xcfcabf, { roughness: 0.86 }),
    rail: std(0x8b939c, { roughness: 0.5, metalness: 0.32 }),
    glass: std(0x41606c, { roughness: 0.2, metalness: 0.42 }),
    door: std(0x4a4038, { roughness: 0.7 }),
    frame: std(0x8d9490, { roughness: 0.45, metalness: 0.45 }),
    shopBase: std(0x2a2d2e, { roughness: 0.75 }),
    awning: std(0x8f3f36, { roughness: 0.9 }),
    tank: std(0xd3cec0, { roughness: 0.7 }),
    solar: std(0x273640, { roughness: 0.35, metalness: 0.3 }),
    hedge: std(0x4f6b40, { roughness: 0.96 }),
    hedgeLight: std(0x5d7a48, { roughness: 0.96 }),
    grass: std(0x5b7648, { roughness: 0.98 }),
    apron: std(0xaaa497, { roughness: 0.94 }),
    stone: std(0xb9b2a4, { roughness: 0.92 }),
    paint: std(0x2e2c28, { roughness: 0.85 })
  };
  const atlas = signAtlas();
  M.sign = new THREE.MeshBasicNodeMaterial(atlas.texture ? { map: atlas.texture } : { color: 0x233038 });
  const plate = namePlate();
  M.plate = new THREE.MeshBasicNodeMaterial(plate.texture ? { map: plate.texture } : { color: 0x2c2b28 });

  const batches = {
    wall: createBatch(M.wall, '文枢院·墙身'),
    plinth: createBatch(M.plinth, '文枢院·勒脚'),
    trim: createBatch(M.trim, '文枢院·檐口'),
    parapet: createBatch(M.parapet, '文枢院·女儿墙'),
    roofDeck: createBatch(M.roofDeck, '文枢院·屋面'),
    core: createBatch(M.core, '文枢院·楼梯间'),
    coreTrim: createBatch(M.coreTrim, '文枢院·楼梯间压顶'),
    slab: createBatch(M.slab, '文枢院·阳台板'),
    balcony: createBatch(M.balcony, '文枢院·阳台栏板'),
    rail: createBatch(M.rail, '文枢院·阳台扶手'),
    glass: createBatch(M.glass, '文枢院·门窗玻璃'),
    door: createBatch(M.door, '文枢院·单元门'),
    frame: createBatch(M.frame, '文枢院·门窗框'),
    shopBase: createBatch(M.shopBase, '文枢院·店招底板'),
    awning: createBatch(M.awning, '文枢院·雨棚'),
    tank: createBatch(M.tank, '文枢院·水箱'),
    solar: createBatch(M.solar, '文枢院·太阳能'),
    hedge: createBatch(M.hedge, '文枢院·绿篱'),
    hedgeLight: createBatch(M.hedgeLight, '文枢院·绿篱浅'),
    grass: createBatch(M.grass, '文枢院·楼前草地'),
    apron: createBatch(M.apron, '文枢院·楼前铺装'),
    stone: createBatch(M.stone, '文枢院·门柱'),
    paint: createBatch(M.paint, '文枢院·铁艺'),
    sign: createBatch(M.sign, '文枢院·店招'),
    plate: createBatch(M.plate, '文枢院·名牌')
  };

  const stats = {
    buildings: 0, parapets: 0, roofCores: 0, tanks: 0, solarPanels: 0,
    balconies: 0, entrances: 0, hedges: 0, groundStrips: 0,
    shopEdges: 0, signs: 0, gates: 0
  };
  const records = [];

  for (const b of buildings) {
    const polygon = b.polygons[0];
    const ring = polygon.outer;
    if (!ring || ring.length < 3 || b.height < 6) continue;
    const rect = orientedRect(ring);
    if (!rect || rect.L < 8 || rect.W < 4) continue;
    const height = b.height;
    const top = height + 0.22;
    const rand = mulberry32((b.seed || 1) * 7919 + Math.round(b.cx * 13 + b.cz * 7));
    const floors = Math.max(1, Math.min(9, Math.round((height - 0.22) / FLOOR_HEIGHT)));
    const storey = (height - 0.22) / floors;
    stats.buildings++;

    const { cx, cz, ux, uz, vx, vz, L, W } = rect;
    const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
    const ry = -Math.atan2(uz, ux);
    const record = { cx: +cx.toFixed(1), cz: +cz.toFixed(1), h: height, floors, cores: 0, balconyRows: 0 };
    records.push(record);

    // ---- 1. 平屋面：屋面面层 + 四周女儿墙 + 白色压顶（图上白色屋缘） ----
    {
      const inset = 0.12;
      const deck = at(0, 0);
      batches.roofDeck.box(deck.x, top, deck.z, Math.max(1, L - 0.24), 0.02, Math.max(1, W - 0.24), ry);
      // 女儿墙沿外圈每条边
      const areaSign = signedArea(ring) > 0 ? 1 : -1;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length];
        const dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz);
        if (len < 2) continue;
        const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
        const nx = areaSign * dz / len, nz = -areaSign * dx / len;
        const eRy = -Math.atan2(dz, dx);
        batches.parapet.box(mx + nx * inset, top, mz + nz * inset, len, 0.62, 0.22, eRy);
        batches.trim.box(mx + nx * inset, top + 0.62, mz + nz * inset, len + 0.04, 0.09, 0.3, eRy);
        stats.parapets++;
      }
    }

    // ---- 2. 屋顶楼梯间/设备房：按单元开间排布（图上深色屋面构件） ----
    {
      const coreCount = Math.max(1, Math.round(L / 16));
      const pitch = L / coreCount;
      for (let k = 0; k < coreCount; k++) {
        const u = -L / 2 + pitch * (k + 0.5);
        const p = at(u, (rand() < 0.5 ? -1 : 1) * W * 0.12);
        const w = 2.6 + rand() * 0.8, d = 2.8 + rand() * 0.7, h = 2.15 + rand() * 0.35;
        batches.core.box(p.x, top + 0.02, p.z, w, h, d, ry);
        batches.coreTrim.box(p.x, top + 0.02 + h, p.z, w + 0.16, 0.1, d + 0.16, ry);
        // 楼梯间出屋面门
        const dr = at(u, (W / 2 - 0.6) * Math.sign(p.cz - cz || 1));
        batches.door.box(dr.x, top + 0.02, dr.z, 1.0, 2.0, 0.1, ry);
        stats.roofCores++;
        record.cores++;
      }
      // 水箱与太阳能：图上部分屋面有成排深色板与圆柱
      if (W > 7) {
        const t = at(-L * 0.28, 0);
        batches.tank.box(t.x, top + 0.02, t.z, 1.7, 1.5, 1.7, ry);
        batches.tank.box(t.x, top + 1.52, t.z, 1.85, 0.12, 1.85, ry);
        stats.tanks++;
        const rows = 2 + Math.floor(rand() * 2);
        for (let s = 0; s < rows; s++) {
          const p = at(L * 0.05 + s * 2.3, -W * 0.14);
          batches.solar.box(p.x, top + 0.32, p.z, 1.95, 0.09, 1.35, ry - 0.16);
          batches.frame.box(p.x, top + 0.02, p.z, 0.1, 0.3, 1.35, ry);
          stats.solarPanels++;
        }
      }
    }

    // ---- 3. 南向阳台：长边朝南/北的板楼逐层重复（图上成组阳台） ----
    const longEdgeFacesSouth = vz > 0.5;
    const longEdgeFacesNorth = vz < -0.5;
    if (L >= 12 && floors >= 2 && (longEdgeFacesSouth || longEdgeFacesNorth)) {
      const bayCount = Math.max(1, Math.round(L / 8.6));
      const bayPitch = L / bayCount;
      const balconyW = Math.max(2.2, Math.min(3.4, bayPitch / 2 - 1.0));
      const depth = 1.2;
      const vSign = longEdgeFacesSouth ? 1 : -1;
      for (let bay = 0; bay < bayCount; bay++) {
        const bcx = -L / 2 + bayPitch * (bay + 0.5);
        for (const off of [-bayPitch / 4, bayPitch / 4]) {
          const u = bcx + off;
          for (let f = 1; f < floors; f++) {
            const y = 0.22 + f * storey;
            const p = at(u, vSign * (W / 2 + depth / 2));
            batches.slab.box(p.x, y, p.z, balconyW, 0.13, depth, ry);
            const r = at(u, vSign * (W / 2 + depth - 0.05));
            batches.balcony.box(r.x, y + 0.13, r.z, balconyW, 0.95, 0.1, ry);
            batches.rail.box(r.x, y + 1.08, r.z, balconyW, 0.07, 0.15, ry);
            for (const s of [-1, 1]) {
              const q = at(u + s * (balconyW / 2 - 0.05), vSign * (W / 2 + depth / 2));
              batches.balcony.box(q.x, y + 0.13, q.z, 0.1, 0.95, depth - 0.1, ry);
            }
            stats.balconies++;
          }
        }
      }
      record.balconyRows = Math.max(0, floors - 1);
    }

    // ---- 4. 单元门、雨棚与台阶（背向阳台的一侧） ----
    if (floors >= 2 && L >= 12 && (longEdgeFacesSouth || longEdgeFacesNorth)) {
      const bayCount = Math.max(1, Math.round(L / 9.0));
      const bayPitch = L / bayCount;
      const vSign = longEdgeFacesSouth ? -1 : 1;
      for (let bay = 0; bay < bayCount; bay++) {
        const u = -L / 2 + bayPitch * (bay + 0.5);
        const d = at(u, vSign * (W / 2 + 0.05));
        batches.door.box(d.x, 0.22, d.z, 1.2, 2.3, 0.12, ry);
        const c = at(u, vSign * (W / 2 + 0.58));
        batches.trim.box(c.x, 2.6, c.z, 2.7, 0.13, 1.2, ry);
        const s = at(u, vSign * (W / 2 + 0.4));
        batches.plinth.box(s.x, 0.22, s.z, 2.3, 0.15, 0.72, ry);
        stats.entrances++;
      }
      // 单元门之间绿篱与楼前草地/铺装
      for (let k = 1; k < bayCount; k++) {
        const p = at(-L / 2 + bayPitch * k, vSign * (W / 2 + 2.0));
        const batch = k % 2 ? batches.hedge : batches.hedgeLight;
        batch.box(p.x, 0.22, p.z, Math.min(5.2, bayPitch * 0.5), 0.58, 0.85, ry);
        stats.hedges++;
      }
      const g = at(0, vSign * (W / 2 + 2.0));
      batches.grass.box(g.x, 0.232, g.z, Math.max(6, L - 2), 0.02, 2.3, ry);
      const a = at(0, vSign * (W / 2 + 0.85));
      batches.apron.box(a.x, 0.236, a.z, Math.max(6, L - 2), 0.02, 1.5, ry);
      stats.groundStrips++;
    }

    // ---- 5. 公园西路沿街两层商铺：2026-02 规划公示 21#—23#楼沿街商铺 ----
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz);
      if (len < 6) continue;
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
      const areaSign = signedArea(ring) > 0 ? 1 : -1;
      const nx = areaSign * dz / len, nz = -areaSign * dx / len;
      const hit = nearestRoadHit(mx, mz, 40);
      if (!hit || hit.road.name !== STREET_NAME) continue;
      if (hit.dist > hit.road.w / 2 + 22) continue;
      if (nx * hit.toRoadX + nz * hit.toRoadZ < 0.25) continue;
      const eRy = -Math.atan2(dz, dx);
      const shopW = len - 0.8;
      if (shopW < 4) continue;
      stats.shopEdges++;
      // 一层玻璃门面 + 勒脚 + 竖梃
      batches.glass.box(mx + nx * 0.12, 0.22, mz + nz * 0.12, shopW, 2.95, 0.1, eRy);
      batches.plinth.box(mx + nx * 0.13, 0.22, mz + nz * 0.13, shopW, 0.42, 0.16, eRy);
      const tx = dx / len, tz = dz / len;
      for (let u = -shopW / 2; u <= shopW / 2 + 0.01; u += 1.8) {
        batches.frame.box(mx + tx * u + nx * 0.18, 0.22, mz + tz * u + nz * 0.18, 0.09, 2.95, 0.14, eRy);
      }
      batches.frame.box(mx + nx * 0.18, 2.72, mz + nz * 0.18, shopW, 0.08, 0.14, eRy);
      // 店招带（一层顶）与二层窗带：公示为两层商铺
      batches.shopBase.box(mx + nx * 0.18, 3.18, mz + nz * 0.18, shopW, 0.95, 0.3, eRy);
      batches.glass.box(mx + nx * 0.13, 4.35, mz + nz * 0.13, shopW - 0.4, 1.5, 0.1, eRy);
      batches.frame.box(mx + nx * 0.16, 4.35, mz + nz * 0.16, shopW - 0.4, 1.56, 0.13, eRy);
      batches.trim.box(mx + nx * 0.14, 6.0, mz + nz * 0.14, shopW + 0.1, 0.16, 0.42, eRy);
      const signCount = Math.max(1, Math.round(shopW / 4.4));
      const signW = shopW / signCount;
      for (let s = 0; s < signCount; s++) {
        const u = -shopW / 2 + signW * (s + 0.5);
        const px = mx + tx * u + nx * 0.36, pz = mz + tz * u + nz * 0.36;
        const idx = Math.floor(rand() * SHOP_NAMES.length);
        const [u0, v0, u1, v1] = atlas.uvFor(idx);
        const rx = nz, rz = -nx;
        const hw = signW / 2 - 0.1;
        const y0 = 3.22, y1 = 4.08;
        const bl = [px - rx * hw, y0, pz - rz * hw], br = [px + rx * hw, y0, pz + rz * hw];
        const tr = [px + rx * hw, y1, pz + rz * hw], tl = [px - rx * hw, y1, pz - rz * hw];
        batches.sign.quad(bl, br, tr, tl, null, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
        stats.signs++;
      }
      if (rand() < 0.5) {
        const [ax, az] = [mx + nx * 0.78, mz + nz * 0.78];
        batches.awning.box(ax, 4.12, az, Math.min(shopW, 6), 0.1, 1.35, eRy);
      }
    }
  }

  // ---- 6. 南门：门柱 + 门楣名牌（公园西路北侧、售楼处旁） ----
  {
    const g = GATE_LABEL;
    const hit = nearestRoadHit(g.x, g.z, 80);
    const ry = hit ? -Math.atan2(hit.toRoadZ, hit.toRoadX) : 0;
    for (const s of [-1, 1]) {
      const px = g.x + Math.cos(ry) * s * 3.6, pz = g.z + Math.sin(ry) * s * 3.6;
      batches.stone.box(px, 0.22, pz, 1.1, 3.4, 1.1, ry);
      batches.trim.box(px, 3.62, pz, 1.35, 0.18, 1.35, ry);
    }
    batches.stone.box(g.x, 3.5, g.z, 8.3, 0.55, 0.75, ry);
    const uv = plate.uv;
    // 门楣朝向来路的一面贴名牌
    const nx = -Math.sin(ry), nz = Math.cos(ry);
    const w = 5.2, y0 = 3.55, y1 = 4.28;
    const hw = w / 2, rx = Math.cos(ry), rz = Math.sin(ry);
    const bl = [g.x - rx * hw + nx * 0.39, y0, g.z - rz * hw + nz * 0.39];
    const br = [g.x + rx * hw + nx * 0.39, y0, g.z + rz * hw + nz * 0.39];
    const tr = [g.x + rx * hw + nx * 0.39, y1, g.z + rz * hw + nz * 0.39];
    const tl = [g.x - rx * hw + nx * 0.39, y1, g.z - rz * hw + nz * 0.39];
    batches.plate.quad(bl, br, tr, tl, null, [uv.slice(0, 2), [uv[2], uv[1]], uv.slice(2, 4), [uv[0], uv[3]]]);
    // 伸缩门体
    batches.paint.box(g.x, 0.22, g.z, 7.0, 1.5, 0.12, ry);
    batches.apron.box(g.x, 0.228, g.z, 9.5, 0.02, 7.0, ry);
    stats.gates++;
  }

  // ---- 7. 售楼处前场：铺装、旗杆与名牌 ----
  {
    const s = SALES_OFFICE;
    batches.apron.box(s.x + 2, 0.232, s.z + 7, 26, 0.02, 13, -0.42);
    batches.grass.box(s.x + 2, 0.23, s.z + 13.4, 24, 0.02, 2.2, -0.42);
    for (let i = 0; i < 3; i++) {
      const fx = s.x - 8 + i * 2.4, fz = s.z + 4.2;
      batches.paint.box(fx, 0.22, fz, 0.12, 8.2, 0.12, 0);
      batches.paint.box(fx + 0.85, 7.3, fz, 1.7, 0.95, 0.06, 0);
    }
    const uv = plate.uv;
    const rx = Math.cos(-0.42), rz = Math.sin(-0.42);
    const nx = -rz, nz = rx;
    const w = 6.4, y0 = 1.1, y1 = 2.3;
    const hw = w / 2;
    const cxx = s.x + 2 + nx * 6.6, czz = s.z + 7 + nz * 6.6;
    const bl = [cxx - rx * hw + nx * 0.02, y0, czz - rz * hw + nz * 0.02];
    const br = [cxx + rx * hw + nx * 0.02, y0, czz + rz * hw + nz * 0.02];
    const tr = [cxx + rx * hw + nx * 0.02, y1, czz + rz * hw + nz * 0.02];
    const tl = [cxx - rx * hw + nx * 0.02, y1, czz - rz * hw + nz * 0.02];
    batches.plate.quad(bl, br, tr, tl, null, [uv.slice(0, 2), [uv[2], uv[1]], uv.slice(2, 4), [uv[0], uv[3]]]);
  }

  for (const batch of Object.values(batches)) {
    const mesh = batch.build();
    if (mesh) group.add(mesh);
  }
  group.userData = {
    photoBasis: 'AMap zoom-18 standard/satellite tiles 2026-11-13 (capture date unpublished) + 2026-02-13 planning notice for street shops; balcony counts, roof cores and shop names are type estimates',
    stats,
    records,
    gateNote: '南门按地图标注投影到小区南界近似摆放，门址未实测；售楼处前场为展示布置'
  };
  root.add(group);
  return { group, stats };
}

export { buildBayiDistrict };
