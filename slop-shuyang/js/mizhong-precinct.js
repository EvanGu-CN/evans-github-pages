import * as THREE from 'three/webgpu';
import { REAL_BUILDINGS } from './building-geodata.js';

// 沭阳高级中学周边街区精细化（东关大街 / 学府中路沿街、东关实验小学、西大门、二道门）。
//
// 依据：
// - 2026-11-13 高德 zoom-18 标准图 POI 标注（格力专卖店/博今图文/状元书店/北大书店/意林书店/
//   瑞幸咖啡/重庆小面/蜜雪冰城/德克士等沿街店名，为地图标注，查询日不等于标注日）；
// - 美篇《永远的沭中》实拍（图在题注前，与后一条题注配对，已交叉验证）：
//   东关实验小学校门（灰砖拱门+金字校名+LED 屏+阳光文具/金阳光商铺）、
//   西大门（育华楼绿玻璃对景+球顶刻石+霓虹"沭阳中学"旧牌+红字影壁）、
//   二道门 7 号门（暗红方柱+"7 号门"门牌+告示+伸缩门+白铁栅栏）；
// - 沭阳高级中学校门实拍（消防车道黄色网线，已在 mizhong-campus.js 呈现）。
//
// 本模块只在既有来源轮廓上叠加店招/门楼构件，不新增也不替换任何楼体。
// 店招取自地图标注的场所名，与具体门牌的对应为按街序的类型化排布，不代表实际商户。

const CAMPUS_WEST = 873;      // 校园西界（OSM way/1027263212 投影）
const GATE = { x: 998, z: 32 };       // 132 号主校门（已核验入口）
const XI_MEN = { x: 873, z: -5, ry: Math.PI / 2 };   // 西大门：正对育华楼(1070,-5)
const DONGGUAN_PS = { x: 753.5, z: -121.9 };         // 东关实验小学（OSM way/1372002250 中心）
const ERDAO_MEN = { x: 950, z: 58, ry: -0.63 };      // 南门内二道门（7 号门，近似）

// 学府中路（校园西侧）与东关大街（校园南侧）的本地折线
const XUEFU = [[677, 198], [691, 151], [876, -155], [1027, -400], [1101, -512]];
const DONGGUAN = [[672, -43], [762, 19], [1013, 190], [1197, 317]];

// 高德标准图沿街 POI 标注（2026-11-13 读取，用作类型化店招文字）
const SHOP_WEST = [
  '格力专卖店', '博今图文', '照相复印', '小陶汽修', '客隆隆超市',
  '好邻居照相', '意林书店', '状元书店', '北大书店', '春霞照相馆',
  '明视眼镜', '汇丰手机连锁', '大明眼镜店', '江南水饺', '朝妈饭店',
  '扬州炒饭', '瑞幸咖啡', '重庆小面', '幸运咖'
];
const SHOP_SOUTH = [
  '蜜雪冰城', '重庆鲜面店', '美林', '蒸城牛羊驴肉', '德克士',
  '小谢水果大卖场', '德康堂大药房', '阳光文具', '金阳光', '明明百鸡熟食'
];
const SHOP_COLOURS = [
  ['#8f2f26', '#f6e6c8'], ['#1f4f63', '#eef4f1'], ['#2f5d3a', '#f2f0dd'],
  ['#8a5b21', '#fdf3dd'], ['#3a3f46', '#f4d977'], ['#7b2f4a', '#fbe9ee'],
  ['#274e7a', '#f2f6fb'], ['#5c3f1c', '#f8ecd8']
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
      // 中心必须还原到 (ux,uz)/(vx,vz) 基：along 可能取的是其中任一轴
      best = {
        ux: along.x, uz: along.z, vx: across.x, vz: across.z,
        L, W, area, cx: cu * ux + cv * vx, cz: cu * uz + cv * vz
      };
    }
  }
  return best;
}

