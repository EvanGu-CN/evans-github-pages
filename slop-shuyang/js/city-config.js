import { GEO } from './shuyang-geodata.js';
import { PHOTO_LANDMARK_SITES } from './landmark-data.js';

// 沭阳（江苏省宿迁市沭阳县）城区空间配置与街道数据库，1:1 真实尺度。
// 世界坐标：1 单位 = 1 米，x = 东，z = 南（北 = -z），原点在人民中路与上海中路交叉口。
// 数据来自 js/shuyang-geodata.js（tools/build-shuyang-geodata.mjs 由 OpenStreetMap 生成）。

const toPts = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], z: flat[i + 1] });
  return out;
};

// ---------------------------------------------------------------------------------------------------------------------
// 道路：每条 OSM 道路的中心线、宽度、车道与单行方向
// ---------------------------------------------------------------------------------------------------------------------
const ROADS = GEO.roads.map(([name, kind, w, lanes, dir, bridge, flat]) => ({
  name: name || '',
  kind,
  w,
  lanes,
  dir,
  bridge: !!bridge,
  pts: toPts(flat)
}));
const ROAD_BY_NAME = new Map();
for (const r of ROADS) {
  if (!r.name) continue;
  if (!ROAD_BY_NAME.has(r.name)) ROAD_BY_NAME.set(r.name, []);
  ROAD_BY_NAME.get(r.name).push(r);
}
// 最短的显示名（去掉“辅路/主线/高架/隧道”等后缀）
const shortName = (n) => n.replace(/(辅路|主线|高架|隧道|大桥)$/, '') || n;
for (const r of ROADS) r.short = shortName(r.name);

