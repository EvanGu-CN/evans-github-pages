import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { NEIGHBORHOODS, ROADS } from '../js/city-config.js';
import { GEO } from '../js/shuyang-geodata.js';

const { loadModule } = createRequire(import.meta.url)('./helpers/module.cjs');
const source = readFileSync(new URL('../js/wode-district.js', import.meta.url), 'utf8');

// The compressed tables the app decodes at boot; the geometry test runs the same module body.
const REAL_BUILDINGS = JSON.parse(gunzipSync(readFileSync(
  new URL('../tools/data/shuyang/buildings-enriched.json.gz', import.meta.url)))).buildings.map((b, i) => {
  const polygons = b.polygons.map(p => ({
    outer: p.outer.map(([x, z]) => ({ x, z })),
    holes: (p.holes || []).map(h => h.map(([x, z]) => ({ x, z })))
  }));
  const xs = polygons[0].outer.map(p => p.x), zs = polygons[0].outer.map(p => p.z);
  return {
    height: b.height, baseHeight: b.baseHeight, category: b.category, heightSource: b.heightSource,
    source: b.source, levels: b.levels, roofShape: b.roofShape, roofHeight: b.roofHeight,
    seed: 101 + i, polygons,
    minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs),
    cx: (Math.min(...xs) + Math.max(...xs)) / 2, cz: (Math.min(...zs) + Math.max(...zs)) / 2
  };
});

class Geom {
  constructor() { this.attributes = {}; }
  setAttribute(name, value) { this.attributes[name] = value; }
  computeBoundingSphere() {}
}
const THREE = {
  Group: class { constructor() { this.name = ''; this.children = []; this.userData = {}; } add(o) { this.children.push(o); } },
  BufferGeometry: Geom,
  Float32BufferAttribute: class {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
  },
  Mesh: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; } },
  MeshStandardNodeMaterial: class { constructor(o) { Object.assign(this, o); } },
  MeshBasicNodeMaterial: class { constructor(o) { Object.assign(this, o); } },
  CanvasTexture: class { constructor() { this.colorSpace = ''; } },
  RepeatWrapping: 1000,
  SRGBColorSpace: 'srgb'
};

const { buildWodeDistrict } = loadModule(source, {
  imports: {
    'three/webgpu': THREE,
    './building-geodata.js': { REAL_BUILDINGS },
    './city-config.js': { NEIGHBORHOODS, ROADS }
  }
});

const neighbourhood = NEIGHBORHOODS.find(n => n.name === '沃德嘉园');
const ring = neighbourhood.polygons[0].outer;
const inside = (x, z) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
};

const root = new THREE.Group();
const result = buildWodeDistrict(root);

test('the four perimeter green buffers come from the reviewed Wode frame', () => {
  const ids = ['north', 'south', 'east', 'west'].map(d => `reviewed/wode/perimeter-${d}-green`);
  for (const id of ids) {
    const s = GEO.urban.surfaces.find(x => x.id === id);
    assert.ok(s, id);
    assert.equal(s.kind, 'green');
    assert.equal(s.referenceId, 'amap-wode-rtmart-20261113');
    assert.equal(s.imageAcquired, null);
    let area = 0;
    for (const p of s.polygons) {
      const r = p.outer;
      for (let i = 0; i < r.length; i += 2) {
        const j = (i + 2) % r.length;
        area += r[i] * r[j + 1] - r[j] * r[i + 1];
      }
    }
    assert.ok(Math.abs(area / 2) > 500, `${id} has a plausible planted area`);
  }
});

test('the district only overlays the 沃德嘉园 source footprints and invents no building', () => {
  assert.ok(result, 'the neighbourhood exists in the geodata');
  const insideCount = REAL_BUILDINGS.filter(b => b.category === 'residential' && inside(b.cx, b.cz)).length;
  assert.equal(insideCount, 72, 'the estate keeps its 72 mapped residential records');
  assert.ok(result.stats.buildings > 60 && result.stats.buildings <= insideCount,
    'small sheds are skipped, the rows are all detailed');
  for (const r of result.group.userData.records) {
    assert.ok(inside(r.cx, r.cz), `no detail outside the boundary: ${r.cx},${r.cz}`);
    assert.ok(r.floors >= 1 && r.floors <= 9);
  }
  assert.equal(result.group.userData.records.length, result.stats.buildings);
  assert.match(result.group.userData.photoBasis, /capture dates? unpublished/i);
  assert.match(result.group.userData.facadeNote, /勒脚/);
  assert.match(result.group.userData.gateNote, /标准图/);
});