function distToPolyline(px, pz, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), pz - (az + t * dz)));
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

// 店招文字贴图（单块）
function signTexture(text, bg, fg) {
  if (!CANVAS) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = fg;
  ctx.font = `700 ${text.length > 4 ? 64 : 84}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68, 480);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function goldNameTexture(text, bg, fg, vertical) {
  if (!CANVAS) return null;
  const chars = [...text];
  const cw = 48, ch = 48;
  const w = vertical ? cw : cw * chars.length;
  const h = vertical ? ch * chars.length : ch;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `bold ${ch * 0.72}px "KaiTi", "STKaiti", serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  chars.forEach((chr, i) => {
    const x = vertical ? cw / 2 : cw * (i + 0.5);
    const y = vertical ? ch * (i + 0.5) : ch / 2;
    ctx.fillText(chr, x, y);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildMizhongPrecinct(root) {
  const std = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...o });
  const M = {
    shopWall: std(0xd8d2c6),
    shopBase: std(0x2a2d2e, { roughness: 0.75 }),
    awning: std(0x8c2f26, { roughness: 0.8 }),
    glass: std(0x3a5058, { roughness: 0.22, metalness: 0.42 }),
    frame: std(0x6e7478, { roughness: 0.5, metalness: 0.38 }),
    brick: new THREE.MeshStandardNodeMaterial({
      color: 0x9a9590, roughness: 0.92,
      map: (() => {
        if (!CANVAS) return null;
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        g.fillStyle = '#9a9590'; g.fillRect(0, 0, 64, 64);
        g.strokeStyle = '#7e7a75'; g.lineWidth = 1.5;
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
      })()
    }),
    gold: std(0xc9a84c, { roughness: 0.55, metalness: 0.35 }),
    dark: std(0x2a2622),
    redWall: std(0x7c2b22, { roughness: 0.85 }),
    metal: std(0x9aa0a4, { roughness: 0.5, metalness: 0.42 }),
    stone: std(0x8a8478, { roughness: 0.92 }),
    white: std(0xd8d8d2),
    neon: new THREE.MeshBasicNodeMaterial({ color: 0xffd985 }),
    resident: std(0xcfc8b8),
    band: std(0xc4794e, { roughness: 0.85 }),
    roof: std(0x8a8d90, { roughness: 0.9 }),
    tree: std(0x3e6634, { roughness: 0.98 })
  };

  const batches = {
    shopWall: createBatch(M.shopWall, '沭中周边·店墙'),
    shopBase: createBatch(M.shopBase, '沭中周边·店招底板'),
    awning: createBatch(M.awning, '沭中周边·雨棚'),
    glass: createBatch(M.glass, '沭中周边·橱窗'),
    frame: createBatch(M.frame, '沭中周边·窗框'),
    brick: createBatch(M.brick, '沭中周边·灰砖'),
    gold: createBatch(M.gold, '沭中周边·金字'),
    dark: createBatch(M.dark, '沭中周边·深色件'),
    redWall: createBatch(M.redWall, '沭中周边·红墙'),
    metal: createBatch(M.metal, '沭中周边·金属件'),
    stone: createBatch(M.stone, '沭中周边·石作'),
    white: createBatch(M.white, '沭中周边·白件'),
    resident: createBatch(M.resident, '沭中周边·住宅墙'),
    band: createBatch(M.band, '沭中周边·色带'),
    roof: createBatch(M.roof, '沭中周边·屋面'),
    tree: createBatch(M.tree, '沭中周边·行道树冠')
  };

  const signQuads = [];
  const goldQuads = [];
  const neonQuads = [];
  const stats = { shops: 0, gates: 0, buildings: 0 };
  const rand = mulberry32(20261114);

  const addSign = (text, x, y, z, w, h, ry) => {
    const [bg, fg] = SHOP_COLOURS[signQuads.length % SHOP_COLOURS.length];
    signQuads.push({ text, bg, fg, x, y, z, w, h, ry });
  };
  const addGold = (text, x, y, z, w, h, ry, vertical, bg, fg) => {
    goldQuads.push({ text, x, y, z, w, h, ry, vertical, bg: bg || '#222831', fg: fg || '#d4af37' });
  };

  // ---- 1) 沿街商铺（学府中路西侧 / 东关大街南侧既有来源楼体）----
  {
    let iWest = 0, iSouth = 0;
    for (const b of REAL_BUILDINGS) {
      const poly = b.polygons[0];
      if (!poly) continue;
      const ring = poly.outer.map(p => ({ x: p.x, z: p.z }));
      const xs = ring.map(p => p.x), zs = ring.map(p => p.z);
      const cx = xs.reduce((a, c) => a + c, 0) / xs.length;
      const cz = zs.reduce((a, c) => a + c, 0) / zs.length;
      if (cx < 620 || cx > 1300 || cz < -560 || cz > 360) continue;
      const dX = distToPolyline(cx, cz, XUEFU);
      const dD = distToPolyline(cx, cz, DONGGUAN);
      const d = Math.min(dX, dD);
      if (d > 34) continue;
      const rect = orientedRect(ring);
      if (!rect || rect.L < 8) continue;
      stats.buildings++;
      const ry = -Math.atan2(rect.uz, rect.ux);
      const at = (u, v) => ({ x: rect.cx + rect.ux * u + rect.vx * v, z: rect.cz + rect.uz * u + rect.vz * v });
      const isWest = dX < dD;
      // 朝街一面：长边外侧
      const vSide = (isWest && rect.cz < 0) || (!isWest && rect.cx > 900) ? 1 : -1;
      const face = {
        o: at(0, vSide * (rect.W / 2 + 0.12)),
        dir: { x: rect.vx * vSide, z: rect.vz * vSide },
        len: rect.L,
        ry: ry + (vSide > 0 ? 0 : Math.PI)
      };
      const top = b.height;
      const floors = Math.max(1, Math.round(top / 3.0));
      // 店招带 + 橱窗（底层）
      const n = Math.max(1, Math.floor(face.len / 6));
      for (let k = 0; k < n; k++) {
        const u = -face.len / 2 + face.len / n * (k + 0.5);
        const tangent = { x: -face.dir.z, z: face.dir.x };
        const sx = face.o.x + tangent.x * u, sz = face.o.z + tangent.z * u;
        const name = isWest ? SHOP_WEST[iWest++ % SHOP_WEST.length] : SHOP_SOUTH[iSouth++ % SHOP_SOUTH.length];
        // 底板
        batches.shopBase.box(sx + face.dir.x * 0.1, 3.1, sz + face.dir.z * 0.1,
          Math.min(6, face.len / n) * 0.92, 1.0, 0.28, face.ry);
        addSign(name, sx + face.dir.x * 0.28, 3.16, sz + face.dir.z * 0.28,
          Math.min(6, face.len / n) * 0.86, 0.88, face.ry);
        // 橱窗 + 门
        batches.glass.box(sx + face.dir.x * 0.12, 0.15, sz + face.dir.z * 0.12,
          Math.min(6, face.len / n) * 0.8, 2.6, 0.16, face.ry);
        // 雨棚
        batches.awning.box(sx + face.dir.x * 0.55, 4.2, sz + face.dir.z * 0.55,
          Math.min(6, face.len / n) * 0.95, 0.18, 1.2, face.ry);
        stats.shops++;
      }
      // 上层窗带 + 色带（住宅/商住）
      for (let f = 1; f < floors; f++) {
        const y = 0.4 + f * 3.0;
        const nn = Math.max(2, Math.floor(face.len / 3.2));
        for (let k = 0; k < nn; k++) {
          const u = -face.len / 2 + face.len / nn * (k + 0.5);
          const tangent = { x: -face.dir.z, z: face.dir.x };
          const wx = face.o.x + tangent.x * u + face.dir.x * 0.12;
          const wz = face.o.z + tangent.z * u + face.dir.z * 0.12;
          batches.glass.box(wx, y, wz, 1.5, 1.4, 0.08, face.ry);
          batches.frame.box(wx, y, wz, 1.66, 1.56, 0.05, face.ry);
        }
        batches.band.box(face.o.x + face.dir.x * 0.1, y + 2.1, face.o.z + face.dir.z * 0.1,
          face.len - 1.0, 0.28, 0.12, face.ry);
      }
      // 女儿墙
      batches.roof.box(rect.cx, top, rect.cz, rect.L + 0.4, 0.7, rect.W + 0.4, ry);
    }
  }

  // ---- 2) 东关实验小学校门（实拍：灰砖拱门+金字+LED+商铺夹持）----
  {
    const g = DONGGUAN_PS;
    const ry = 0;   // 朝东迎学府中路
    // 三拱门楼：两小拱夹一大拱
    batches.brick.box(g.x - 7.5, 0, g.z, 2.6, 5.2, 2.2, ry);
    batches.brick.box(g.x + 7.5, 0, g.z, 2.6, 5.2, 2.2, ry);
    batches.brick.box(g.x - 3.6, 0, g.z, 2.2, 4.2, 2.0, ry);
    batches.brick.box(g.x + 3.6, 0, g.z, 2.2, 4.2, 2.0, ry);
    // 拱顶横梁
    batches.brick.box(g.x, 4.0, g.z, 15.6, 1.6, 2.2, ry);
    batches.brick.box(g.x, 5.6, g.z, 16.4, 0.5, 2.6, ry);
    // 金字校名
    addGold('东关实验小学', g.x, 4.25, g.z + 1.15, 10.5, 1.35, ry, false, '#9a9590', '#e8cf8e');
    // LED 屏
    batches.dark.box(g.x - 4.4, 3.0, g.z + 1.1, 2.4, 1.1, 0.12, ry);
    // 伸缩门（中拱下）
    for (let i = 0; i < 14; i++) {
      batches.metal.box(g.x - 3.0 + i * 0.46, 0.1, g.z, 0.1, 1.25, 0.5, ry);
    }
    // 两侧白栅栏
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        batches.white.box(g.x + s * (9.2 + i * 0.9), 0, g.z, 0.12, 1.5, 0.12, ry);
      }
      batches.white.box(g.x + s * 11.9, 1.45, g.z, 6.0, 0.12, 0.12, ry);
    }
    // 夹持商铺（阳光文具 / 金阳光，实拍店招）
    for (const s of [-1, 1]) {
      batches.shopWall.box(g.x + s * 17, 0, g.z + 3, 10, 7.2, 8, ry);
      batches.shopBase.box(g.x + s * 17, 3.2, g.z - 1.1, 8.2, 1.0, 0.28, ry);
      addSign(s < 0 ? '阳光文具' : '金阳光', g.x + s * 17, 3.26, g.z - 1.35, 7.4, 0.88, ry);
      batches.glass.box(g.x + s * 17, 0.15, g.z - 1.0, 7.0, 2.6, 0.16, ry);
    }
    stats.gates++;
  }

  // ---- 3) 西大门（实拍 laowu.jpg：球顶刻石+霓虹"沭阳中学"旧牌+红字影壁）----
  {
    const g = XI_MEN;
    // 红字影壁（校名横幅墙）
    batches.redWall.box(g.x - 14, 0, g.z, 12, 2.8, 0.6, 0);
    addGold('江苏省沭阳高级中学', g.x - 14, 1.05, g.z - 0.35, 10.6, 1.0, 0, false, '#7c2b22', '#e8cf8e');
    // 球顶刻石柱
    batches.stone.box(g.x - 3.2, 0, g.z, 2.4, 5.6, 2.4, 0);
    batches.stone.box(g.x - 3.2, 5.6, g.z, 1.4, 1.0, 1.4, 0);
    batches.white.box(g.x - 3.2, 6.6, g.z, 2.2, 2.2, 2.2, 0);   // 球（近似）
    // 霓虹"沭阳中学"旧牌（门楼顶）
    batches.dark.box(g.x + 12, 4.2, g.z, 14, 3.2, 1.2, 0);
    neonQuads.push({ text: '沭阳中学', x: g.x + 12, y: 4.55, z: g.z - 0.65, w: 12, h: 2.5, ry: 0 });
    // 门柱 + 栅栏（封闭状态）
    batches.brick.box(g.x + 4.2, 0, g.z, 1.5, 4.6, 1.5, 0);
    batches.brick.box(g.x + 19.8, 0, g.z, 1.5, 4.6, 1.5, 0);
    for (let i = 0; i < 16; i++) {
      batches.metal.box(g.x + 5.6 + i * 0.86, 0, g.z, 0.12, 2.0, 0.12, 0);
    }
    batches.metal.box(g.x + 12.6, 1.95, g.z, 12.6, 0.12, 0.12, 0);
    stats.gates++;
  }

  // ---- 4) 二道门 7 号门（实拍 canteen3.jpg：暗红方柱+门牌+告示+伸缩门+白栅栏）----
  {
    const g = ERDAO_MEN;
    const cs = Math.cos(g.ry), sn = Math.sin(g.ry);
    const at = (u, v) => [g.x + u * cs + v * sn, g.z - u * sn + v * cs];
    for (const s of [-1, 1]) {
      const p = at(s * 3.2, 0);
      batches.redWall.box(p[0], 0, p[1], 1.7, 3.9, 1.7, g.ry);
      // 门牌"7 号门"
      const q = at(s * 3.2, -0.9);
      batches.white.box(q[0], 2.45, q[1], 1.05, 0.62, 0.1, g.ry);
      addGold('7号门', q[0], 2.52, q[1] - 0.08, 0.9, 0.5, g.ry, false, '#eef2f5', '#2a4e7a');
    }
    // 告示牌（红底）
    const n0 = at(3.2, -0.92);
    batches.redWall.box(n0[0], 1.15, n0[1], 1.5, 1.05, 0.1, g.ry);
    // 伸缩门
    for (let i = 0; i < 15; i++) {
      const p = at(-2.6 + i * 0.38, 0);
      batches.metal.box(p[0], 0.12, p[1], 0.09, 1.2, 0.5, g.ry);
    }
    // 白铁栅栏（带圆环装饰近似）
    for (const s of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const p = at(s * (5.2 + i * 0.85), 0);
        batches.white.box(p[0], 0, p[1], 0.1, 1.6, 0.1, g.ry);
      }
      const p = at(s * 9.0, 0);
      batches.white.box(p[0], 1.55, p[1], 7.4, 0.1, 0.1, g.ry);
    }
    stats.gates++;
  }

  // ---- 5) 沿街行道树池 + 路灯（东关大街/学府中路近校段）----
  {
    for (const poly of [XUEFU, DONGGUAN]) {
      for (let i = 0; i < poly.length - 1; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.floor(len / 22);
        for (let k = 0; k <= n; k++) {
          const t = k / Math.max(1, n);
          const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
          if (px < 640 || px > 1280 || pz < -540 || pz > 340) continue;
          const nx = -(bz - az) / len, nz = (bx - ax) / len;
          for (const s of [-1, 1]) {
            const tx = px + nx * s * 10.5, tz = pz + nz * s * 10.5;
            batches.stone.box(tx, 0, tz, 1.4, 0.35, 1.4, 0);
            batches.dark.box(tx, 0.35, tz, 0.55, 3.6, 0.55, 0);
            batches.tree.box(tx, 3.9, tz, 3.4, 3.0, 3.4, 0);
          }
          // 路灯
          const lx = px - nx * 7.5, lz = pz - nz * 7.5;
          batches.metal.box(lx, 0, lz, 0.22, 7.2, 0.22, 0);
          batches.metal.box(lx, 7.2, lz, 1.6, 0.16, 0.16, 0);
          batches.white.box(lx + 0.8, 7.0, lz, 0.7, 0.35, 0.45, 0);
        }
      }
    }
  }

  // ---- 组装店招/金字贴图 ----
  const signGroups = new Map();
  for (const q of signQuads) {
    const key = `${q.bg}|${q.fg}`;
    if (!signGroups.has(key)) signGroups.set(key, { bg: q.bg, fg: q.fg, items: [] });
    signGroups.get(key).items.push(q);
  }
  for (const grp of signGroups.values()) {
    for (const q of grp.items) {
      const tex = signTexture(q.text, grp.bg, grp.fg);
      if (!tex) continue;
      const mat = new THREE.MeshBasicNodeMaterial({ map: tex });
      const batch = createBatch(mat, '沭中周边·店招');
      const cs = Math.cos(q.ry), sn = Math.sin(q.ry);
      const hw = q.w / 2;
      batch.quad(
        [q.x - hw * cs, q.y, q.z + hw * sn], [q.x + hw * cs, q.y, q.z - hw * sn],
        [q.x + hw * cs, q.y + q.h, q.z - hw * sn], [q.x - hw * cs, q.y + q.h, q.z + hw * sn],
        [sn, 0, cs]
      );
      const m = batch.build();
      if (m) root.add(m);
    }
  }
  for (const q of goldQuads) {
    const tex = goldNameTexture(q.text, q.bg, q.fg, q.vertical);
    if (!tex) continue;
    const mat = new THREE.MeshBasicNodeMaterial({ map: tex });
    const batch = createBatch(mat, '沭中周边·金字');
    const cs = Math.cos(q.ry), sn = Math.sin(q.ry);
    const hw = q.w / 2;
    batch.quad(
      [q.x - hw * cs, q.y, q.z + hw * sn], [q.x + hw * cs, q.y, q.z - hw * sn],
      [q.x + hw * cs, q.y + q.h, q.z - hw * sn], [q.x - hw * cs, q.y + q.h, q.z + hw * sn],
      [sn, 0, cs]
    );
    const m = batch.build();
    if (m) root.add(m);
  }
  for (const q of neonQuads) {
    const tex = goldNameTexture(q.text, '#181410', '#ffd985', false);
    if (!tex) continue;
    const mat = new THREE.MeshBasicNodeMaterial({ map: tex });
    const batch = createBatch(mat, '沭中周边·霓虹牌');
    const cs = Math.cos(q.ry), sn = Math.sin(q.ry);
    const hw = q.w / 2;
    batch.quad(
      [q.x - hw * cs, q.y, q.z + hw * sn], [q.x + hw * cs, q.y, q.z - hw * sn],
      [q.x + hw * cs, q.y + q.h, q.z - hw * sn], [q.x - hw * cs, q.y + q.h, q.z + hw * sn],
      [sn, 0, cs]
    );
    const m = batch.build();
    if (m) root.add(m);
  }

  for (const batch of Object.values(batches)) {
    const mesh = batch.build();
    if (mesh) root.add(mesh);
  }

  root.userData = {
    photoBasis: '高德 z18 标准图 POI 标注(2026-11-13 读取) + 美篇《永远的沭中》实拍（东关实验小学校门/西大门/7号门）+ 校门消防车道实拍',
    stats,
    precinctNote: '店招取自地图标注场所名，门牌对应为按街序的类型化排布，不代表实际商户；西大门/7号门位置为图证特征的近似落位，不是逐处测绘'
  };
  return { stats };
}

export { buildMizhongPrecinct };