// 最近道路索引：64 m 网格
const ROAD_CELL = 64;
const ROAD_GRID = new Map();
for (const r of ROADS) {
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i];
    const b = r.pts[i + 1];
    const seg = { r, ax: a.x, az: a.z, bx: b.x, bz: b.z };
    const ix0 = Math.floor(Math.min(a.x, b.x) / ROAD_CELL), ix1 = Math.floor(Math.max(a.x, b.x) / ROAD_CELL);
    const iz0 = Math.floor(Math.min(a.z, b.z) / ROAD_CELL), iz1 = Math.floor(Math.max(a.z, b.z) / ROAD_CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = ix * 100000 + iz;
        if (!ROAD_GRID.has(k)) ROAD_GRID.set(k, []);
        ROAD_GRID.get(k).push(seg);
      }
    }
  }
}
/** 距 (x, z) 半径内的最近道路：[{ road, dist, horizontal }]，按距离排序，每条路一个 */
function nearestRoads(x, z, radius = 60) {
  const best = new Map();
  const ix0 = Math.floor((x - radius) / ROAD_CELL), ix1 = Math.floor((x + radius) / ROAD_CELL);
  const iz0 = Math.floor((z - radius) / ROAD_CELL), iz1 = Math.floor((z + radius) / ROAD_CELL);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iz = iz0; iz <= iz1; iz++) {
      const list = ROAD_GRID.get(ix * 100000 + iz);
      if (!list) continue;
      for (const s of list) {
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const L2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
        const d = Math.hypot(s.ax + t * dx - x, s.az + t * dz - z);
        if (d > radius) continue;
        const prev = best.get(s.r.name);
        if (!prev || d < prev.dist) best.set(s.r.name, { road: s.r, dist: d, horizontal: Math.abs(dx) > Math.abs(dz) });
      }
    }
  }
  return [...best.values()].sort((a, b) => a.dist - b.dist);
}
/** 最近的道路点（传送落点用）：{ x, z, road, heading } */
function nearestRoadPoint(x, z, radius = 400) {
  let best = null;
  let fallback = null;
  for (let r = 8; r <= radius && !best; r += 8) {
    for (const { road } of nearestRoads(x, z, r)) {
      if (road.bridge) continue;
      for (let i = 0; i + 1 < road.pts.length; i++) {
        const a = road.pts[i];
        const b = road.pts[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const L2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
        const px = a.x + t * dx, pz = a.z + t * dz;
        const d = Math.hypot(px - x, pz - z);
        const cand = { x: px, z: pz, road, dist: d, heading: Math.atan2(dx, dz) };
        if (!fallback || d < fallback.dist) fallback = cand;
        // 优先落在能通车的主路/次干道上，而不是大院里的 4.5 m 服务车道
        if (road.w >= 8 && road.kind !== 'service' && (!best || d < best.dist)) best = cand;
      }
    }
  }
  return best || fallback;
}

// ---------------------------------------------------------------------------------------------------------------------
// 街区：路网切出的每一块路缘岛（含人行道、地块矩形与公园比例）
// ---------------------------------------------------------------------------------------------------------------------
const BLOCK_CELL = 64;
const BLOCKS = GEO.blocks.map(([flatPoly, rects, park, parkName, isRect], id) => {
  const poly = toPts(flatPoly);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, a = 0, cx = 0, cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[i], q = poly[j];
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    const c = q.x * p.z - p.x * q.z;
    a += c; cx += (q.x + p.x) * c; cz += (q.z + p.z) * c;
  }
  a *= 0.5;
  return {
    id, poly, rects, park, parkName, rect: !!isRect,
    area: Math.abs(a),
    minX, maxX, minZ, maxZ,
    cx: a ? cx / (6 * a) : (minX + maxX) / 2,
    cz: a ? cz / (6 * a) : (minZ + maxZ) / 2,
    median: false
  };
});
const BLOCK_GRID = new Map();
for (const b of BLOCKS) {
  for (let ix = Math.floor(b.minX / BLOCK_CELL); ix <= Math.floor(b.maxX / BLOCK_CELL); ix++) {
    for (let iz = Math.floor(b.minZ / BLOCK_CELL); iz <= Math.floor(b.maxZ / BLOCK_CELL); iz++) {
      const k = ix * 100000 + iz;
      if (!BLOCK_GRID.has(k)) BLOCK_GRID.set(k, []);
      BLOCK_GRID.get(k).push(b);
    }
  }
}
function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
/** (x, z) 所在的路缘岛（人行道地块），在车行道上返回 null */
function blockAt(x, z) {
  const list = BLOCK_GRID.get(Math.floor(x / BLOCK_CELL) * 100000 + Math.floor(z / BLOCK_CELL));
  if (!list) return null;
  for (const b of list) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (b.rect || pointInPoly(b.poly, x, z)) return b;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// 水系：新沂河、淮沭河、柴沂河与城区河道/池塘
// ---------------------------------------------------------------------------------------------------------------------
const WATER_POLYGONS = GEO.water.polygons.map(p => p.rings.map(toPts));
// All shoreline rings, including islands, for quay walls. Membership uses polygons.
const WATER_RINGS = WATER_POLYGONS.flat();
const WATER_CELL = 128;
const WATER_GRID = new Map();
WATER_POLYGONS.forEach(([ring], id) => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  for (let ix = Math.floor(minX / WATER_CELL); ix <= Math.floor(maxX / WATER_CELL); ix++) {
    for (let iz = Math.floor(minZ / WATER_CELL); iz <= Math.floor(maxZ / WATER_CELL); iz++) {
      const k = ix * 100000 + iz;
      if (!WATER_GRID.has(k)) WATER_GRID.set(k, []);
      WATER_GRID.get(k).push(id);
    }
  }
});
/** (x, z) 是否在水面上 */
function isWater(x, z) {
  for (const id of WATER_GRID.get(Math.floor(x / WATER_CELL) * 100000 + Math.floor(z / WATER_CELL)) || []) {
    const [outer,...holes]=WATER_POLYGONS[id];
    if (pointInPoly(outer, x, z) && !holes.some(r=>pointInPoly(r,x,z))) return true;
  }
  return false;
}
// These four short Nanhu crossings are explicitly bridge-tagged map paths.
// Deck elevation is a display estimate; the centreline/width is source geometry.
const PARK_FOOTBRIDGES=(GEO.mapPaths||[]).filter(([,kind,,bridge,p])=>bridge&&['path','footway','pedestrian'].includes(kind)&&
  p.every((v,i)=>i%2?v>3390&&v<4170:v> -2530&&v< -1790)).map(([name,kind,width,,p])=>({name,kind,width:Math.max(1.8,width),points:toPts(p),deckHeight:.38}));