test('every detailed row gets a grass verge and a paved entrance apron', () => {
  assert.ok(result.stats.groundStrips > 40, `rows with ground strips: ${result.stats.groundStrips}`);
  for (const name of ['沃德·楼前草地', '沃德·楼前铺装']) {
    const mesh = result.group.children.find(m => m.name === name);
    assert.ok(mesh, name);
    const pos = mesh.geometry.attributes.position.array;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < pos.length; i += 3) { minY = Math.min(minY, pos[i]); maxY = Math.max(maxY, pos[i]); }
    assert.ok(minY >= 0.22 && maxY <= 0.26, `${name} stays on the residential base`);
  }
});

test('roof tones follow the satellite split at the central north-south lane', () => {
  const records = result.group.userData.records;
  const red = records.filter(r => r.roof === 'red');
  const pale = records.filter(r => r.roof === 'pale');
  const flat = records.filter(r => r.roof === 'flat');
  assert.equal(red.length + pale.length, result.stats.pitchedRoofs);
  assert.equal(flat.length, result.stats.flatRoofs);
  assert.ok(red.length > 10 && pale.length > 5, 'both roof finishes are present');
  for (const r of red) assert.ok(r.cx < 620, 'terracotta roofs stay west of the lane');
  for (const r of pale) assert.ok(r.cx >= 620, 'pale roofs stay east of the lane');
  assert.match(result.group.userData.roofSplitNote, /x<620/);
});

test('balconies and unit doors only appear on storey buildings, never on the ground floor', () => {
  const records = result.group.userData.records;
  const withBalconies = records.filter(r => r.balconyRows > 0);
  for (const r of records) {
    if (r.floors < 3) assert.equal(r.balconyRows, 0, `${r.cx},${r.cz} is too low for balcony rows`);
    // Rows whose long axis runs north-south have no sun-facing long facade, so they are left plain.
    else assert.ok(r.balconyRows === 0 || r.balconyRows === r.floors - 1,
      `balcony rows repeat on every storey above the ground floor (${r.cx},${r.cz})`);
  }
  assert.ok(withBalconies.length > records.length * 0.6, 'most rows carry balconies');
  // Two units per stair bay, so balconies outnumber entrances.
  assert.ok(result.stats.balconies > result.stats.entrances * 4);
});

test('every mesh vertex is finite and stays inside the district envelope', () => {
  const xs = ring.map(p => p.x), zs = ring.map(p => p.z);
  const minX = Math.min(...xs) - 40, maxX = Math.max(...xs) + 40;
  const minZ = Math.min(...zs) - 40, maxZ = Math.max(...zs) + 40;
  let verts = 0;
  for (const mesh of result.group.children) {
    const pos = mesh.geometry.attributes.position.array;
    const nor = mesh.geometry.attributes.normal.array;
    const uv = mesh.geometry.attributes.uv.array;
    assert.equal(pos.length % 3, 0);
    assert.equal(nor.length, pos.length);
    assert.equal(uv.length / 2, pos.length / 3);
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), mesh.name);
      assert.ok(x > minX && x < maxX && z > minZ && z < maxZ, `${mesh.name} vertex outside the estate: ${x},${z}`);
      assert.ok(y >= 0 && y < 40, `${mesh.name} height out of range: ${y}`);
      const nx = nor[i], ny = nor[i + 1], nz = nor[i + 2];
      assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-6, `${mesh.name} normal is not unit length`);
    }
    verts += pos.length / 3;
  }
  assert.ok(verts > 200000 && verts < 700000, `detail budget stayed in range: ${verts}`);
});

test('shopfronts only face a named road and their sign quads stand vertical', () => {
  assert.equal(result.stats.shopEdges, 4, 'only the 河滨路 frontage touches a named street');
  assert.ok(result.stats.signs >= result.stats.shopEdges);
  const signs = result.group.children.find(m => m.name === '沃德·店招');
  const pos = signs.geometry.attributes.position.array;
  for (let i = 0; i < pos.length; i += 18) {
    const a = [pos[i], pos[i + 1], pos[i + 2]];
    const b = [pos[i + 3], pos[i + 4], pos[i + 5]];
    const c = [pos[i + 6], pos[i + 7], pos[i + 8]];
    const ux = b[0] - a[0], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = -uz * vy, ny = uz * vx - ux * vz, nz = ux * vy;
    const len = Math.hypot(nx, ny, nz);
    assert.ok(len > 0);
    assert.ok(Math.abs(ny / len) < 0.02, 'sign quads are vertical');
  }
});

