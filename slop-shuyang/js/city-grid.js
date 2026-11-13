import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BLOCKS,
  ROADS,
  PARKS,
  LANDMARK_SITES,
  ISLAND_BOUNDS,
  WATER_RINGS,
  WATER_POLYGONS,
  isWater,
  blockAt,
  nearestRoads
} from './city-config.js';
import { GEO } from './shuyang-geodata.js';
import {
  createModernRoadSurfaceMaterial,
  createModernSidewalkMaterial,
  createCurbMaterial,
  createWaterMaterial,
  createParkLawnMaterial
} from './tsl-materials.js';

// 沭阳城区的地面几何：河湖水系、路网沥青、路缘石人行道、街区地块与公园绿地。
// 交通、建筑与街道设施都由这里输出的矩形数据继续构建。

const WORLD = 12000; // 地面栅格覆盖 ±12 km
const GROUND_RES = 30;
// 地标保留区内不种公园树，避免树冠遮住牌坊、雕像、塔楼和体育场。
const LANDMARK_RESERVES = Object.values(LANDMARK_SITES).filter(s=>!s.preserveParkLandscape);
const inLandmarkReserve = (x, z) => LANDMARK_RESERVES.some((s) => Math.abs(x - s.x) < s.w / 2 && Math.abs(z - s.z) < s.d / 2);
function insideRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const PARK_PAVING=(GEO.urban?.surfaces||[]).filter(s=>['plaza','parking','soccer','basketball','sports-ground','running-track','infield','court','sport-paving'].includes(s.kind))
  .flatMap(s=>s.polygons.map(p=>{
    const pts=r=>{const out=[];for(let i=0;i<r.length;i+=2)out.push({x:r[i],z:r[i+1]});return out;};
    const outer=pts(p.outer);return {outer,holes:p.holes.map(pts),minX:Math.min(...outer.map(p=>p.x)),maxX:Math.max(...outer.map(p=>p.x)),
      minZ:Math.min(...outer.map(p=>p.z)),maxZ:Math.max(...outer.map(p=>p.z))};
  }));
function onMappedPaving(x,z){
  return PARK_PAVING.some(p=>x>=p.minX&&x<=p.maxX&&z>=p.minZ&&z<=p.maxZ&&insideRing(p.outer,x,z)&&!p.holes.some(h=>insideRing(h,x,z)));
}
function nearMappedPath(x, z) {
  for (const [, , width, bridge, pts] of GEO.mapPaths || []) {
    if (bridge) continue;
    const radius = width / 2 + 2.5;
    for (let i = 2; i < pts.length; i += 2) {
      const ax = pts[i - 2], az = pts[i - 1], dx = pts[i] - ax, dz = pts[i + 1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - ax - t * dx, z - az - t * dz) < radius) return true;
    }
  }
  return false;
}

let parkTreeSites = [];
let parkLampSites = [];
let sidewalkBlocks = [];
const pavedPlazaRects = [];
const centralParkClearings = [];

function createWorldXZShape(pts) {
  const shape = new THREE.Shape();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  }
  shape.closePath();
  return shape;
}

function createExtrudedPolygonMesh(pts, bottomY, height, material, receiveShadow = true, castShadow = false) {
  const shape = createWorldXZShape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bottomY, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = receiveShadow;
  mesh.castShadow = castShadow;
  return mesh;
}

function createFlatPolygonMesh(pts, y, material, receiveShadow = true) {
  const shape = createWorldXZShape(pts);
  const geo = new THREE.ShapeGeometry(shape, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function createFlatLandMesh(rings, y, material) {
  const shape=createWorldXZShape(rings[0]);
  for(const ring of rings.slice(1)) {
    const hole=new THREE.Path();
    ring.forEach((p,i)=>i?hole.lineTo(p.x,-p.z):hole.moveTo(p.x,-p.z));
    hole.closePath();shape.holes.push(hole);
  }
  const geo=new THREE.ShapeGeometry(shape,1);geo.rotateX(-Math.PI/2);geo.translate(0,y,0);
  const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;return mesh;
}

function offsetPolygonInward(pts, d) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
  const sign = a > 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i + pts.length - 1) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const d0x = p1.x - p0.x, d0z = p1.z - p0.z;
    const d1x = p2.x - p1.x, d1z = p2.z - p1.z;
    const l0 = Math.hypot(d0x, d0z) || 1;
    const l1 = Math.hypot(d1x, d1z) || 1;
    const n0x = (d0z / l0) * sign, n0z = (-d0x / l0) * sign;
    const n1x = (d1z / l1) * sign, n1z = (-d1x / l1) * sign;
    let mx = n0x + n1x, mz = n0z + n1z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const scale = Math.min(3, 1 / Math.max(0.35, mx * n0x + mz * n0z));
    out.push({ x: p1.x + mx * d * scale, z: p1.z + mz * d * scale });
  }
  return out;
}