function getParkFootbridgeHeight(x,z){
  for(const b of PARK_FOOTBRIDGES)for(let i=1;i<b.points.length;i++){
    const a=b.points[i-1],c=b.points[i],dx=c.x-a.x,dz=c.z-a.z,L2=dx*dx+dz*dz;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(L2||1)));
    if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<=b.width/2+.1)return b.deckHeight;
  }
  return null;
}
/** (x, z) 是否在跨河桥上（桥面允许通行） */
function isOnBridge(x, z,mode='person') {
  for (const r of ROADS) {
    if (!r.bridge) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      if (Math.hypot(a.x + t * dx - x, a.z + t * dz - z) < r.w / 2 + 2.5) return true;
    }
  }
  return mode!=='car'&&mode!=='helicopter'&&getParkFootbridgeHeight(x,z)!==null;
}

// ---------------------------------------------------------------------------------------------------------------------
// 公园与地标
// ---------------------------------------------------------------------------------------------------------------------
const PARKS = GEO.parks.map((p) => ({ name: p.name, kind: p.kind, rings: p.rings.map(toPts),
  landPolygons:(p.landPolygons||p.rings.map(r=>[r])).map(poly=>poly.map(toPts)) }));
// Keep actual housing boundaries, including courtyards/holes and nested phases.
const NEIGHBORHOODS = (GEO.neighborhoods || []).map((n) => ({
  ...n, polygons: n.polygons.map((p) => ({ outer: toPts(p.outer), holes: p.holes.map(toPts) }))
})).sort((a, b) => a.area - b.area);
function neighborhoodAt(x, z) {
  return NEIGHBORHOODS.find((n) => x >= n.bounds[0] && z >= n.bounds[1] && x <= n.bounds[2] && z <= n.bounds[3] &&
    n.polygons.some((p) => pointInPoly(p.outer, x, z) && !p.holes.some((h) => pointInPoly(h, x, z)))) || null;
}

