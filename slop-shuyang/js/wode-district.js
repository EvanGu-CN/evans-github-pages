import * as THREE from 'three/webgpu';
import { REAL_BUILDINGS } from './building-geodata.js';
import { NEIGHBORHOODS, ROADS } from './city-config.js';

// 沃德嘉园街区（苏州西路以南、临安西路以北、河滨路以西）的建筑精细化。
//
// 影像依据：
// - 2026-11-13 取得的高德在线卫星与标准图层，以及 2026-11-14 复核的 z18 瓦片拼图
//   （官方均未公开拍摄日，查询日不等于拍摄日）；图上可辨东西向长条板楼成排、
//   坡屋面（小区中部通道以西呈陶土瓦、以东呈浅灰白瓦）、檐口白边、南向成组阳台。
// - 高德地点 B020F0IJ8D 庭院俯拍（无题名，身份靠地点与椭圆庭院交叉核对）。
// - 高德地点评论图 2026-03-14（B020F0IJ8D）：米黄面砖上部 + 深灰面砖勒脚、
//   白框玻璃封闭阳台（带防盗栅）、外挂空调机、深红色单元门雨棚、楼前绿篱、
//   植草砖停车位、混凝土通路、电动汽车充电桩。
// - 高德地点 B0L267EPJ1（A区）：41栋楼号牌、红褐色面砖上部 + 灰色仿石下部、白色腰线。
// - 高德地点 B0L267FGXV（E区）：5栋楼号牌、米黄面砖、白色封闭阳台、深色檐口。
// - 高德地点图 B020F0IJ8D-2：主路断面（红砖停车带 + 黄色车位线、大块石材人行道、
//   景观灯柱），位置未逐点绑定，仅作本片区道路样式参考。
// - 高德标准图层（2026-11-14 取得）：可读楼号 A1–A8/C1–C2/D1–D14/E1–E6/F3/G1–G8、
//   出入口「西门 / 南门 / 南1门 / 南2门」与沿街 POI（欣润购物中心、舌尖映像、
//   比因美特、车士汽贸、国缘V3、陈理发、茗璇烟茶庄等）。门址按标准图图示定位（±10 m）。
//
// 本模块只在既有来源轮廓上叠加立面构件，不新增也不替换任何楼体：
// 坡屋顶高度、阳台排数、单元门位置、店招文字与门楼形式都是类型化展示估计，
// 不是逐栋测绘，店招也不代表实际商户。原平面屋顶仍由 buildings.js 渲染，坡面盖在其上。
// 楼号牌与逐栋瓦色仍缺绑定依据：照片里的「41栋/5栋」与标准图的「A5幢/E2幢」
// 两套编号无法对应，故不在楼体上编造楼号；瓦色仍按中部通道分区判读。

const NEIGHBOURHOOD_NAME = '沃德嘉园';
// 卫星图上小区中部有一条南北向通道：以西为陶土瓦，以东为浅灰瓦。
const ROOF_RED_LIMIT_X = 620;
const FLOOR_HEIGHT = 3.0;

// 标准图与地点照片里的沿街店名；signAtlas 按朝向取用，文字仅作类型化展示。
const SHOP_NAMES = [
  // 0–4 南侧（临安西路）：标准图 POI
  '欣润购物中心', '舌尖映像', '比因美特', '车士汽贸', '国缘V3',
  // 5–8 东侧（河滨路）：标准图 POI
  '陈理发', '茗璇烟茶庄', '苹玛驿站', '喜小栗',
  // 9–12 西侧（长安路）：标准图 POI
  '老张盲人推拿', '临苏鲜果', '女主角美容养生', '便利店',
  // 13–15 通用类型占位
  '药房', '面馆', '快递驿站'
];
const SHOP_BY_SIDE = {
  south: [0, 1, 2, 3, 4],
  east: [5, 6, 7, 8],
  west: [9, 10, 11, 12],
  generic: [13, 14, 15]
};
const SHOP_COLOURS = [
  ['#8f2f26', '#f6e6c8'], ['#1f4f63', '#eef4f1'], ['#2f5d3a', '#f2f0dd'],
  ['#8a5b21', '#fdf3dd'], ['#3a3f46', '#f4d977'], ['#7b2f4a', '#fbe9ee']
];

