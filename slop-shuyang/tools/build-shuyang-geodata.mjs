// tools/build-shuyang-geodata.mjs — writes js/shuyang-geodata.js and js/building-geodata.bin.gz
// Real 沭阳 (Shuyang, Jiangsu) geography from OpenStreetMap, in the simulation's world frame:
// 1 unit = 1 m, x = east, z = south (north = -z), origin at 人民中路 & 上海中路.
//
// usage: node --max-old-space-size=8192 tools/build-shuyang-geodata.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import polygonClip from '../js/vendor/polygon-clipping.js';
import { PHOTO_LANDMARK_SITES } from '../js/landmark-data.js';
import { reviewRoadSections } from '../js/road-photo-references.js';
import { roadRibbonTriangles } from '../js/road-ribbon.js';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data', 'shuyang');
const OUT = path.join(HERE, '..', 'js', 'shuyang-geodata.js');
const BUILDINGS_OUT = path.join(HERE, '..', 'js', 'building-geodata.bin.gz');
const log = (...a) => console.log('[shuyang]', ...a);
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

// =====================================================================================================================
// 1. FRAME
// =====================================================================================================================
const LAT0 = 34.1285; // 人民中路 & 上海中路
const LON0 = 118.7740;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110574;
const toWorld = (lon, lat) => [(lon - LON0) * KX, -(lat - LAT0) * KY];

// 只渲染沭阳城区：北到台州路森林公园/城北公园，南到学院路体育中心/南湖，
// 西到八一广场，东到虞姬公园/政务中心；乡镇与开发区远端不纳入。
// 范围约 6.6 × 7.4 km，48.8 km²，与武汉参考项目的核心区尺度一致。
const CORE = { minX: -3200, maxX: 3400, minZ: -2400, maxZ: 5000 };
const BOUNDS = { minX: CORE.minX, maxX: CORE.maxX, minZ: CORE.minZ, maxZ: CORE.maxZ };