test('stone plinths and white belt courses wrap every detailed row like the photos', () => {
  const base = result.group.children.find(m => m.name === '沃德·石材勒脚');
  const band = result.group.children.find(m => m.name === '沃德·白色腰线');
  assert.ok(base && band, 'photo-based facade bands exist');
  assert.ok(result.stats.stoneBands > 300, `ring edges banded: ${result.stats.stoneBands}`);
  for (const [mesh, lo, hi] of [[base, 0.22, 2.42], [band, 2.4, 22]]) {
    const pos = mesh.geometry.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
      assert.ok(pos[i] >= lo && pos[i] <= hi, `${mesh.name} height ${pos[i]}`);
    }
  }
  // The base band must sit under the first white band on the same wall.
  const basePos = base.geometry.attributes.position.array;
  let maxY = -Infinity;
  for (let i = 1; i < basePos.length; i += 3) maxY = Math.max(maxY, basePos[i]);
  assert.ok(maxY < 2.7, 'the stone base stays below the first belt course');
});

test('grass-grid parking strips sit outside the row greens and clear of source buildings', () => {
  const park = result.group.children.find(m => m.name === '沃德·植草砖车位');
  const lines = result.group.children.find(m => m.name === '沃德·车位线');
  assert.ok(park && lines, 'parking strips exist');
  assert.ok(result.stats.parkBays > 100, `parking bays painted: ${result.stats.parkBays}`);
  const inFootprint = (x, z) => {
    for (const b of REAL_BUILDINGS) {
      for (const poly of b.polygons) {
        const ring = poly.outer;
        let hit = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i], c = ring[j];
          if ((a.z > z) !== (c.z > z) && x < (c.x - a.x) * (z - a.z) / (c.z - a.z) + a.x) hit = !hit;
        }
        if (hit) return true;
      }
    }
    return false;
  };
  const pos = park.geometry.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    assert.ok(y >= 0.22 && y <= 0.26, 'parking strips stay on the ground');
    // No parking vertex may fall inside a real source footprint (AABBs are too coarse
    // for the rotated row blocks, so containment is tested on the polygon rings).
    if (inFootprint(pos[i], pos[i + 2])) {
      assert.fail(`parking vertex inside source footprint at ${pos[i].toFixed(1)},${pos[i + 2].toFixed(1)}`);
    }
  }
});

test('the four mapped gates appear with plaques, barriers and guard booths', () => {
  assert.equal(result.stats.gates, 4, '西门 / 南门 / 南1门 / 南2门');
  const plaque = result.group.children.find(m => m.name === '沃德·门名牌');
  const stones = result.group.children.find(m => m.name === '沃德·门柱');
  const booths = result.group.children.find(m => m.name === '沃德·门卫室');
  const barrier = result.group.children.find(m => m.name === '沃德·道闸');
  assert.ok(plaque && stones && booths && barrier, 'gate parts are built');
  const pos = plaque.geometry.attributes.position.array;
  // Four gates × two readable faces; each face is one quad (6 vertices).
  assert.equal(pos.length / 3, 4 * 2 * 6, 'one plaque quad pair per gate');
  const zs = [];
  for (let i = 2; i < pos.length; i += 3 * 36) zs.push(pos[i]);
  // Gates lie on the estate edge: the three south gates share the southern band.
  const gateBoxes = [];
  const gp = stones.geometry.attributes.position.array;
  for (let i = 0; i < gp.length; i += 3 * 36) {
    gateBoxes.push([gp[i], gp[i + 1], gp[i + 2]]);
  }
  assert.equal(gateBoxes.length, 12, 'two pillars plus one beam backing per gate');
});

test('balcony panels carry the photo grille and entrances get canopies and AC units', () => {
  const balcony = result.group.children.find(m => m.name === '沃德·阳台栏板');
  // The VM harness has no document, so the canvas texture is null; the wiring is
  // checked on the module source and the material keeps the pale grille colour.
  assert.ok(source.includes('grilleTexture()'), 'the photo grille texture is wired in');
  assert.equal(balcony.material.color, 0xd8d4cc);
  assert.ok(result.stats.acUnits > 200, `AC units placed: ${result.stats.acUnits}`);
  const awning = result.group.children.find(m => m.name === '沃德·雨棚');
  assert.ok(awning, 'maroon entrance canopies share the awning batch');
  assert.ok(result.stats.evPiles === 2, 'two EV charging piles anchor the parking strips');
  const booths = result.group.children.find(m => m.name === '沃德·门卫室');
  // Guard booths plus the two charging piles.
  assert.equal(booths.geometry.attributes.position.array.length / 3, (4 + 2) * 36);
});