// 沭阳城区代表地标：坐标来自 OSM 实测地块/POI，保留区略大于单体建筑，
// 由 landmarks.js 生成专用模型；地图、搜索、传送与建筑避让共用这一份清单。
// w/d 是保留区尺寸（米），h 是模型控制高度（米）。
const LANDMARK_SITES = {
  '中央城市广场': { x: -153, z: 98, w: 230, d: 200, h: 150, kind: 'mixed', model: 'centralPlaza' },
  '沭阳县政府': { x: 2277, z: 1810, w: 320, d: 250, h: 30, kind: 'civic', model: 'civic' },
  '沭阳文化中心': { x: -2430, z: 4230, w: 360, d: 250, h: 24, kind: 'culture', model: 'culture' },
  '沭阳体育中心': { x: -613, z: 4675, w: 340, d: 300, h: 35, kind: 'sports', model: 'sports' },
  '沭阳站': { x: -1401, z: 1705, w: 230, d: 160, h: 20, kind: 'station', model: 'station' },
  '虞姬生态园': { x: 2425, z: 1408, w: 320, d: 280, h: 18, kind: 'park', model: 'yujiEcologicalPark', arrive: 130 },
  '南湖公园': { x: -2156, z: 3783, w: 340, d: 300, h: 18, kind: 'park', model: 'nanhuPark', arrive: 170 },
  '蓝天国际商贸城': { x: -195, z: -170, w: 260, d: 220, h: 32, kind: 'mall', model: 'mallBlue' },
  '万达广场': { x: -1375, z: 3412, w: 260, d: 230, h: 28, kind: 'mall', model: 'mallWanda' },
  '吴印咸故居': { x: -685, z: -930, w: 110, d: 95, h: 8, kind: 'heritage', model: 'courtyard' },
  '老沭棉厂文创街区': { x: -1430, z: -560, w: 190, d: 150, h: 12, kind: 'heritage', model: 'heritage', arrive: 85 },
  '沭河公园': { x: 1069, z: 3309, w: 230, d: 170, h: 12, kind: 'waterfront', model: 'sculpture', arrive: 85 }
};
for(const [name,site] of Object.entries(PHOTO_LANDMARK_SITES)) LANDMARK_SITES[name]={...LANDMARK_SITES[name],...site};
LANDMARK_SITES['中央城市广场'].h = 147.15;
LANDMARK_SITES['沭阳县政府'].h = 64;
// Legacy identifiers remain compatible; visible names now refer to verified places.
LANDMARK_SITES['老沭棉厂文创街区'] = LANDMARK_SITES['老服装厂城市休闲街区'];
LANDMARK_SITES['大润发'].front = {x:-1,z:0};
LANDMARK_SITES['吾悦广场'].front = {x:-1,z:0};
LANDMARK_SITES['吾悦广场'].viewTarget = {x:1856,z:2688};
LANDMARK_SITES['吾悦广场'].arrive = 130;
LANDMARK_SITES['沭阳文化中心'].front = {x:0,z:-1};
LANDMARK_SITES['沭阳文化中心'].viewTarget = {x:-2385,z:4180};
LANDMARK_SITES['沭阳文化中心'].arrive = 180;
LANDMARK_SITES['江苏省沭阳高级中学'].front = {x:Math.sin(-.63),z:Math.cos(-.63)};
LANDMARK_SITES['吴印咸故居'].front = {x:0,z:1};
LANDMARK_SITES['沭阳站'].front = {x:Math.sin(2.32),z:Math.cos(2.32)};
LANDMARK_SITES['沭阳站'].arrive = 135;
LANDMARK_SITES['万豪商务大厦'].front={x:0,z:-1};
LANDMARK_SITES['万豪商务大厦'].arrive=190;
LANDMARK_SITES['久盛百货'].front={x:-.5,z:.866};

// 地图、传送与街角标识用的地标（id 与 index.html 的传送按钮一致）
const LANDMARKS = [
  ['central', '中央城市广场', '中央商场', '人民路商圈'],
  ['gov', '沭阳县政府', '县政府', '政务中心'],
  ['culture', '沭阳文化中心', '文化中心', '南部新城'],
  ['sports', '沭阳体育中心', '体育中心', '南部新城'],
  ['station', '沭阳站', '沭阳站', '铁路片区'],
  ['yuji', '虞姬生态园', '虞姬生态园', '迎宾大道'],
  ['yujiPark','虞姬公园','虞姬公园','公园路19号 · 城北公园'],
  ['nanhu', '南湖公园', '南湖公园', '南部新城'],
  ['bluesky', '蓝天国际商贸城', '蓝天商贸城', '人民路商圈'],
  ['wanda', '万达广场', '万达广场', '南部新城'],
  ['wuyinxian', '吴印咸故居', '吴印咸故居', '老城'],
  ['cotton', '老服装厂城市休闲街区', '老服装厂', '人民西路'],
  ['shuhe', '沭水之阳', '沭水之阳', '新沂河大桥南端'],
  ['rtmart', '大润发', '大润发', '上海南路与苏州西路'],
  ['wuyue', '吾悦广场', '吾悦广场', '台州南路'],
  ['highschool', '江苏省沭阳高级中学', '沭阳高级中学', '东关大街本部'],
  ['mengxi', '江苏省沭阳梦溪中学', '梦溪中学', '苏州西路3号'],
  ['wanhao', '万豪商务大厦', '万豪大厦', '苏州西路'],
  ['jiusheng', '久盛百货', '久盛百货', '人民中路'],
  ['workersPalace','沭阳县工人文化宫（新馆）','工人文化宫','五里健身公园 · 永安路']
].map(([id, name, short, district]) => {
  const s = LANDMARK_SITES[name];
  return { id, name, short, district, x: s.x, z: s.z, w: s.w, d: s.d, h: s.h, kind: s.kind, model: s.model };
});
// 沭阳城区的大片绿地：用于天空开敞度与"in park"判断
const CENTRAL_PARK_BOUNDS = (() => {
  const park = PARKS.reduce((best, p) => {
    let a = 0;
    for (const ring of p.rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
    }
    a = Math.abs(a / 2);
    return !best || a > best.a ? { p, a } : best;
  }, null);
  if (!park) return { minX: -800, maxX: -200, minZ: -800, maxZ: -200 };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const ring of park.p.rings) for (const p of ring) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
})();
const CITY_BOUNDS = GEO.bounds;
const ISLAND_BOUNDS = {
  minX: CITY_BOUNDS.minX, maxX: CITY_BOUNDS.maxX,
  minZ: CITY_BOUNDS.minZ, maxZ: CITY_BOUNDS.maxZ,
  sidewalkHeight: 0.22, waterLevel: -1.8
};
// 天空反射着色器兼容用的空海岸线（沭阳是内陆平原城市）
const NJ_SHORELINE_POLYGON = [];
const LONG_ISLAND_POLYGONS = [];
function getIslandBoundsAtZ(z) {
  // 城区是一整片陆地（水系单独由 isWater 判断），返回城市东西边界
  return { westX: ISLAND_BOUNDS.minX, eastX: ISLAND_BOUNDS.maxX };
}