// =====================================================================================================================
// 2. GEOMETRY HELPERS
// =====================================================================================================================
const q = (v) => Math.round(v * 10) / 10;
const q4 = (v) => Math.round(v * 1e4) / 1e4;
const flat = (pts) => pts.flatMap(([x, z]) => [q(x), q(z)]);

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}
function bbox(pts) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, x1, z0, z1 };
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
function rdpRing(ring, eps) {
  let i0 = 0;
  let far = 0, i1 = 0;
  for (let i = 0; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[i0][0], ring[i][1] - ring[i0][1]);
    if (d > far) { far = d; i1 = i; }
  }
  const a = rdp(ring.slice(i0, i1 + 1), eps);
  const b = rdp([...ring.slice(i1), ring[i0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
function pointInRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
// Sutherland–Hodgman against an axis-aligned rectangle
function clipRect(ring, r) {
  let out = ring;
  const edges = [
    [(p) => p[0] >= r.minX, (a, b) => { const t = (r.minX - a[0]) / (b[0] - a[0]); return [r.minX, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[0] <= r.maxX, (a, b) => { const t = (r.maxX - a[0]) / (b[0] - a[0]); return [r.maxX, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[1] >= r.minZ, (a, b) => { const t = (r.minZ - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, r.minZ]; }],
    [(p) => p[1] <= r.maxZ, (a, b) => { const t = (r.maxZ - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, r.maxZ]; }]
  ];
  for (const [inside, cross] of edges) {
    if (!out.length) return out;
    const next = [];
    for (let i = 0, j = out.length - 1; i < out.length; j = i++) {
      const a = out[j], b = out[i];
      if (inside(b)) {
        if (!inside(a)) next.push(cross(a, b));
        next.push(b);
      } else if (inside(a)) next.push(cross(a, b));
    }
    out = next;
  }
  // drop duplicate closing point & collinear repeats
  const clean = [];
  for (const p of out) {
    const last = clean[clean.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.2) clean.push(p);
  }
  if (clean.length > 1 && Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) < 0.2) clean.pop();
  return clean.length >= 3 ? clean : [];
}

// =====================================================================================================================
// 3. RASTER (land / blocks)
// =====================================================================================================================
class Raster {
  constructor(x0, z0, x1, z1, res) {
    this.res = res;
    this.x0 = Math.floor(x0 / res) * res;
    this.z0 = Math.floor(z0 / res) * res;
    this.w = Math.ceil((x1 - this.x0) / res) + 1;
    this.h = Math.ceil((z1 - this.z0) / res) + 1;
    this.d = new Uint8Array(this.w * this.h);
  }
  fillRing(ring, val = 1) {
    const { res, x0, z0, w, h, d } = this;
    if (ring.length < 3) return;
    const bb = bbox(ring);
    if (bb.x1 < x0 || bb.x0 > x0 + w * res || bb.z1 < z0 || bb.z0 > z0 + h * res) return;
    const jy0 = Math.max(0, Math.floor((bb.z0 - z0) / res));
    const jy1 = Math.min(h - 1, Math.ceil((bb.z1 - z0) / res));
    const xs = [];
    for (let j = jy0; j <= jy1; j++) {
      const z = z0 + (j + 0.5) * res;
      xs.length = 0;
      for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
        const [xa, za] = ring[k];
        const [xb, zb] = ring[i];
        if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
      }
      xs.sort((p, q) => p - q);
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const i0 = Math.max(0, Math.ceil((xs[n] - x0) / res - 0.5));
        const i1 = Math.min(w - 1, Math.floor((xs[n + 1] - x0) / res - 0.5));
        for (let i = i0; i <= i1; i++) d[j * w + i] = val;
      }
    }
  }
  // Squared Euclidean distance transform (Felzenszwalb) to cells where isSource is true
  edt(isSource) {
    const { w, h, d } = this;
    const INF = 1e20;
    const f = new Float64Array(Math.max(w, h));
    const out = new Float32Array(w * h);
    const v = new Int32Array(Math.max(w, h));
    const zz = new Float64Array(Math.max(w, h) + 1);
    const dt1 = (n, get, set) => {
      for (let q = 0; q < n; q++) f[q] = get(q);
      let k = 0;
      v[0] = 0;
      zz[0] = -INF;
      zz[1] = INF;
      for (let q = 1; q < n; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= zz[k]) {
          k--;
          s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        zz[k] = s;
        zz[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < n; q++) {
        while (zz[k + 1] < q) k++;
        set(q, (q - v[k]) * (q - v[k]) + f[v[k]]);
      }
    };
    for (let i = 0; i < w * h; i++) out[i] = isSource(d[i]) ? 0 : INF;
    for (let i = 0; i < w; i++) dt1(h, (q) => out[q * w + i], (q, val) => (out[q * w + i] = val));
    for (let j = 0; j < h; j++) dt1(w, (q) => out[j * w + q], (q, val) => (out[j * w + q] = val));
    return out;
  }
}

// =====================================================================================================================
// 4. ROADS
// =====================================================================================================================
const DRIVABLE = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified',
  'residential', 'living_street', 'service'
]);
const ROAD_W = {
  motorway: 26, motorway_link: 9, trunk: 24, trunk_link: 9, primary: 20, primary_link: 9,
  secondary: 16, secondary_link: 8, tertiary: 12, tertiary_link: 8, unclassified: 8,
  residential: 7, living_street: 6, service: 4.5
};
// 地图底图用的非机动车道/步道：只用于绘制，不进入车流路网
const MAP_ONLY = new Set(['footway', 'cycleway', 'path', 'pedestrian', 'steps', 'track', 'bridleway']);
const MAP_PATH_W = { footway: 2, cycleway: 2.5, path: 1.8, pedestrian: 4, steps: 1.5, track: 3, bridleway: 2 };
const NUM = (v) => {
  const m = /-?\d+(?:\.\d+)?/.exec(String(v ?? ''));
  return m ? parseFloat(m[0]) : NaN;
};
function roadWidth(t) {
  const w = NUM(t.width);
  if (Number.isFinite(w) && w > 2) return w;
  const lanes = NUM(t.lanes);
  const base = ROAD_W[t.highway] || 8;
  if (Number.isFinite(lanes) && lanes > 0) return Math.max(base, lanes * 3.5 + 1.4);
  return base;
}
function onewayDir(t) {
  if (t.junction === 'roundabout' || t.junction === 'circular') return 1;
  const v = String(t.oneway ?? '').toLowerCase();
  if (v === '-1' || v === 'reverse') return -1;
  if (v === 'yes' || v === 'true' || v === '1') return 1;
  return 0;
}

const osmRoads = load('osm_roads.json');
const roads = [];
{
  const seen = new Set();
  for (const e of osmRoads.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    const t = e.tags || {};
    const kind = t.highway;
    if (!DRIVABLE.has(kind)) continue;
    if (t.area === 'yes') continue;
    if (t.tunnel === 'yes' || t.covered === 'yes' || t.highway === 'corridor') continue;
    const name = t.name || '';
    let pts = e.geometry.map((p) => toWorld(p.lon, p.lat));
    // dedupe identical / reversed duplicates (dual mapping imports)
    const a = pts[0], b = pts[pts.length - 1];
    const bb = bbox(pts);
    const key = `${name}|${kind}|${Math.round(bb.x0 / 4)},${Math.round(bb.z0 / 4)},${Math.round(bb.x1 / 4)},${Math.round(bb.z1 / 4)}|${Math.round(
      pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0) / 5
    )}`;
    if (bb.x1 < BOUNDS.minX - 500 || bb.x0 > BOUNDS.maxX + 500 || bb.z1 < BOUNDS.minZ - 500 || bb.z0 > BOUNDS.maxZ + 500) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const w = roadWidth(t);
    const lanes = Math.max(1, Math.min(8, Math.round(Number.isFinite(NUM(t.lanes)) ? NUM(t.lanes) : w / 3.5)));
    pts = rdp(pts, 0.9);
    if (pts.length < 2) continue;
    roads.push(...reviewRoadSections({
      name, kind, w, lanes, dir: onewayDir(t),
      sourceId:`way/${e.id}`,
      bridge: t.bridge === 'yes' || t.bridge === 'viaduct',
      tunnel: false,
      // keep the surface class for the renderer
      flat: flat(pts)
    }));
  }
}
log(`${roads.length} drivable road ways`);

// 地图专用步道/自行车道/小路
const mapPaths = [];
{
  const seen = new Set();
  for (const e of osmRoads.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    const t = e.tags || {};
    const kind = t.highway;
    if (!MAP_ONLY.has(kind)) continue;
    if (t.area === 'yes' || t.tunnel === 'yes' || t.covered === 'yes') continue;
    const name = t.name || '';
    let pts = e.geometry.map((p) => toWorld(p.lon, p.lat));
    const bb = bbox(pts);
    if (bb.x1 < BOUNDS.minX - 500 || bb.x0 > BOUNDS.maxX + 500 || bb.z1 < BOUNDS.minZ - 500 || bb.z0 > BOUNDS.maxZ + 500) continue;
    const key = `${name}|${kind}|${Math.round(bb.x0 / 4)},${Math.round(bb.z0 / 4)},${Math.round(bb.x1 / 4)},${Math.round(bb.z1 / 4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pts = rdp(pts, 1.0);
    if (pts.length < 2) continue;
    mapPaths.push([name, kind, MAP_PATH_W[kind] || 2, t.bridge === 'yes' ? 1 : 0, flat(pts)]);
    if (mapPaths.length >= 4000) break;
  }
}
log(`${mapPaths.length} map-only paths`);

// Road graph: every way's end / vertex cluster becomes an intersection node
const MERGE = 4.0;
const nodes = [];
const nodeCells = new Map();
const cellKey = (ix, iz) => ix * 100003 + iz;
function nodeAt(x, z) {
  const ix = Math.floor(x / MERGE), iz = Math.floor(z / MERGE);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (const id of nodeCells.get(cellKey(ix + dx, iz + dz)) || []) {
        if (Math.hypot(nodes[id][0] - x, nodes[id][1] - z) <= MERGE) return id;
      }
    }
  }
  const id = nodes.length;
  nodes.push([x, z]);
  const k = cellKey(ix, iz);
  if (!nodeCells.has(k)) nodeCells.set(k, []);
  nodeCells.get(k).push(id);
  return id;
}
const roadPoint = (flatPts) => {
  const pts = [];
  for (let i = 0; i < flatPts.length; i += 2) pts.push([flatPts[i], flatPts[i + 1]]);
  return pts;
};
// Pass 1: endpoints create nodes
for (const r of roads) {
  const pts = roadPoint(r.flat);
  nodeAt(pts[0][0], pts[0][1]);
  nodeAt(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}
// Pass 2: every vertex on a way that lands on a node splits it there
const graphNames = [];
const nameIds = new Map();
const nameId = (n) => {
  if (!nameIds.has(n)) { nameIds.set(n, graphNames.length); graphNames.push(n); }
  return nameIds.get(n);
};
const links = [];
for (const r of roads) {
  const pts = roadPoint(r.flat);
  const splits = [0];
  for (let i = 1; i < pts.length - 1; i++) {
    const ix = Math.floor(pts[i][0] / MERGE), iz = Math.floor(pts[i][1] / MERGE);
    let hit = false;
    for (let dx = -1; dx <= 1 && !hit; dx++) {
      for (let dz = -1; dz <= 1 && !hit; dz++) {
        for (const id of nodeCells.get(cellKey(ix + dx, iz + dz)) || []) {
          if (Math.hypot(nodes[id][0] - pts[i][0], nodes[id][1] - pts[i][1]) <= MERGE) { hit = true; break; }
        }
      }
    }
    if (hit && i - splits[splits.length - 1] >= 1) splits.push(i);
  }
  splits.push(pts.length - 1);
  const ni = nameId(r.name);
  for (let k = 0; k + 1 < splits.length; k++) {
    const a = splits[k], b = splits[k + 1];
    if (b <= a) continue;
    const line = pts.slice(a, b + 1);
    const L = line.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) : 0), 0);
    if (L < 2.5) continue;
    const na = nodeAt(line[0][0], line[0][1]);
    const nb = nodeAt(line[line.length - 1][0], line[line.length - 1][1]);
    if (na === nb) continue;
    const inner = line.slice(1, -1).flatMap(([x, z]) => [q(x), q(z)]);
    links.push([na, nb, ni, q(r.w), r.lanes, r.dir, inner]);
  }
}
// keep only used nodes, renumbered
const used = new Map();
const graphNodes = [];
const idOf = (i) => {
  if (!used.has(i)) {
    used.set(i, graphNodes.length / 2);
    const [x, z] = nodes[i];
    graphNodes.push(q(x), q(z));
  }
  return used.get(i);
};
const graphLinks = links.map(([a, b, n, w, lanes, dir, inner]) => [idOf(a), idOf(b), n, w, lanes, dir, inner]);
log(`road graph: ${graphNodes.length / 2} nodes, ${graphLinks.length} links`);

// =====================================================================================================================
// 5. WATER
// =====================================================================================================================
function elemRings(e) {
  if (e.type === 'way') return e.geometry ? [e.geometry.map((p) => toWorld(p.lon, p.lat))] : [];
  const parts = (e.members || []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry.map((p) => toWorld(p.lon, p.lat)));
  const rings = [];
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1;
  while (parts.length) {
    let ring = parts.shift();
    for (let guard = 0; guard < 500 && !close(ring[0], ring[ring.length - 1]); guard++) {
      const i = parts.findIndex((p) => close(p[0], ring[ring.length - 1]) || close(p[p.length - 1], ring[ring.length - 1]));
      if (i < 0) break;
      const p = parts.splice(i, 1)[0];
      ring = ring.concat(close(p[0], ring[ring.length - 1]) ? p.slice(1) : p.reverse().slice(1));
    }
    rings.push(ring);
  }
  return rings;
}
const osmWater = load('osm_water.json');
const waterPolys = [];
const waterLines = [];
for (const e of osmWater.elements) {
  const t = e.tags || {};
  const name = t.name || '';
  if (t.waterway && !t.natural) {
    const kind = t.waterway;
    if (!['river', 'canal', 'stream', 'drain', 'ditch'].includes(kind)) continue;
    if (!e.geometry || e.geometry.length < 2) continue;
    const pts = e.geometry.map((p) => toWorld(p.lon, p.lat));
    const lb = bbox(pts);
    if (lb.x1 < BOUNDS.minX - 800 || lb.x0 > BOUNDS.maxX + 800 || lb.z1 < BOUNDS.minZ - 800 || lb.z0 > BOUNDS.maxZ + 800) continue;
    const w = NUM(t.width) || (kind === 'river' ? 40 : kind === 'canal' ? 18 : kind === 'stream' ? 6 : 5);
    waterLines.push({ name, kind, w, pts: flat(rdp(pts, 1.5)) });
    continue;
  }
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin') {
    for (const ring of elemRings(e)) {
      if (ring.length < 3) continue;
      const area = Math.abs(ringArea(ring));
      if (area < 120) continue;
      const clipped = clipRect(ring, { minX: BOUNDS.minX - 800, maxX: BOUNDS.maxX + 800, minZ: BOUNDS.minZ - 800, maxZ: BOUNDS.maxZ + 800 });
      if (clipped.length < 3) continue;
      waterPolys.push({ name, kind: t.water || (t.natural === 'water' ? 'water' : t.waterway) || '', rings: [flat(rdpRing(clipped, 1.6))] });
    }
  }
}
const reviewedWater = load('reviewed-water.json');
for (const p of reviewedWater.polygons) waterPolys.push({ ...p, rings: p.rings.map(flat) });
log(`water: ${waterPolys.length} polygons, ${waterLines.length} waterways`);
const waterGeometry = waterPolys.map(p => p.rings.map(r => {
  const pts=[]; for(let i=0;i<r.length;i+=2)pts.push([r[i],r[i+1]]); return pts;
}));
// Preserve image-reviewed shore detail below the global 30 m ground grid.
// The patch aligns to that grid, so it replaces whole ground cells without seams.
const reviewedPts=reviewedWater.polygons.flatMap(p=>p.rings[0]);
const reviewedBB=bbox(reviewedPts), patchBounds={
  minX:Math.floor((reviewedBB.x0-5)/30)*30,maxX:Math.ceil((reviewedBB.x1+5)/30)*30,
  minZ:Math.floor((reviewedBB.z0-5)/30)*30,maxZ:Math.ceil((reviewedBB.z1+5)/30)*30
};
const patchRect=[[[patchBounds.minX,patchBounds.minZ],[patchBounds.maxX,patchBounds.minZ],
  [patchBounds.maxX,patchBounds.maxZ],[patchBounds.minX,patchBounds.maxZ]]];
const groundPatches=[{bounds:patchBounds,land:polygonClip.difference(patchRect,...waterGeometry).map(p=>p.map(flat))}];

// 铁路：新长铁路与站场
const railways = [];
try {
  const rail = load('osm_rail.json');
  const seen = new Set();
  for (const e of rail.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    const t = e.tags || {};
    if (!['rail', 'light_rail', 'subway', 'tram', 'narrow_gauge'].includes(t.railway)) continue;
    const pts = e.geometry.map((p) => toWorld(p.lon, p.lat));
    const bb = bbox(pts);
    if (bb.x1 < BOUNDS.minX - 800 || bb.x0 > BOUNDS.maxX + 800 || bb.z1 < BOUNDS.minZ - 800 || bb.z0 > BOUNDS.maxZ + 800) continue;
    const key = `${Math.round(bb.x0 / 8)},${Math.round(bb.z0 / 8)},${Math.round(bb.x1 / 8)},${Math.round(bb.z1 / 8)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    railways.push([t.name || '', t.railway, flat(rdp(pts, 1.5))]);
  }
} catch { /* 没有铁路数据时跳过 */ }
log(`railways: ${railways.length}`);

// =====================================================================================================================
// 6. PARKS, LANDUSE, POIS, PLACES
// =====================================================================================================================
const osmLand = load('osm_land.json');
const parks = [];
const landuse = [];
for (const e of osmLand.elements) {
  const t = e.tags || {};
  const name = t.name || '';
  const isPark = t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'recreation_ground' ||
    t.landuse === 'grass' || t.landuse === 'forest' || t.natural === 'wood' || t.leisure === 'nature_reserve' ||
    t.landuse === 'cemetery';
  const kind = t.leisure || t.landuse || t.natural || '';
  for (const ring of elemRings(e)) {
    if (ring.length < 3) continue;
    const area = Math.abs(ringArea(ring));
    if (area < 300) continue;
    const clipped = clipRect(ring, BOUNDS);
    if (clipped.length < 3) continue;
    const rec = { name, kind, rings: [flat(rdpRing(clipped, 2.0))] };
    if (isPark) parks.push(rec);
    else landuse.push(rec);
  }
}
log(`parks & green: ${parks.length}, other landuse: ${landuse.length}`);

const osmPois = load('osm_pois.json');
const pois = [];
for (const e of osmPois.elements) {
  const t = e.tags || {};
  if (!t.name) continue;
  let lon = e.lon, lat = e.lat;
  if (e.center) { lon = e.center.lon; lat = e.center.lat; }
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
  const [x, z] = toWorld(lon, lat);
  if (x < BOUNDS.minX - 300 || x > BOUNDS.maxX + 300 || z < BOUNDS.minZ - 300 || z > BOUNDS.maxZ + 300) continue;
  pois.push([t.name, t.amenity || t.tourism || t.historic || t.leisure || t.railway || t.shop || t.office || t.building || t.man_made || '', q(x), q(z)]);
}
// 沭阳站 (railway=station node, not in the POI query's centre list)
pois.push(['沭阳站', 'station', ...toWorld(118.7589445, 34.1130788).map(q)]);
const osmPlaces = load('osm_places.json');
const places = [];
for (const e of osmPlaces.elements) {
  const t = e.tags || {};
  if (!t.name || !Number.isFinite(e.lon)) continue;
  const [x, z] = toWorld(e.lon, e.lat);
  if (x < BOUNDS.minX - 500 || x > BOUNDS.maxX + 500 || z < BOUNDS.minZ - 500 || z > BOUNDS.maxZ + 500) continue;
  places.push([t.name, t.place || '', q(x), q(z)]);
}
log(`pois: ${pois.length}, places: ${places.length}`);

// =====================================================================================================================
// 7. BLOCKS — rasterise the at-grade roadways over the land, label the curb islands
// =====================================================================================================================
const RES = 3;
const CUT = 3.3; // curb-to-property-line sidewalk width (m)
const ringPts = (flatRing) => {
  const pts = [];
  for (let i = 0; i < flatRing.length; i += 2) pts.push([flatRing[i], flatRing[i + 1]]);
  return pts;
};
const R = new Raster(CORE.minX, CORE.minZ, CORE.maxX, CORE.maxZ, RES);
R.d.fill(1);
// water is not buildable land
for (const p of waterPolys) {
  R.fillRing(ringPts(p.rings[0]), 0);
  for(const hole of p.rings.slice(1)) R.fillRing(ringPts(hole), 1);
}
// roadways cut the land into curb islands (bridges stay water: their decks are drawn by city-grid.js)
for (const r of roads) {
  if (r.bridge) continue;
  const pts = roadPoint(r.flat);
  const rad = r.w / 2 + 1.2;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [x0, z0] = pts[k];
    const [x1, z1] = pts[k + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const L2 = dx * dx + dz * dz || 1e-9;
    const ix0 = Math.max(0, Math.floor((Math.min(x0, x1) - rad - R.x0) / RES));
    const ix1 = Math.min(R.w - 1, Math.ceil((Math.max(x0, x1) + rad - R.x0) / RES));
    const iz0 = Math.max(0, Math.floor((Math.min(z0, z1) - rad - R.z0) / RES));
    const iz1 = Math.min(R.h - 1, Math.ceil((Math.max(z0, z1) + rad - R.z0) / RES));
    for (let j = iz0; j <= iz1; j++) {
      const pz = R.z0 + (j + 0.5) * RES;
      for (let i = ix0; i <= ix1; i++) {
        const px = R.x0 + (i + 0.5) * RES;
        let t = ((px - x0) * dx + (pz - z0) * dz) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x0 + t * dx - px, ez = z0 + t * dz - pz;
        if (ex * ex + ez * ez <= rad * rad) R.d[j * R.w + i] = 0;
      }
    }
  }
}
const W = R.w, H = R.h, D = R.d;
// label 4-connected curb islands
const lab = new Int32Array(W * H);
const comps = [];
{
  const stack = new Int32Array(W * H > 4e7 ? 4e7 : W * H);
  for (let s0 = 0; s0 < W * H; s0++) {
    if (!D[s0] || lab[s0]) continue;
    const id = comps.length + 1;
    let sp = 0, n = 0, i0 = W, i1 = -1, j0 = H, j1 = -1;
    stack[sp++] = s0;
    lab[s0] = id;
    while (sp) {
      const p = stack[--sp];
      n++;
      const i = p % W, j = (p - i) / W;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
      if (i > 0 && D[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (i < W - 1 && D[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (j > 0 && D[p - W] && !lab[p - W]) { lab[p - W] = id; stack[sp++] = p - W; }
      if (j < H - 1 && D[p + W] && !lab[p + W]) { lab[p + W] = id; stack[sp++] = p + W; }
    }
    comps.push({ id, n, i0, i1, j0, j1, start: s0 });
  }
}
log(`${comps.length} curb islands labelled`);

function traceComponent(c) {
  const at = (i, j) => (i >= 0 && j >= 0 && i < W && j < H && lab[j * W + i] === c.id ? 1 : 0);
  const si = c.start % W, sj = (c.start - si) / W;
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
  let cx = si, cz = sj, dir = 0;
  const pts = [];
  const start = cx + ',' + cz + ',' + dir;
  let guard = 0;
  do {
    pts.push([R.x0 + cx * RES, R.z0 + cz * RES]);
    cx += DX[dir];
    cz += DZ[dir];
    let left, right;
    if (dir === 0) { left = at(cx, cz - 1); right = at(cx, cz); }
    else if (dir === 1) { left = at(cx, cz); right = at(cx - 1, cz); }
    else if (dir === 2) { left = at(cx - 1, cz); right = at(cx - 1, cz - 1); }
    else { left = at(cx - 1, cz - 1); right = at(cx, cz - 1); }
    if (left && right) dir = (dir + 3) % 4;
    else if (!right) dir = (dir + 1) % 4;
    if (++guard > 4e6) break;
  } while (cx + ',' + cz + ',' + dir !== start);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[(i + pts.length - 1) % pts.length], q2 = pts[i], n = pts[(i + 1) % pts.length];
    if ((q2[0] - p[0]) * (n[1] - q2[1]) - (q2[1] - p[1]) * (n[0] - q2[0]) !== 0) out.push(q2);
  }
  return out;
}

// property line: square erosion by the sidewalk width
const ER = Math.max(1, Math.round(CUT / RES));
const prop = new Uint8Array(W * H);
{
  const tmp = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const row = j * W;
    let run = 0;
    const left = new Int32Array(W), right = new Int32Array(W);
    for (let i = 0; i < W; i++) {
      const L = lab[row + i];
      run = L && i > 0 && lab[row + i - 1] === L ? run + 1 : L ? 1 : 0;
      left[i] = run;
    }
    run = 0;
    for (let i = W - 1; i >= 0; i--) {
      const L = lab[row + i];
      run = L && i < W - 1 && lab[row + i + 1] === L ? run + 1 : L ? 1 : 0;
      right[i] = run;
    }
    for (let i = 0; i < W; i++) tmp[row + i] = lab[row + i] && left[i] > ER && right[i] > ER ? 1 : 0;
  }
  const up = new Int32Array(H), dn = new Int32Array(H);
  for (let i = 0; i < W; i++) {
    let run = 0;
    for (let j = 0; j < H; j++) {
      const k = j * W + i, L = lab[k];
      run = L && j > 0 && lab[k - W] === L ? run + 1 : L ? 1 : 0;
      up[j] = run;
    }
    run = 0;
    for (let j = H - 1; j >= 0; j--) {
      const k = j * W + i, L = lab[k];
      run = L && j < H - 1 && lab[k + W] === L ? run + 1 : L ? 1 : 0;
      dn[j] = run;
    }
    for (let j = 0; j < H; j++) prop[j * W + i] = tmp[j * W + i] && up[j] > ER && dn[j] > ER ? 1 : 0;
  }
}

function maskRects(m, w, h, maxRects = 12, minSide = 4) {
  let total = 0;
  for (let k = 0; k < w * h; k++) total += m[k];
  const rects = [];
  const hist = new Int32Array(w);
  const stack = new Int32Array(w + 1);
  let covered = 0;
  for (let it = 0; it < maxRects; it++) {
    hist.fill(0);
    let best = 0, bi0 = 0, bi1 = 0, bj0 = 0, bj1 = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) hist[i] = m[j * w + i] ? hist[i] + 1 : 0;
      let sp = 0;
      for (let i = 0; i <= w; i++) {
        const hh = i < w ? hist[i] : 0;
        while (sp && hist[stack[sp - 1]] >= hh) {
          const top = stack[--sp];
          const height = hist[top];
          const left = sp ? stack[sp - 1] + 1 : 0;
          const width = i - left;
          if (height >= minSide && width >= minSide) {
            const area = height * width;
            if (area > best) { best = area; bi0 = left; bi1 = i - 1; bj0 = j - height + 1; bj1 = j; }
          }
        }
        stack[sp++] = i;
      }
    }
    if (best < 60 || (rects.length && best < total * 0.05)) break;
    rects.push([bi0, bi1, bj0, bj1]);
    covered += best;
    for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) m[j * w + i] = 0;
    if (covered > total * 0.9) break;
  }
  return rects;
}
function lotRects(c) {
  const w = c.i1 - c.i0 + 1, h = c.j1 - c.j0 + 1;
  const m = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (c.j0 + j) * W + c.i0 + i;
    if (prop[k] && lab[k] === c.id) m[j * w + i] = 1;
  }
  return maskRects(m, w, h, 14, 3).map(([i0, i1, j0, j1]) => [
    R.x0 + (c.i0 + i0) * RES, R.x0 + (c.i0 + i1 + 1) * RES,
    R.z0 + (c.j0 + j0) * RES, R.z0 + (c.j0 + j1 + 1) * RES
  ]);
}

const parkAt = (x, z) => parks.find((p) => p.rings.some((ring) => {
  const pts = [];
  for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
  return pointInRing(pts, x, z);
}));
const blocks = [];
let small = 0;
for (const c of comps) {
  const area = c.n * RES * RES;
  if (area < 200) { small++; continue; }
  let poly = traceComponent(c);
  poly = rdpRing(poly, 1.0);
  if (poly.length < 3) continue;
  if (ringArea(poly) > 0) poly.reverse();
  const bw = (c.i1 - c.i0 + 1) * RES, bd = (c.j1 - c.j0 + 1) * RES;
  const rectness = area / (bw * bd);
  const rects = area >= 360 ? lotRects(c) : [];
  const cx = R.x0 + ((c.i0 + c.i1 + 1) * RES) / 2;
  const cz = R.z0 + ((c.j0 + c.j1 + 1) * RES) / 2;
  const park = parkAt(cx, cz);
  blocks.push({
    poly, rects, rectness, rect: rectness > 0.97,
    park: park ? 1 : 0, parkName: park ? park.name : '',
    cx, cz,
    area
  });
}
log(`${blocks.length} blocks (${blocks.filter((b) => b.rects.length).length} with lots), ${small} specks dropped`);

// Keep the raster-derived property lots, but derive every curb from the exact
// triangles used to render the road. Holed islands preserve dead-end streets
// and enclosed water; neither gets filled by an outer-only block silhouette.
const localPython=path.join(HERE,'..','.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const python=process.env.SHUYANG_PYTHON||(fs.existsSync(localPython)?localPython:'python');
const vectorInput={bounds:CORE,rasterBlocks:blocks,water:waterPolys.map(p=>p.rings.map(ringPts)),
  roadTriangles:roads.filter(r=>!r.bridge).flatMap(r=>roadRibbonTriangles(roadPoint(r.flat).map(([x,z])=>({x,z})),q(r.w)+.8))};
const vectorResult=spawnSync(python,[path.join(HERE,'build-vector-curbs.py')],{
  input:JSON.stringify(vectorInput),encoding:'utf8',maxBuffer:64*1024*1024});
if(vectorResult.error||vectorResult.status!==0)throw new Error('Vector curb build requires Python with Shapely 2: '+(vectorResult.error?.message||vectorResult.stderr));
const vectorCurbs=JSON.parse(vectorResult.stdout);blocks.splice(0,blocks.length,...vectorCurbs.blocks);
log('vector curb islands',vectorCurbs.audit);

// =====================================================================================================================
// 8. BUILDINGS — surveyed OSM footprints + procedural infill on the block lots
// =====================================================================================================================
const enriched = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, 'buildings-enriched.json.gz'))));
for(const b of enriched.buildings){
  const bound=b.geometryReference?.replacesSourceIds;if(!bound?.length)continue;
  const required=new Set([b.id,...bound]);
  if(!Object.values(PHOTO_LANDMARK_SITES).some(s=>{
    const ids=new Set((s.sourceBuildingIndices||[]).map(i=>enriched.buildings[i]?.id));
    return [...required].every(id=>ids.has(id));
  }))throw new Error('完整楼体与旧局部来源的模型绑定缺失，请先运行 tools/build-shuyang-landmarks.py');
}
const hash01 = (x, z) => Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
const real = enriched.buildings.map((b) => {
  const points = b.polygons.flatMap((p) => p.outer), bb = bbox(points);
  return { ...b, h: b.height, poly: b.polygons[0].outer, bb,
    area: b.polygons.reduce((n, p) => n + Math.abs(ringArea(p.outer)) - p.holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0), 0),
    cx: (bb.x0 + bb.x1) / 2, cz: (bb.z0 + bb.z1) / 2 };
});
log(`${real.length} source buildings`, enriched.report.sources, enriched.report.heightSources);
// Same topology and height on the map and in 3D, including inner courtyards.
const mapBuildings = real.flatMap((b) => b.polygons.map((p) => ({
  id: b.id, n: b.name, h: b.h, s: b.source, o: flat(p.outer), holes: p.holes.map(flat)
})));
log(`map buildings: ${mapBuildings.length}`);