// 沿折线生成一条等宽带（路面、河岸等）
function ribbonGeometry(pts, width, y = 0) {
  const pos = [], nor = [], uv = [], idx = [];
  const half = width / 2;
  let dist = 0;
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next.x - prev.x, dz = next.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    let nx = -dz, nz = dx;
    if (i > 0 && i < pts.length - 1) {
      let ax = p.x - prev.x, az = p.z - prev.z;
      let bx = next.x - p.x, bz = next.z - p.z;
      const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
      ax /= la; az /= la; bx /= lb; bz /= lb;
      const n0x = -az, n0z = ax, n1x = -bz, n1z = bx;
      let mx = n0x + n1x, mz = n0z + n1z;
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml; mz /= ml;
      const scale = Math.min(3, 1 / Math.max(0.35, mx * n0x + mz * n0z));
      nx = mx * scale; nz = mz * scale;
    }
    left.push({ x: p.x + nx * half, z: p.z + nz * half });
    right.push({ x: p.x - nx * half, z: p.z - nz * half });
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    const base = pos.length / 3;
    pos.push(
      left[i].x, y, left[i].z,
      right[i].x, y, right[i].z,
      left[i + 1].x, y, left[i + 1].z,
      right[i + 1].x, y, right[i + 1].z
    );
    for (let k = 0; k < 4; k++) nor.push(0, 1, 0);
    uv.push(0, dist, 1, dist, 0, dist + L, 1, dist + L);
    // XZ ribbons must wind upward; the opposite order culls every road from street/aerial views.
    idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    dist += L;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

// 垂直河岸墙：沿多边形边界从 waterY 拉到 topY
function quayWallGeometry(ring, waterY, topY) {
  const pos = [], nor = [], uv = [], idx = [];
  let dist = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 0.5) continue;
    const nx = (b.z - a.z) / L, nz = -(b.x - a.x) / L;
    const base = pos.length / 3;
    pos.push(a.x, waterY, a.z, b.x, waterY, b.z, a.x, topY, a.z, b.x, topY, b.z);
    for (let k = 0; k < 4; k++) nor.push(nx, 0, nz);
    uv.push(0, dist, 1, dist, 0, dist + L, 1, dist + L);
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    dist += L;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function mergeInto(group, geos, material, cast = false, name = 'Merged') {
  if (!geos.length) return null;
  let first = null;
  for (let i = 0; i < geos.length; i += 300) {
    const m = new THREE.Mesh(mergeGeometries(geos.slice(i, i + 300), false), material);
    m.receiveShadow = true;
    m.castShadow = cast;
    m.name = name;
    group.add(m);
    first ||= m;
  }
  return first;
}

// 批量合并同材质的静态网格（landmarks.js 使用）
function batchStaticGroupMeshes(rootGroup, excludeMaterials = null) {
  rootGroup.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(rootGroup.matrixWorld).invert();
  const buckets = new Map();
  rootGroup.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || !obj.geometry || !obj.material) return;
    if (excludeMaterials && excludeMaterials.has(obj.material)) return;
    const attrs = obj.geometry.attributes;
    if (!attrs.position || !attrs.normal || !attrs.uv) return;
    if (!buckets.has(obj.material)) buckets.set(obj.material, []);
    buckets.get(obj.material).push(obj);
  });
  for (const [mat, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const geos = [];
    let anyCast = false;
    let anyReceive = false;
    for (const m of meshes) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const key of Object.keys(g.attributes)) {
        if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
      }
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(invRoot, m.matrixWorld));
      geos.push(g);
      if (m.castShadow) anyCast = true;
      if (m.receiveShadow) anyReceive = true;
      if (m.parent) m.parent.remove(m);
    }
    const merged = mergeGeometries(geos, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = anyCast;
      mesh.receiveShadow = anyReceive;
      rootGroup.add(mesh);
    }
  }
}