// 兼容旧代码的空街道表（新城市没有曼哈顿式编号街道）
const AVENUES = [];
const STREETS = [];
const ALL_AVENUES = [];
const ALL_STREETS = [];
const streetZ = () => 0;
const avenueX = () => 0;
function districtAt(x, z) {
  const d = Math.hypot(x, z);
  if (d < 900) return 'laocheng';
  if (x < -1800) return 'hexidao';
  if (x > 2200) return 'kaifaqu';
  if (z > 1600) return 'nanbu';
  if (z < -1200) return 'chengbei';
  return 'chengqu';
}

// 传送点：在地标附近的主路上取一个约 80 m 外的落点，并让角色面向地标，
// 避免传送到建筑墙根或背对地标时只看到一堵墙。
const TELEPORT_LOCATIONS = Object.fromEntries(LANDMARKS.map((lm) => {
  const site = LANDMARK_SITES[lm.name];
  const anchor = site?.viewTarget || lm;
  const p = nearestRoadPoint(anchor.x, anchor.z, 600) || { x: anchor.x, z: anchor.z };
  // 大地标退到 150-230 m，小院落/公园入口保持 80-150 m，保证镜头能看到完整体量。
  const target = site?.arrive || Math.max(82, Math.min(230, Math.max(lm.w, lm.d) * 0.75));
  let best = null;
  for (const { road } of nearestRoads(anchor.x, anchor.z, 650)) {
    if (road.bridge) continue;
    for (let i = 0; i + 1 < road.pts.length; i++) {
      const a = road.pts[i], b = road.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(L / 6));
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n;
        const z = a.z + (b.z - a.z) * k / n;
        const d = Math.hypot(x - anchor.x, z - anchor.z);
        if (d < target * 0.65 || d > target * 1.5) continue;
        const front = site?.front || {x:0,z:1};
        const facing = ((x-anchor.x)*front.x+(z-anchor.z)*front.z)/d;
        const score = Math.abs(d - target) + (1-facing)*target*1.6;
        if (!best || score < best.score) best = { x, z, score };
      }
    }
  }
  const x = best ? best.x : p.x;
  const z = best ? best.z : p.z;
  return [lm.id, { x, z, heading: Math.atan2(anchor.x - x, anchor.z - z) }];
}));

/** 旧的压缩坐标系映射（新城市直接使用世界坐标） */
const fromOldFrame = (x, z) => ({ x, z });

/**
 * (x, z) 处的地名：附近地标 / 公园 / 两条道路的交叉口
 */