// spatial index of surveyed buildings, for the infill's overlap test
const BCELL = 40;
const bGrid = new Map();
for (const b of real) {
  for (let ix = Math.floor(b.bb.x0 / BCELL); ix <= Math.floor(b.bb.x1 / BCELL); ix++) {
    for (let iz = Math.floor(b.bb.z0 / BCELL); iz <= Math.floor(b.bb.z1 / BCELL); iz++) {
      const k = ix * 100003 + iz;
      if (!bGrid.has(k)) bGrid.set(k, []);
      bGrid.get(k).push(b);
    }
  }
}
const hitsBuilding = (x0, x1, z0, z1) => {
  const seen = new Set();
  for (let ix = Math.floor(x0 / BCELL); ix <= Math.floor(x1 / BCELL); ix++) {
    for (let iz = Math.floor(z0 / BCELL); iz <= Math.floor(z1 / BCELL); iz++) {
      for (const b of bGrid.get(ix * 100003 + iz) || []) {
        if (seen.has(b)) continue;
        seen.add(b);
        if (b.bb.x0 < x1 && b.bb.x1 > x0 && b.bb.z0 < z1 && b.bb.z1 > z0) return true;
      }
    }
  }
  return false;
};
// procedural infill: 默认关闭，避免"编出来的楼"与真实城市不一致。
// 需要旧版密集效果时设置 SHUYANG_INFILL=1 重新生成。
const INCLUDE_INFILL = process.env.SHUYANG_INFILL === '1';
const generated = [];
if (INCLUDE_INFILL) for (const b of blocks) {
  if (b.park > 0.5 || b.area < 320) continue;
  // fields and villages outside the mapped street network keep their cleared land
  if (b.area > 350000) continue;
  for (const [x0, x1, z0, z1] of b.rects) {
    const w = x1 - x0, d = z1 - z0;
    if (w < 12 || d < 12) continue;
    const nx = Math.max(1, Math.round(w / 52));
    const nz = Math.max(1, Math.round(d / 52));
    const pw = w / nx, pd = d / nz;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const cx = x0 + (ix + 0.5) * pw, cz = z0 + (iz + 0.5) * pd;
        if (hash01(cx, cz) < 0.14) continue; // courtyards / gaps
        const inset = 3.5;
        const bx0 = cx - pw / 2 + inset, bx1 = cx + pw / 2 - inset;
        const bz0 = cz - pd / 2 + inset, bz1 = cz + pd / 2 - inset;
        if (bx1 - bx0 < 8 || bz1 - bz0 < 8) continue;
        if (hitsBuilding(bx0, bx1, bz0, bz1)) continue;
        // county-seat residential / commercial massing
        const r = hash01(cx + 7, cz - 3);
        const dCenter = Math.hypot(cx, cz);
        let h;
        if (dCenter < 900) h = 24 + r * 36;         // 中心商圈 8-20 层
        else if (dCenter < 2200) h = 18 + r * 26;   // 城区 6-14 层
        else h = 12 + r * 18;                       // 外围 4-10 层
        const poly = [[bx0, bz0], [bx1, bz0], [bx1, bz1], [bx0, bz1]];
        generated.push({ h: Math.round(h), name: '', poly, bb: { x0: bx0, x1: bx1, z0: bz0, z1: bz1 }, area: (bx1 - bx0) * (bz1 - bz0), cx, cz });
      }
    }
  }
}
log(INCLUDE_INFILL ? `${generated.length} procedural infill buildings` : 'procedural infill disabled (SHUYANG_INFILL=1 to enable)');