// 水系栅格：水体格子为 0，其余为陆地；行内的连续陆地合并成矩形，避免三角剖分遇到跨边界的水面
function buildGround(scene, group) {
  const n = Math.ceil((WORLD * 2) / GROUND_RES) + 1;
  const x0 = -WORLD;
  const z0 = -WORLD;
  const water = new Uint8Array(n * n);
  for (const rings of WATER_POLYGONS) {
    const ring=rings[0];
    if (ring.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of ring) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const j0 = Math.max(0, Math.floor((minZ - z0) / GROUND_RES));
    const j1 = Math.min(n - 1, Math.ceil((maxZ - z0) / GROUND_RES));
    const i0 = Math.max(0, Math.floor((minX - x0) / GROUND_RES));
    const i1 = Math.min(n - 1, Math.ceil((maxX - x0) / GROUND_RES));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * GROUND_RES;
      const xs = [];
      for(const contour of rings) for (let k = 0, l = contour.length - 1; k < contour.length; l = k++) {
        const a = contour[l], b = contour[k];
        if ((a.z > z) !== (b.z > z)) xs.push(a.x + ((z - a.z) * (b.x - a.x)) / (b.z - a.z));
      }
      xs.sort((a, b) => a - b);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const ii0 = Math.max(i0, Math.ceil((xs[m] - x0) / GROUND_RES - 0.5));
        const ii1 = Math.min(i1, Math.floor((xs[m + 1] - x0) / GROUND_RES - 0.5));
        for (let i = ii0; i <= ii1; i++) water[j * n + i] = 1;
      }
    }
  }
  // 河道中心线（无水面多边形的运河/沟渠）：按宽度压进水面栅格
  for (const line of GEO.water.lines) {
    const pts = [];
    for (let i = 0; i < line.pts.length; i += 2) pts.push({ x: line.pts[i], z: line.pts[i + 1] });
    const rad = Math.max(3, line.w / 2);
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L2 = dx * dx + dz * dz || 1e-9;
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - rad - z0) / GROUND_RES));
      const j1 = Math.min(n - 1, Math.ceil((Math.max(a.z, b.z) + rad - z0) / GROUND_RES));
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - rad - x0) / GROUND_RES));
      const i1 = Math.min(n - 1, Math.ceil((Math.max(a.x, b.x) + rad - x0) / GROUND_RES));
      for (let j = j0; j <= j1; j++) {
        const pz = z0 + (j + 0.5) * GROUND_RES;
        for (let i = i0; i <= i1; i++) {
          const px = x0 + (i + 0.5) * GROUND_RES;
          let t = ((px - a.x) * dx + (pz - a.z) * dz) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = a.x + t * dx - px, ez = a.z + t * dz - pz;
          if (ex * ex + ez * ez <= rad * rad) water[j * n + i] = 1;
        }
      }
    }
  }
  // Replace complete coarse cells with exact land-minus-water geometry in reviewed areas.
  for(const {bounds:b} of GEO.water.groundPatches||[]) {
    for(let j=Math.max(0,Math.round((b.minZ-z0)/GROUND_RES));j<Math.min(n,Math.round((b.maxZ-z0)/GROUND_RES));j++)
      for(let i=Math.max(0,Math.round((b.minX-x0)/GROUND_RES));i<Math.min(n,Math.round((b.maxX-x0)/GROUND_RES));i++)water[j*n+i]=1;
  }
  // 30 m 栅格上的陆地：每行的连续陆地段生成一个矩形
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j < n; j++) {
    let i = 0;
    while (i < n) {
      if (water[j * n + i]) { i++; continue; }
      let k = i;
      while (k + 1 < n && !water[j * n + k + 1]) k++;
      const base = pos.length / 3;
      const ax = x0 + i * GROUND_RES;
      const bx = x0 + (k + 1) * GROUND_RES;
      const az = z0 + j * GROUND_RES;
      const bz = az + GROUND_RES;
      pos.push(ax, 0, az, bx, 0, az, ax, 0, bz, bx, 0, bz);
      for (let q = 0; q < 4; q++) nor.push(0, 1, 0);
      uv.push(0, 0, 1, 0, 0, 1, 1, 1);
      // 注意绕序：从上方看必须是逆时针，否则地面会被背面剔除，露出下方水面（道路看起来泡在水里）。
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      i = k + 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardNodeMaterial({ color: 0x6f7565, roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ShuyangGround';
  mesh.receiveShadow = true;
  group.add(mesh);
  for(const patch of GEO.water.groundPatches||[]) for(const poly of patch.land) {
    const rings=poly.map(r=>{const p=[];for(let i=0;i<r.length;i+=2)p.push({x:r[i],z:r[i+1]});return p;});
    const land=createFlatLandMesh(rings,0,mat);land.name='ShuyangReviewedShoreLand';group.add(land);
  }

  // 水面
  const waterMat = createWaterMaterial();
  const plane = new THREE.PlaneGeometry(60000, 60000, 1, 1);
  plane.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(plane, waterMat);
  waterMesh.position.y = ISLAND_BOUNDS.waterLevel;
  waterMesh.name = 'ShuyangWater';
  group.add(waterMesh);
  return waterMesh;
}

function buildCityGrid(scene) {
  const group = new THREE.Group();
  group.name = 'ShuyangCityGrid';
  const T0 = performance.now();
  const mark = (label) => console.info(`[cityGrid] ${label} ${Math.round(performance.now() - T0)}ms`);

  mark('start');
  buildGround(scene, group);
  mark('ground');

  // 路面
  const roadMat = createModernRoadSurfaceMaterial();
  const roadGeos = [];
  const bridgeGeos = [];
  for (const r of ROADS) {
    const pts = r.pts;
    if (pts.length < 2) continue;
    const geo = ribbonGeometry(pts, r.w + 0.8, 0.03 + (r.bridge ? 0.05 : 0));
    (r.bridge ? bridgeGeos : roadGeos).push(geo);
    if (r.bridge) {
      // 桥面板：路面向下 0.55 m 的板体
      const deck = ribbonGeometry(pts, r.w + 1.4, -0.25);
      bridgeGeos.push(deck);
    }
  }
  mergeInto(group, roadGeos, roadMat, false, 'ShuyangAsphalt');
  mergeInto(group, bridgeGeos, roadMat, true, 'ShuyangBridgeDecks');
  mark('roads');

  // 人行道 / 路缘石 / 地块
  const sidewalkMat = createModernSidewalkMaterial();
  const curbMat = createCurbMaterial();
  const lawnMat = createParkLawnMaterial(false);
  const meadowMat = createParkLawnMaterial(true);
  const SW_TOP = 0.22;
  const slabGeos = [];
  const lawnGeos = [];
  const curbGeos = [];
  const blockSlabRects = [];
  const roadSidewalkRects = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const rectSlabs = [];
  for (const b of BLOCKS) {
    // 城区边缘的超大田块/园区不做逐点多边形挤出：公园草坪稍后由 PARKS 统一绘制。
    if (b.area > 120000) continue;
    if (b.rect) {
      rectSlabs.push(b);
      blockSlabRects.push({
        cx: b.cx, cz: b.cz, w: b.maxX - b.minX, d: b.maxZ - b.minZ, block: b, cover: false
      });
      roadSidewalkRects.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ });
      continue;
    }
    const inner = offsetPolygonInward(b.poly, 0.3) || b.poly;
    if (b.park > 0.6) {
      lawnGeos.push(createExtrudedPolygonMesh(inner, 0.02, SW_TOP - 0.02, b.parkName ? meadowMat : lawnMat).geometry);
    } else {
      slabGeos.push(createExtrudedPolygonMesh(inner, 0.02, SW_TOP - 0.02, sidewalkMat).geometry);
    }
    curbGeos.push(createExtrudedPolygonMesh(b.poly, 0.0, 0.18, curbMat).geometry);
    for (const [x0, x1, z0, z1] of b.rects) {
      const pad = 3.4;
      const r = { minX: x0 - pad, maxX: x1 + pad, minZ: z0 - pad, maxZ: z1 + pad };
      blockSlabRects.push({
        cx: (r.minX + r.maxX) / 2, cz: (r.minZ + r.maxZ) / 2, w: r.maxX - r.minX, d: r.maxZ - r.minZ, block: b, cover: true
      });
      roadSidewalkRects.push(r);
    }
  }
  mergeInto(group, slabGeos, sidewalkMat, false, 'ShuyangSidewalks');
  mergeInto(group, lawnGeos, lawnMat, false, 'ShuyangParkBlocks');
  mergeInto(group, curbGeos, curbMat, false, 'ShuyangCurbs');

  if (rectSlabs.length) {
    const dummy = new THREE.Object3D();
    const sw = new THREE.InstancedMesh(unitBox, sidewalkMat, rectSlabs.length);
    const cu = new THREE.InstancedMesh(unitBox, curbMat, rectSlabs.length);
    sw.receiveShadow = true;
    cu.receiveShadow = true;
    rectSlabs.forEach((b, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(b.cx, 0.125, b.cz);
      dummy.scale.set(Math.max(0.5, b.maxX - b.minX - 0.5), 0.19, Math.max(0.5, b.maxZ - b.minZ - 0.5));
      dummy.updateMatrix();
      sw.setMatrixAt(i, dummy.matrix);
      dummy.position.set(b.cx, 0.095, b.cz);
      dummy.scale.set(b.maxX - b.minX, 0.17, b.maxZ - b.minZ);
      dummy.updateMatrix();
      cu.setMatrixAt(i, dummy.matrix);
    });
    sw.instanceMatrix.needsUpdate = true;
    cu.instanceMatrix.needsUpdate = true;
    sw.name = 'ShuyangSidewalkSlabs';
    cu.name = 'ShuyangCurbs';
    group.add(sw, cu);
  }
  mark('blocks');

  // 河岸挡墙：沿水面多边形边界，从水底拉到人行道高度
  const wallGeos = [];
  for (const ring of WATER_RINGS) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of ring) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    if (ring.length > 4000) continue;
    if (maxX < -6000 || minX > 8000 || maxZ < -6000 || minZ > 8000) continue;
    wallGeos.push(quayWallGeometry(ring, ISLAND_BOUNDS.waterLevel, 0.16));
  }
  const wallMat = new THREE.MeshStandardNodeMaterial({ color: 0x8d8b82, roughness: 0.9 });
  mergeInto(group, wallGeos, wallMat, false, 'ShuyangQuayWalls');
  mark('walls');

  // 公园绿地（街区之外的公园多边形）
  const parkGeos = [];
  const treeSites = [];
  const lampSites = [];
  for (const p of PARKS) {
    for(const rings of p.landPolygons) if(rings[0].length>=3)
      parkGeos.push(createFlatLandMesh(rings,0.05,lawnMat).geometry);
    for (const ring of p.rings) {
      if (ring.length < 3) continue;
      // 树：环内抖动网格
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const q of ring) {
        minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
        minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z);
      }
      for (let z = minZ + 8; z < maxZ - 8; z += 14) {
        for (let x = minX + 8; x < maxX - 8; x += 14) {
          const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
          if (h < 0.45) continue;
          const px = x + (h - 0.5) * 8;
          const pz = z + (Math.abs(Math.cos(x * 0.7 + z * 1.3) * 43758.5453) % 1 - 0.5) * 8;
          if (!insideRing(ring, px, pz) || isWater(px,pz) || onMappedPaving(px,pz) || inLandmarkReserve(px, pz)) continue;
          if (nearMappedPath(px, pz) || nearestRoads(px, pz, 40).some(({ road, dist }) => !road.bridge && dist < road.w / 2 + 2.5)) continue;
          treeSites.push({ x: px, y: 0.24, z: pz, scale: 0.8 + h * 0.5, species: h < 0.6 ? 1 : 0, tier: 1 });
          if (treeSites.length > 6000) break;
        }
        if (treeSites.length > 6000) break;
      }
    }
  }
  mergeInto(group, parkGeos, lawnMat, false, 'ShuyangParks');
  parkTreeSites = treeSites;
  parkLampSites = lampSites;
  mark('parks');

  // 城区外的田野/林地色块，增加远景层次
  const fieldGeos = [];
  const fieldMat = new THREE.MeshStandardNodeMaterial({ color: 0x5c6b46, roughness: 0.98 });
  for (const l of GEO.landuse) {
    if (!['farmland', 'orchard', 'forest', 'grass', 'meadow', 'industrial'].includes(l.kind)) continue;
    for (const ring of l.rings) {
      if (ring.length < 3) continue;
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push({ x: ring[i], z: ring[i + 1] });
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      }
      // 只画城区外围，城里的地块已由街区覆盖
      if (minX > ISLAND_BOUNDS.minX && maxX < ISLAND_BOUNDS.maxX && minZ > ISLAND_BOUNDS.minZ && maxZ < ISLAND_BOUNDS.maxZ) continue;
      fieldGeos.push(createFlatPolygonMesh(pts, 0.02, fieldMat).geometry);
    }
  }
  mergeInto(group, fieldGeos, fieldMat, false, 'ShuyangFields');
  mark('fields');

  sidewalkBlocks = blockSlabRects;
  scene.add(group);
  mark('done');
  return {
    group,
    sidewalks: roadSidewalkRects,
    footprints: [],
    highwayLanes: [],
    roadPaint: null,
    colliders: []
  };
}

function getStreetGroundHeight(x, z) {
  const b = blockAt(x, z);
  return b ? 0.22 : 0;
}

export {
  buildCityGrid,
  getStreetGroundHeight,
  batchStaticGroupMeshes,
  sidewalkBlocks,
  pavedPlazaRects,
  centralParkClearings,
  parkTreeSites,
  parkLampSites
};