// 出入口：高德标准图（2026-11-14）图示位置，面朝方向为离开小区的一侧。
// 形式（门柱/道闸/门卫室/名牌）为类型化估计，无门楼实拍，不作雕饰。
const GATES = [
  { name: '西门', x: 487, z: 2001, fx: -1, fz: 0 },
  { name: '南门', x: 512, z: 2338, fx: 0, fz: 1 },
  { name: '南1门', x: 611, z: 2312, fx: 0, fz: 1 },
  { name: '南2门', x: 706, z: 2316, fx: 0, fz: 1 }
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

// 最小面积外接矩形：长轴决定屋脊与阳台方向，短轴决定屋面跨度。
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
    // 长边始终作为屋脊方向，必要时把 u/v 基向量对调。
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

// 瓦面：横向瓦垄 + 高光细线，靠 UV 平铺。
function tileTexture(base, groove) {
  if (!CANVAS) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    ctx.fillStyle = groove; ctx.fillRect(0, y, 64, 2);
    ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(0, y + 2, 64, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 封闭阳台的防盗栅格：白框 + 竖杆，2026-03-14 评论图与 E区照片里的典型做法。
function grilleTexture() {
  if (!CANVAS) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cfd4d6'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#f2f1ec';
  ctx.fillRect(0, 0, 64, 4); ctx.fillRect(0, 30, 64, 4); ctx.fillRect(0, 60, 64, 4);
  for (let x = 2; x < 64; x += 9) ctx.fillRect(x, 0, 3, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 植草砖车位格：混凝土格构 + 草芯，2026-03-14 评论图里的停车铺装。
function grassGridTexture() {
  if (!CANVAS) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#87a06b'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#b3ac9c';
  for (let i = 0; i <= 64; i += 16) {
    ctx.fillRect(i - 2, 0, 4, 64); ctx.fillRect(0, i - 2, 64, 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 门柱名牌：石材底 + 金字小区题名（题名来自高德标准图/OSM 名称，不是照片题名）。
function plaqueTexture() {
  if (!CANVAS) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8d8478'; ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = '#6f675c';
  for (let y = 10; y < 160; y += 26) ctx.fillRect(0, y, 512, 3);
  ctx.fillStyle = '#e8d59a';
  ctx.font = '700 92px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('沃德嘉园', 256, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

// 沿长轴切片：把带凹凸的长条平面拆成若干矩形段，每段各自起脊。
// 断面按 2 m 采样后再合并，屋脊不会跨过缺口，长排楼也不会只在某一截出现坡屋顶。
function roofStrips(ring, rect, maxStrips = 8) {
  const pts = ring.map(p => ({
    u: (p.x - rect.cx) * rect.ux + (p.z - rect.cz) * rect.uz,
    v: (p.x - rect.cx) * rect.vx + (p.z - rect.cz) * rect.vz
  }));
  const uMin = Math.min(...pts.map(p => p.u)), uMax = Math.max(...pts.map(p => p.u));
  const span = uMax - uMin;
  if (span < 12) return null;
  const steps = Math.max(2, Math.round(span / 2));
  const samples = [];
  // 两端各留 1.5 m：山墙常带斜角，贴边取断面会得到一条细缝。
  const inset = Math.min(1.5, span * 0.08);
  for (let i = 1; i < steps; i++) {
    const u = uMin + span * i / steps;
    if (u < uMin + inset || u > uMax - inset) continue;
    const cut = u;
    const spans = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      if ((a.u - cut) * (b.u - cut) < 0) spans.push(a.v + (b.v - a.v) * (cut - a.u) / (b.u - a.u));
    }
    if (spans.length < 2) return null;
    spans.sort((p, q) => p - q);
    let widest = null, second = 0;
    for (let k = 0; k + 1 < spans.length; k += 2) {
      const width = spans[k + 1] - spans[k];
      if (!widest || width > widest.width) {
        if (widest) second = Math.max(second, widest.width);
        widest = { v0: spans[k], v1: spans[k + 1], width };
      } else second = Math.max(second, width);
    }
    // 同一断面出现两条相近的进深，说明平面在长轴方向不连通，坡屋顶会盖到空处。
    if (!widest || widest.width < 4.5 || second > widest.width * 0.35) return null;
    samples.push({ u, v0: widest.v0, v1: widest.v1 });
  }
  if (samples.length < 2) return null;
  const strips = [];
  let cur = { u0: samples[0].u, u1: samples[0].u, v0: samples[0].v0, v1: samples[0].v1, n: 1 };
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    if (Math.abs(s.v0 - cur.v0) < 1.0 && Math.abs(s.v1 - cur.v1) < 1.0) {
      cur.u1 = s.u; cur.n += 1;
      cur.v0 += (s.v0 - cur.v0) / cur.n;
      cur.v1 += (s.v1 - cur.v1) / cur.n;
    } else {
      strips.push(cur);
      cur = { u0: s.u, u1: s.u, v0: s.v0, v1: s.v1, n: 1 };
    }
  }
  strips.push(cur);
  if (strips.length > maxStrips) return null;
  strips[0].u0 = uMin;
  strips[strips.length - 1].u1 = uMax;
  for (const s of strips) {
    if (s.u1 - s.u0 < 1.2) return null;
    s.width = s.v1 - s.v0;
    delete s.n;
  }
  return strips;
}

function buildWodeDistrict(root) {
  const neighbourhood = NEIGHBORHOODS.find(n => n.name === NEIGHBOURHOOD_NAME);
  if (!neighbourhood) return null;
  const rings = neighbourhood.polygons.map(p => p.outer);
  const holes = neighbourhood.polygons.map(p => p.holes || []);
  const inside = (x, z) => rings.some((ring, i) =>
    pointInRing(ring, x, z) && !holes[i].some(h => pointInRing(h, x, z)));

  const buildings = REAL_BUILDINGS.filter(b => b.category === 'residential' && inside(b.cx, b.cz));
  if (!buildings.length) return null;

  const group = new THREE.Group();
  group.name = '街区·沃德嘉园';

  const std = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.86, ...o });
  const M = {
    wall: std(0xd6c8aa),
    trim: std(0xe2dbcb, { roughness: 0.82 }),
    band: std(0xe9e4d6, { roughness: 0.8 }),
    slab: std(0xd2cab7, { roughness: 0.8 }),
    balcony: new THREE.MeshStandardNodeMaterial({ color: 0xd8d4cc, roughness: 0.85, map: grilleTexture() }),
    rail: std(0xe6e3da, { roughness: 0.55, metalness: 0.2 }),
    glass: std(0x3c5b66, { roughness: 0.22, metalness: 0.4 }),
    door: std(0x4a4038, { roughness: 0.7 }),
    frame: std(0x8d9490, { roughness: 0.45, metalness: 0.45 }),
    plinth: std(0x8a8072, { roughness: 0.9 }),
    stoneBase: std(0x6e6a63, { roughness: 0.92 }),
    shopBase: std(0x2a2d2e, { roughness: 0.75 }),
    roofRed: new THREE.MeshStandardNodeMaterial({ color: 0x9d6350, roughness: 0.92, map: tileTexture('#9d6350', '#734538') }),
    roofPale: new THREE.MeshStandardNodeMaterial({ color: 0xb8b8ae, roughness: 0.92, map: tileTexture('#b8b8ae', '#94948c') }),
    ridge: std(0x6e6a63, { roughness: 0.8 }),
    solar: std(0x273640, { roughness: 0.35, metalness: 0.3 }),
    tank: std(0xd3cec0, { roughness: 0.7 }),
    hedge: std(0x4f6b40, { roughness: 0.96 }),
    hedgeLight: std(0x5d7a48, { roughness: 0.96 }),
    grass: std(0x5b7648, { roughness: 0.98 }),
    apron: std(0xaaa497, { roughness: 0.94 }),
    awning: std(0x8f3f36, { roughness: 0.9 }),
    parkGrid: new THREE.MeshStandardNodeMaterial({ color: 0xc9c4b4, roughness: 0.95, map: grassGridTexture() }),
    parkLine: std(0xd8d5c8, { roughness: 0.85 }),
    ac: std(0xd5d2c9, { roughness: 0.6, metalness: 0.15 }),
    gateStone: std(0x9a9184, { roughness: 0.88 }),
    booth: std(0xc9c2b2, { roughness: 0.82 }),
    barrier: std(0xd8d4c8, { roughness: 0.6 })
  };
  const atlas = signAtlas();
  M.sign = new THREE.MeshBasicNodeMaterial(atlas.texture ? { map: atlas.texture } : { color: 0x233038 });
  M.plaque = new THREE.MeshBasicNodeMaterial(plaqueTexture() ? { map: plaqueTexture() } : { color: 0x8d8478 });

  const batches = {
    wall: createBatch(M.wall, '沃德·墙身'),
    trim: createBatch(M.trim, '沃德·檐口'),
    band: createBatch(M.band, '沃德·白色腰线'),
    slab: createBatch(M.slab, '沃德·阳台板'),
    balcony: createBatch(M.balcony, '沃德·阳台栏板'),
    rail: createBatch(M.rail, '沃德·阳台扶手'),
    glass: createBatch(M.glass, '沃德·门窗玻璃'),
    door: createBatch(M.door, '沃德·单元门'),
    frame: createBatch(M.frame, '沃德·门窗框'),
    plinth: createBatch(M.plinth, '沃德·勒脚'),
    stoneBase: createBatch(M.stoneBase, '沃德·石材勒脚'),
    shopBase: createBatch(M.shopBase, '沃德·店招底板'),
    roofRed: createBatch(M.roofRed, '沃德·陶土瓦屋面'),
    roofPale: createBatch(M.roofPale, '沃德·浅灰瓦屋面'),
    ridge: createBatch(M.ridge, '沃德·屋脊'),
    solar: createBatch(M.solar, '沃德·太阳能'),
    tank: createBatch(M.tank, '沃德·水箱'),
    hedge: createBatch(M.hedge, '沃德·绿篱'),
    hedgeLight: createBatch(M.hedgeLight, '沃德·绿篱浅'),
    grass: createBatch(M.grass, '沃德·楼前草地'),
    apron: createBatch(M.apron, '沃德·楼前铺装'),
    awning: createBatch(M.awning, '沃德·雨棚'),
    sign: createBatch(M.sign, '沃德·店招'),
    parkGrid: createBatch(M.parkGrid, '沃德·植草砖车位'),
    parkLine: createBatch(M.parkLine, '沃德·车位线'),
    ac: createBatch(M.ac, '沃德·空调外机'),
    gateStone: createBatch(M.gateStone, '沃德·门柱'),
    booth: createBatch(M.booth, '沃德·门卫室'),
    barrier: createBatch(M.barrier, '沃德·道闸'),
    plaque: createBatch(M.plaque, '沃德·门名牌')
  };

  const stats = { buildings: 0, pitchedRoofs: 0, redRoofs: 0, flatRoofs: 0, balconies: 0, entrances: 0, hedges: 0, groundStrips: 0, shopEdges: 0, signs: 0, stoneBands: 0, parkBays: 0, acUnits: 0, gates: 0, evPiles: 0 };
  const records = [];
  // 全部来源楼体的包围盒，用于给车位带避让（不穿楼）。
  const occupied = buildings.map(b => b);
  const parkingAnchors = [];

  for (const b of buildings) {
    const polygon = b.polygons[0];
    if (!polygon) continue;
    const ring = polygon.outer;
    if (!ring || ring.length < 3 || b.height < 6) continue;
    const rect = orientedRect(ring);
    if (!rect || rect.L < 6 || rect.W < 4) continue;
    const fill = Math.abs(signedArea(ring)) / rect.area;
    const height = b.height;
    const top = height + 0.22;
    const rand = mulberry32((b.seed || 1) * 7919 + Math.round(b.cx * 13 + b.cz * 7));
    const floors = Math.max(1, Math.min(9, Math.round((height - 0.22) / FLOOR_HEIGHT)));
    const storey = (height - 0.22) / floors;
    stats.buildings++;

    const { cx, cz, ux, uz, vx, vz, L, W } = rect;
    const at = (u, v) => ({ x: cx + ux * u + vx * v, z: cz + uz * u + vz * v });
    const ry = -Math.atan2(uz, ux);
    const areaSign = signedArea(ring) > 0 ? 1 : -1;
    records.push({ cx: +cx.toFixed(1), cz: +cz.toFixed(1), h: height, floors,
      roof: 'flat', balconyRows: 0 });

    // ---- 1. 坡屋面：沿长轴分段起脊；切不出规整断面的退回女儿墙 ----
    const strips = !(polygon.holes || []).length && L >= 12 && W >= 5 && fill > 0.5
      ? roofStrips(ring, rect) : null;
    const roofable = !!strips;
    if (strips) {
      const overhang = 0.42;
      const eaveY = top + 0.02;
      const rise = Math.max(1.0, Math.min(2.6, Math.max(...strips.map(s => s.width)) * 0.2));
      const ridgeY = eaveY + rise;
      const red = cx < ROOF_RED_LIMIT_X;
      const batch = red ? batches.roofRed : batches.roofPale;
      records[records.length - 1].roof = red ? 'red' : 'pale';
      stats.pitchedRoofs++; if (red) stats.redRoofs++;
      for (const s of strips) {
        const vc = (s.v0 + s.v1) / 2;
        const A = at(s.u0, s.v0 - overhang), B = at(s.u1, s.v0 - overhang);
        const C = at(s.u1, s.v1 + overhang), D = at(s.u0, s.v1 + overhang);
        const R0 = at(s.u0, vc), R1 = at(s.u1, vc);
        const slope = Math.hypot((s.v1 - s.v0) / 2 + overhang, rise);
        const uRep = Math.max(1, s.u1 - s.u0), vRep = Math.max(1, slope / 1.4);
        const uv = [[0, 0], [uRep, 0], [uRep, vRep], [0, vRep]];
        // 南坡、北坡各一片；UV 沿屋脊按 1 m、沿坡面按 1.4 m 平铺瓦垄。
        batch.quad([D.x, eaveY, D.z], [C.x, eaveY, C.z], [R1.x, ridgeY, R1.z], [R0.x, ridgeY, R0.z],
          [vx, 0.7, vz], uv);
        batch.quad([B.x, eaveY, B.z], [A.x, eaveY, A.z], [R0.x, ridgeY, R0.z], [R1.x, ridgeY, R1.z],
          [-vx, 0.7, -vz], uv);
        // 两端山墙补齐到屋脊；相邻分段的端面背靠背，从外面看不到。
        batches.wall.tri([A.x, top, A.z], [D.x, top, D.z], [R0.x, ridgeY, R0.z], [-ux, 0, -uz]);
        batches.wall.tri([C.x, top, C.z], [B.x, top, B.z], [R1.x, ridgeY, R1.z], [ux, 0, uz]);
        // 檐口白边与屋脊压顶：卫星图上每排楼最醒目的浅色横线。
        const uMid = (s.u0 + s.u1) / 2, eaveW = s.u1 - s.u0;
        for (const e of [at(uMid, s.v0 - overhang), at(uMid, s.v1 + overhang)]) {
          batches.trim.box(e.x, eaveY - 0.24, e.z, eaveW, 0.24, 0.16, ry);
        }
        const midR = at(uMid, vc);
        batches.ridge.box(midR.x, ridgeY - 0.06, midR.z, eaveW + 0.1, 0.16, 0.32, ry);
      }
    } else {
      stats.flatRoofs++;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length];
        const dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz);
        if (len < 2) continue;
        const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
        const side = signedArea(ring) > 0 ? 1 : -1;
        const nx = side * dz / len, nz = -side * dx / len;
        const frameRy = -Math.atan2(dz, dx);
        batches.wall.box(mx + nx * 0.06, top, mz + nz * 0.06, len, 0.55, 0.2, frameRy);
        batches.trim.box(mx + nx * 0.06, top + 0.55, mz + nz * 0.06, len + 0.06, 0.1, 0.3, frameRy);
      }
    }

    // ---- 1b. 立面材质带：深灰仿石勒脚 + 白色腰线（2026-03-14 评论图 / A区41栋照片）----
    // 只做沿环的薄构件，不动 buildings.js 的墙身与窗；上部面砖保持统一米黄展示色，
    // A区照片里的红褐面砖未逐栋绑定，不整圈换色。
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz);
      if (len < 1.5) continue;
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
      const nx = areaSign * dz / len, nz = -areaSign * dx / len;
      const eRy = -Math.atan2(dz, dx);
      batches.stoneBase.box(mx + nx * 0.09, 0.22, mz + nz * 0.09, len, 2.18, 0.18, eRy);
      batches.band.box(mx + nx * 0.1, 2.42, mz + nz * 0.1, len, 0.16, 0.22, eRy);
      batches.band.box(mx + nx * 0.1, top - 0.4, mz + nz * 0.1, len, 0.18, 0.24, eRy);
      stats.stoneBands++;
    }

    // ---- 2. 南向阳台：只给长边基本朝南/北的板楼，逐层重复 ----
    const longEdgeFacesSouth = vz > 0.5;
    const longEdgeFacesNorth = vz < -0.5;
    if (L >= 14 && floors >= 3 && (longEdgeFacesSouth || longEdgeFacesNorth)) {
      const bayCount = Math.max(1, Math.round(L / 9.6));
      const bayPitch = L / bayCount;
      const balconyW = Math.max(2.2, Math.min(3.5, bayPitch / 2 - 1.0));
      const depth = 1.25;
      const vSign = longEdgeFacesSouth ? 1 : -1;
      for (let bay = 0; bay < bayCount; bay++) {
        const bcx = -L / 2 + bayPitch * (bay + 0.5);
        for (const off of [-bayPitch / 4, bayPitch / 4]) {
          const u = bcx + off;
          for (let f = 1; f < floors; f++) {
            const y = 0.22 + f * storey;
            const p = at(u, vSign * (W / 2 + depth / 2));
            batches.slab.box(p.x, y, p.z, balconyW, 0.14, depth, ry);
            const r = at(u, vSign * (W / 2 + depth - 0.06));
            batches.balcony.box(r.x, y + 0.14, r.z, balconyW, 0.92, 0.1, ry);
            batches.rail.box(r.x, y + 1.06, r.z, balconyW, 0.07, 0.16, ry);
            for (const s of [-1, 1]) {
              const q = at(u + s * (balconyW / 2 - 0.05), vSign * (W / 2 + depth / 2));
              batches.balcony.box(q.x, y + 0.14, q.z, 0.1, 0.92, depth - 0.1, ry);
            }
            stats.balconies++;
          }
        }
      }
      records[records.length - 1].balconyRows = floors - 1;
    }

    // ---- 3. 单元门、雨棚与台阶（背向阳台的一侧）----
    if (floors >= 3 && L >= 14 && (longEdgeFacesSouth || longEdgeFacesNorth)) {
      const bayCount = Math.max(1, Math.round(L / 9.6));
      const bayPitch = L / bayCount;
      const vSign = longEdgeFacesSouth ? -1 : 1;
      const balSign = -vSign;
      for (let bay = 0; bay < bayCount; bay++) {
        const u = -L / 2 + bayPitch * (bay + 0.5);
        const d = at(u, vSign * (W / 2 + 0.05));
        batches.door.box(d.x, 0.22, d.z, 1.15, 2.25, 0.12, ry);
        const c = at(u, vSign * (W / 2 + 0.6));
        batches.trim.box(c.x, 2.55, c.z, 2.6, 0.14, 1.25, ry);
        // 深红色雨棚面层：评论图里的单元门小雨棚做法。
        batches.awning.box(c.x, 2.68, c.z, 2.72, 0.1, 1.32, ry);
        const s = at(u, vSign * (W / 2 + 0.42));
        batches.plinth.box(s.x, 0.22, s.z, 2.2, 0.16, 0.75, ry);
        // 外挂空调机：评论图/E区照片里阳台侧上部两层各一台。
        for (let f = 1; f <= Math.min(2, floors - 1); f++) {
          const acp = at(u + bayPitch * 0.3, balSign * (W / 2 + 0.36));
          batches.ac.box(acp.x, 0.22 + f * storey + 0.95, acp.z, 0.78, 0.55, 0.42, ry);
          stats.acUnits++;
        }
        stats.entrances++;
      }
    }

    // ---- 3b. 单元门之间的绿篱：卫星图上每排楼前的连续绿化带，避开临街商铺 ----
    if (floors >= 3 && L >= 14 && (longEdgeFacesSouth || longEdgeFacesNorth)) {
      const vSign = longEdgeFacesSouth ? -1 : 1;
      const mid = at(0, vSign * (W / 2 + 2.2));
      const roadHit = nearestRoadHit(mid.x, mid.z, 30);
      const facesStreet = roadHit && roadHit.dist <= Math.max(roadHit.road.w / 2 + 14, 22);
      if (!facesStreet) {
        const bayCount = Math.max(1, Math.round(L / 9.6));
        const bayPitch = L / bayCount;
        for (let k = 1; k < bayCount; k++) {
          const p = at(-L / 2 + bayPitch * k, vSign * (W / 2 + 2.2));
          const batch = k % 2 ? batches.hedge : batches.hedgeLight;
          batch.box(p.x, 0.22, p.z, Math.min(5.6, bayPitch * 0.52), 0.6, 0.9, ry);
          stats.hedges++;
        }
      }
    }

    // ---- 3c. 楼前草地与单元门铺装：填掉住宅基底上的大面积空白 ----
    if (floors >= 3 && L >= 14 && (longEdgeFacesSouth || longEdgeFacesNorth)) {
      const vSign = longEdgeFacesSouth ? -1 : 1;
      const g = at(0, vSign * (W / 2 + 2.2));
      batches.grass.box(g.x, 0.232, g.z, Math.max(6, L - 2), 0.02, 2.4, ry);
      const a = at(0, vSign * (W / 2 + 0.9));
      batches.apron.box(a.x, 0.236, a.z, Math.max(6, L - 2), 0.02, 1.6, ry);
      stats.groundStrips++;
    }

    // ---- 3d. 植草砖停车带（2026-03-14 评论图）：入口一侧绿带之外、车道边 ----
    // 楼间绿带占 3.6–6.2 m（tools/add-wode-row-greens.py），车位带放在 6.4–8.8 m，
    // 与绿带、楼前铺装分层不重叠；与其他来源楼体的包围盒相交时跳过，不穿楼。
    if (floors >= 3 && L >= 18 && (longEdgeFacesSouth || longEdgeFacesNorth)) {
      const vSign = longEdgeFacesSouth ? -1 : 1;
      const parkW = Math.max(6, L - 5);
      const mid = at(0, vSign * (W / 2 + 7.6));
      // 车位带沿线多点采样与全部来源楼体包围盒求交，长带中部贴楼也跳过，不穿楼。
      const probes = [];
      for (let s = 0; s <= 8; s++) {
        for (const v of [-1.2, 0, 1.2]) probes.push(at(-parkW / 2 + parkW * s / 8, vSign * (W / 2 + 7.6) + v));
      }
      let clash = false;
      for (const o of occupied) {
        if (o === b) continue;
        for (const c of probes) {
          if (c.x > o.minX - 0.5 && c.x < o.maxX + 0.5 && c.z > o.minZ - 0.5 && c.z < o.maxZ + 0.5) { clash = true; break; }
        }
        if (clash) break;
      }
      if (!clash) {
        batches.parkGrid.box(mid.x, 0.232, mid.z, parkW, 0.022, 2.4, ry);
        const bays = Math.max(2, Math.round(parkW / 2.6));
        for (let k = 0; k <= bays; k++) {
          const q = at(-parkW / 2 + parkW * k / bays, vSign * (W / 2 + 7.6));
          batches.parkLine.box(q.x, 0.246, q.z, 0.12, 0.012, 2.4, ry);
        }
        stats.parkBays += bays;
        parkingAnchors.push({ x: mid.x, z: mid.z, ux, uz, parkW });
      }
    }

    // ---- 4. 临街底层商铺：玻璃门面、竖梃、分户店招 ----
    if (height > 5.5) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz);
      if (len < 5) continue;
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
      const nx = areaSign * dz / len, nz = -areaSign * dx / len;
      const hit = nearestRoadHit(mx, mz, 30);
      if (!hit || hit.dist > Math.max(hit.road.w / 2 + 14, 22)) continue;
      // 立面外法线必须朝向道路：背面不做商铺。
      if (nx * hit.toRoadX + nz * hit.toRoadZ < 0.25) continue;
      const eRy = -Math.atan2(dz, dx);
      const shopW = len - 0.8;
      if (shopW < 4) continue;
      stats.shopEdges++;
      batches.glass.box(mx + nx * 0.1, 0.22, mz + nz * 0.1, shopW, 2.85, 0.1, eRy);
      batches.plinth.box(mx + nx * 0.11, 0.22, mz + nz * 0.11, shopW, 0.42, 0.16, eRy);
      const tx = dx / len, tz = dz / len;
      for (let u = -shopW / 2; u <= shopW / 2 + 0.01; u += 1.7) {
        batches.frame.box(mx + tx * u + nx * 0.16, 0.22, mz + tz * u + nz * 0.16, 0.09, 2.85, 0.14, eRy);
      }
      batches.frame.box(mx + nx * 0.16, 2.62, mz + nz * 0.16, shopW, 0.08, 0.14, eRy);
      batches.shopBase.box(mx + nx * 0.16, 3.1, mz + nz * 0.16, shopW, 0.95, 0.3, eRy);
      const signCount = Math.max(1, Math.round(shopW / 4.2));
      const signW = shopW / signCount;
      for (let s = 0; s < signCount; s++) {
        const u = -shopW / 2 + signW * (s + 0.5);
        const px = mx + tx * u + nx * 0.34, pz = mz + tz * u + nz * 0.34;
        // 店名按立面朝向取标准图 POI 组（南=临安西路、东=河滨路、西=长安路）。
        const sideKeys = nz > 0.5 ? SHOP_BY_SIDE.south
          : nx > 0.5 ? SHOP_BY_SIDE.east
            : nx < -0.5 ? SHOP_BY_SIDE.west : SHOP_BY_SIDE.generic;
        const idx = sideKeys[Math.floor(rand() * sideKeys.length)];
        const [u0, v0, u1, v1] = atlas.uvFor(idx);
        // 朝向街道的横向基向量：右 = (nz, 0, -nx)。按 右×上 得到外法线，
        // 因此“左下→右下→右上→左上”的绕向既朝外，也不会把字镜像。
        const rx = nz, rz = -nx;
        const hw = signW / 2 - 0.1;
        const y0 = 3.14, y1 = 4.0;
        const bl = [px - rx * hw, y0, pz - rz * hw], br = [px + rx * hw, y0, pz + rz * hw];
        const tr = [px + rx * hw, y1, pz + rz * hw], tl = [px - rx * hw, y1, pz - rz * hw];
        batches.sign.quad(bl, br, tr, tl, null, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
        stats.signs++;
      }
      if (rand() < 0.55) {
        const [ax, az] = [mx + nx * 0.75, mz + nz * 0.75];
        batches.awning.box(ax, 4.05, az, Math.min(shopW, 6), 0.1, 1.4, eRy);
      }
    }

    // ---- 5. 平屋顶设备：楼梯间、水箱、太阳能 ----
    if (!roofable) {
      const side = rand() < 0.5 ? -1 : 1;
      const bq = at(side * L * 0.25, 0);
      batches.wall.box(bq.x, top, bq.z, 3.1, 2.6, 2.6, ry);
      batches.trim.box(bq.x, top + 2.6, bq.z, 3.4, 0.12, 2.9, ry);
      if (W > 8) {
        const t = at(L * 0.3, W * 0.15);
        batches.tank.box(t.x, top, t.z, 1.6, 1.5, 1.6, ry);
        for (let s = 0; s < 4; s++) {
          const p = at(-L * 0.34 + s * 2.4, -W * 0.16);
          batches.solar.box(p.x, top + 0.25, p.z, 1.9, 0.09, 1.35, ry);
          batches.frame.box(p.x, top, p.z, 0.08, 1.25, 0.08, ry);
        }
      }
    }
  }

  // ---- 6. 出入口：高德标准图（2026-11-14）图示的西门/南门/南1门/南2门 ----
  // 门址按图示定位（±10 m）；门柱、名牌、道闸、门卫室为类型化估计，无门楼实拍。
  for (const g of GATES) {
    const alongX = Math.abs(g.fx) > 0.5 ? 0 : 1, alongZ = Math.abs(g.fx) > 0.5 ? 1 : 0;
    const gateRy = Math.abs(g.fx) > 0.5 ? Math.PI / 2 : 0;
    for (const s of [-1, 1]) {
      const px = g.x + alongX * s * 3.4, pz = g.z + alongZ * s * 3.4;
      batches.gateStone.box(px, 0.22, pz, 0.85, 3.1, 0.85);
      batches.trim.box(px, 3.32, pz, 1.05, 0.16, 1.05);
    }
    // 名牌横梁：石材底板 + 两面金字题名（题名来自地图名称，不是照片题名）。
    // 盒子 UV 会把文字镜像，这里用与店招相同的“右×上”面片绕向保证两面都可读。
    batches.gateStone.box(g.x + g.fx * 0.25, 3.12, g.z + g.fz * 0.25, 5.8, 1.1, 0.3, gateRy);
    const px0 = g.x + g.fx * 0.42, pz0 = g.z + g.fz * 0.42;
    const rx = g.fz, rz = -g.fx;
    for (const s of [1, -1]) {
      const hw = 2.7, y0 = 2.62, y1 = 3.72;
      const bl = [px0 - rx * s * hw, y0, pz0 - rz * s * hw], br = [px0 + rx * s * hw, y0, pz0 + rz * s * hw];
      const tr = [px0 + rx * s * hw, y1, pz0 + rz * s * hw], tl = [px0 - rx * s * hw, y1, pz0 - rz * s * hw];
      batches.plaque.quad(bl, br, tr, tl, null, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    // 道闸：立柱 + 横杆，横杆沿门洞方向。
    const bx = g.x - g.fx * 1.4, bz = g.z - g.fz * 1.4;
    batches.barrier.box(bx + alongX * 2.4, 0.22, bz + alongZ * 2.4, 0.18, 1.1, 0.18);
    batches.barrier.box(bx + alongX * 0.1, 1.22, bz + alongZ * 0.1, 4.6, 0.12, 0.12, gateRy);
    // 门卫室：门洞一侧的小盒子房。
    const qx = g.x + alongX * 6.0 + g.fx * 1.1, qz = g.z + alongZ * 6.0 + g.fz * 1.1;
    batches.booth.box(qx, 0.22, qz, 2.7, 2.75, 2.7);
    batches.trim.box(qx, 2.97, qz, 3.0, 0.14, 3.0);
    batches.glass.box(qx + g.fx * 1.4, 1.1, qz + g.fz * 1.4, 1.6, 1.1, 0.08, gateRy);
    stats.gates++;
  }

  // ---- 7. 充电桩：2026-03-14 评论图同款，放靠中央庭院的两处植草砖车位端头 ----
  parkingAnchors.sort((p, q) =>
    Math.hypot(p.x - 580, p.z - 2053) - Math.hypot(q.x - 580, q.z - 2053));
  for (const p of parkingAnchors.slice(0, 2)) {
    const ex = p.x + p.ux * p.parkW * 0.36, ez = p.z + p.uz * p.parkW * 0.36;
    const eRy = -Math.atan2(p.uz, p.ux);
    batches.booth.box(ex, 0.232, ez, 0.62, 1.35, 0.42, eRy);
    batches.shopBase.box(ex, 1.1, ez, 0.5, 0.42, 0.46, eRy);
    stats.evPiles++;
  }

  for (const batch of Object.values(batches)) {
    const mesh = batch.build();
    if (mesh) group.add(mesh);
  }
  group.userData = {
    photoBasis: 'AMap satellite/standard layers 2026-11-13 + z18 mosaic 2026-11-14 (capture dates unpublished), courtyard aerial, 2026-03-14 comment photo, A区/E区 place photos and AMap standard-map gate/POI labels; roof tones, gates, balconies and shop names are type estimates',
    stats,
    records,
    roofSplitNote: `中部长轴以西（x<${ROOF_RED_LIMIT_X}）判读为陶土瓦，以东为浅灰瓦`,
    gateNote: '门址按高德标准图图示定位（±10 m）；照片未见门楼题名，门柱/道闸/门卫室为类型化估计',
    facadeNote: '勒脚与白色腰线依据 2026-03-14 评论图与 A区41栋照片；上部面砖统一米黄展示色，A区红褐面砖未逐栋绑定'
  };
  root.add(group);
  return { group, stats };
}

export { buildWodeDistrict };