// Landmarks: curated POIs + their surveyed footprints when the survey has a matching name
const LANDMARK_POIS = [
  ['沭阳县政府', 'government'], ['沭阳县博物馆', 'museum'], ['沭阳县美术馆', 'gallery'], ['沭阳县图书馆', 'library'],
  ['虞姬生态园', 'park'], ['南湖公园', 'park'], ['沭河公园', 'park'], ['梦溪植物园', 'park'], ['建陵公园', 'park'],
  ['城北公园', 'park'], ['台州路森林公园', 'park'], ['孙巷公园', 'park'], ['开发区体育公园', 'park'],
  ['中央商场', 'mall'], ['蓝天国际商贸城', 'mall'], ['维也纳购物中心', 'mall'], ['万达广场', 'mall'],
  ['沭阳县新城购物中心', 'mall'], ['沭阳站', 'station'], ['沭水之阳（地标）', 'artwork'],
  ['沭阳县政务服务中心', 'government'], ['江苏省沭阳高级中学', 'school'], ['沭阳医院（城东院区）', 'hospital']
];
const landmarkMap = {};
for (const [name, kind] of LANDMARK_POIS) {
  const p = pois.find((q2) => q2[0] === name);
  if (!p) continue;
  const [, , x, z] = p;
  const hit = real.filter((b) => b.name === name);
  const bb = hit.length ? hit.reduce((a, b) => ({
    x0: Math.min(a.x0, b.bb.x0), x1: Math.max(a.x1, b.bb.x1),
    z0: Math.min(a.z0, b.bb.z0), z1: Math.max(a.z1, b.bb.z1)
  }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }) : null;
  landmarkMap[name] = {
    x: bb ? q((bb.x0 + bb.x1) / 2) : x,
    z: bb ? q((bb.z0 + bb.z1) / 2) : z,
    w: bb ? q(bb.x1 - bb.x0) : 70,
    d: bb ? q(bb.z1 - bb.z0) : 70,
    h: hit.length ? Math.max(...hit.map((b) => b.h)) : 24,
    kind
  };
}
log(`${Object.keys(landmarkMap).length} landmark sites`);