function getLocationLabel(x, z) {
  const neighborhood = neighborhoodAt(x, z);
  for (const lm of LANDMARKS) {
    if(neighborhood && neighborhoodAt(lm.x,lm.z)?.id!==neighborhood.id) continue;
    if (Math.hypot(x - lm.x, z - lm.z) < Math.min(180, Math.max(90, Math.max(lm.w, lm.d) * 0.6))) {
      const near = nearestRoads(x, z, 140);
      const road = near.find((r) => !r.road.bridge) || near[0];
      return `${lm.name}${road ? ` · ${road.road.short}` : ''}`;
    }
  }
  for (const p of PARKS) {
    if (!p.name) continue;
    for (const ring of p.rings) {
      if (pointInPoly(ring, x, z)) {
        const near = nearestRoads(x, z, 160);
        return `${p.name}${near[0] ? ` · 近${near[0].road.short}` : ''}`;
      }
    }
  }
  if (neighborhood && !isWater(x, z)) return neighborhood.name;
  if (isWater(x, z)) {
    const poly = GEO.water.polygons.find((p) => p.name && pointInPoly(toPts(p.rings[0]), x, z) && !p.rings.slice(1).some(r=>pointInPoly(toPts(r),x,z)));
    return poly ? poly.name : '沭河水系';
  }
  const near = nearestRoads(x, z, 180);
  const a = near[0];
  const b = near[1];
  if (a && b && a.road.name !== b.road.name) return `${a.road.short} & ${b.road.short}`;
  if (a) return a.road.short;
  return '沭阳';
}

/** 跨区/编号参数（旧地标构建器的兼容入口） */
function getBlockBounds(col, row) {
  const b = BLOCKS[(row * 16 + col) % BLOCKS.length] || BLOCKS[0];
  return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, cx: b.cx, cz: b.cz, width: b.maxX - b.minX, depth: b.maxZ - b.minZ };
}

// 键盘快捷键在输入框内不触发
function isTypingInField(e) {
  return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.closest?.('dialog[open]'));
}

// 信号灯周期（秒）：主干道绿灯到 avenueAmber，黄灯到 avenueRed；次干道从 avenueRed 绿灯到 streetAmber
const SIGNAL_TIMING = { cycle: 60, avenueAmber: 26, avenueRed: 30, streetAmber: 56, walk: 7 };
function signalPhase(time, isAvenue) {
  const { cycle, avenueAmber, avenueRed, streetAmber } = SIGNAL_TIMING;
  const t = ((time % cycle) + cycle) % cycle;
  if (isAvenue) return t < avenueAmber ? 'green' : t < avenueRed ? 'amber' : 'red';
  return t < avenueRed ? 'red' : t < streetAmber ? 'green' : 'amber';
}
function walkSignal(time, isAvenue) {
  const { cycle, avenueRed, walk } = SIGNAL_TIMING;
  const t = (((time - (isAvenue ? 0 : avenueRed)) % cycle) + cycle) % cycle;
  return t < walk;
}

export {
  AVENUES,
  ALL_AVENUES,
  STREETS,
  ALL_STREETS,
  BLOCKS,
  ROADS,
  ROAD_BY_NAME,
  PARKS,
  NEIGHBORHOODS,
  neighborhoodAt,
  LANDMARKS,
  LANDMARK_SITES,
  TELEPORT_LOCATIONS,
  CENTRAL_PARK_BOUNDS,
  ISLAND_BOUNDS,
  CITY_BOUNDS,
  NJ_SHORELINE_POLYGON,
  LONG_ISLAND_POLYGONS,
  WATER_RINGS,
  WATER_POLYGONS,
  SIGNAL_TIMING,
  streetZ,
  avenueX,
  districtAt,
  blockAt,
  isWater,
  isOnBridge,
  PARK_FOOTBRIDGES,
  getParkFootbridgeHeight,
  nearestRoads,
  nearestRoadPoint,
  getBlockBounds,
  getLocationLabel,
  getIslandBoundsAtZ,
  fromOldFrame,
  isTypingInField,
  signalPhase,
  walkSignal
};