// =====================================================================================================================
// 9. WRITE THE GEO DATA
// =====================================================================================================================
const buildingsOut = [...real, ...generated].map((b) => ({
  ...b, height: b.h, polygons: (b.polygons || [{ outer: b.poly, holes: [] }]).map((p) => ({
    outer: ringArea(p.outer) < 0 ? [...p.outer].reverse() : p.outer,
    holes: (p.holes || []).map((h) => ringArea(h) > 0 ? [...h].reverse() : h)
  }))
}));

// SYB2 attribute-preserving building stream (see js/building-geodata.js): metadata, then global 0.5 m X / Z deltas
function varint(out, value) {
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}
const zigzag = (n) => (n << 1) ^ (n >> 31);
{
  const meta = [], xs = [], zs = [];
  varint(meta, buildingsOut.length);
  let px = 0, pz = 0;
  for (const b of buildingsOut) {
    varint(meta, Math.round(b.height * 10));
    varint(meta, Math.round((b.baseHeight || 0) * 10));
    varint(meta, ['unknown', 'residential', 'commercial', 'office', 'industrial', 'civic', 'house', 'garage'].indexOf(b.category || 'unknown'));
    varint(meta, ['estimate', 'osm-height', 'osm-levels', 'overture-height', 'globfp-model', 'cnbh-raster'].indexOf(b.heightSource || 'estimate'));
    varint(meta, b.source === 'OSM' ? 0 : b.source === 'Overture' ? 1 : b.source === 'ReviewedImagery' ? 3 : 2);
    varint(meta, b.levels || 0);
    varint(meta, ['flat', 'gabled', 'hipped', 'pyramidal'].indexOf(b.roofShape || 'flat'));
    varint(meta, Math.round((b.roofHeight || 0) * 10));
    varint(meta, Math.round(hash01(b.cx, b.cz) * 999));
    varint(meta, b.polygons.length);
    for (const p of b.polygons) {
      const rings = [p.outer, ...(p.holes || [])];
      varint(meta, rings.length);
      for (const ring of rings) {
        varint(meta, ring.length);
        for (const [x, z] of ring) {
          const ix = Math.round(x * 2), iz = Math.round(z * 2);
          varint(xs, zigzag(ix - px));
          varint(zs, zigzag(iz - pz));
          px = ix;
          pz = iz;
        }
      }
    }
  }
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x32425953, 0); // 'SYB2'
  header.writeUInt32LE(meta.length, 4);
  header.writeUInt32LE(xs.length, 8);
  const raw = Buffer.concat([header, Buffer.from(meta), Buffer.from(xs), Buffer.from(zs)]);
  fs.writeFileSync(BUILDINGS_OUT, zlib.gzipSync(raw, { level: 9 }));
  log(`wrote ${BUILDINGS_OUT} (${(fs.statSync(BUILDINGS_OUT).size / 1024).toFixed(0)} KB, ${buildingsOut.length} buildings)`);
}

const urban = load('urban-context.json');
if (urban.buildingExtractSha256 !== createHash('sha256').update(fs.readFileSync(path.join(DATA, 'buildings-enriched.json.gz'))).digest('hex')) {
  throw new Error('小区楼栋索引已过期，请先运行 tools/build-shuyang-urban.py');
}
const GEO = {
  version: 1,
  frame: {
    origin: '人民中路 & 上海中路', lon: LON0, lat: LAT0, units: 'm', bearingDeg: 0,
    core: { minX: q(CORE.minX), maxX: q(CORE.maxX), minZ: q(CORE.minZ), maxZ: q(CORE.maxZ) }
  },
  bounds: BOUNDS,
  roads: roads.map((r) => [r.name, r.kind, q(r.w), r.lanes, r.dir, r.bridge ? 1 : 0, r.flat]),
  roadSourceIds:roads.map(r=>r.sourceId),
  roadReviews:roads.flatMap((r,index)=>r.photoReviewId?[{index,sourceId:r.sourceId,reviewId:r.photoReviewId,originalWidth:r.originalWidth,originalLanes:r.originalLanes,width:r.w,lanes:r.lanes}]:[]),
  mapPaths,
  mapBuildings,
  buildingDataVersion: createHash('sha256').update(zlib.gunzipSync(fs.readFileSync(BUILDINGS_OUT))).digest('hex'),
  buildingAudit: enriched.report,
  neighborhoods: urban.neighborhoods,
  namedSites: urban.namedSites,
  urban: { surfaces: urban.surfaces, barriers: urban.barriers, audit: urban.audit },
  railways,
  roadGraph: { nodes: graphNodes, links: graphLinks, names: graphNames },
  blocks: blocks.map((b) => [
    b.poly.flat(), b.rects.map((r) => r.map(q)), b.park, b.parkName, b.rect ? 1 : 0, 0,
    b.holes.map(h=>h.flat()),b.slabs.map(s=>({outer:s.poly.flat(),holes:s.holes.map(h=>h.flat())})),[b.cx,b.cz],
    b.surfaces.map(s=>({outer:s.poly.flat(),holes:s.holes.map(h=>h.flat())}))
  ]),
  curbIslandAudit:vectorCurbs.audit,
  water: { polygons: waterPolys, lines: waterLines, groundPatches, reviewedReference: reviewedWater.reference },
  parks: parks.map((p) => ({ name: p.name, kind: p.kind, rings: p.rings,
    landPolygons:polygonClip.difference(p.rings.map(r=>[ringPts(r)]),...waterGeometry).map(poly=>poly.map(flat)) })),
  landuse: landuse.map((l) => ({ name: l.name, kind: l.kind, rings: l.rings })),
  landmarks: landmarkMap,
  pois,
  places,
  attribution: {
    basemap: '© OpenStreetMap contributors · Overture Maps Foundation · ODbL 1.0' + (enriched.report.cnbh ? ' · CNBH-10m / Wu · CC BY 4.0' : '') + (enriched.report.globfpArchives.length ? ' · 3D-GloBFP / Che et al. · CC BY 4.0' : ''),
    imageryReference: '参考：Esri / Vantor（2021年）、高德地图（2026年11月核对，拍摄日未知）；轮廓近似，照片未作为纹理分发。',
    note: '矢量底图由 OSM 数据生成；比例与位置按 WGS84 局部米制投影'
  },
  // authored building massing used for landmark silhouettes (heights in m)
  landmarkBuildings: real.filter((b) => b.name && LANDMARK_POIS.some(([n]) => n === b.name)).map((b) => ({
    name: b.name, h: b.h, x: q(b.cx), z: q(b.cz), w: q(b.bb.x1 - b.bb.x0), d: q(b.bb.z1 - b.bb.z0)
  }))
};

const json = JSON.stringify(GEO);
const header = `// js/shuyang-geodata.js — GENERATED by tools/build-shuyang-geodata.mjs, do not edit by hand.
// Real 沭阳 (Shuyang, Suqian, Jiangsu) geography in the simulation's world frame: 1 unit = 1 m,
// x = east, z = south (north = -z), origin at 人民中路 & 上海中路.
// Sources: © OpenStreetMap contributors (ODbL): roads, buildings, waterways, parks and POIs.
// Polygons & polylines are flat [x0, z0, x1, z1, ...] arrays.
`;
fs.writeFileSync(OUT, `${header}export const GEO = ${json};\n`);
log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
for (const [k, v] of Object.entries(GEO)) log(`  ${k}: ${(JSON.stringify(v).length / 1024).toFixed(0)} KB`);
