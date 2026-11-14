import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { NEIGHBORHOODS, ROADS } from '../js/city-config.js';
import { GEO } from '../js/shuyang-geodata.js';

const { loadModule } = createRequire(import.meta.url)('./helpers/module.cjs');
const source = readFileSync(new URL('../js/bayi-district.js', import.meta.url), 'utf8');

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
    seed: 201 + i, polygons,
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

const { buildBayiDistrict } = loadModule(source, {
  imports: {
    'three/webgpu': THREE,
    './building-geodata.js': { REAL_BUILDINGS },
    './city-config.js': { NEIGHBORHOODS, ROADS }
  }
});

const neighbourhood = NEIGHBORHOODS.find(n => n.name === '八一·文枢院');
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
const result = buildBayiDistrict(root);

test('the neighbourhood name is the corrected 八一·文枢院 with the tagged spelling searchable', () => {
  assert.ok(neighbourhood, 'the estate exists in the geodata');
  assert.equal(neighbourhood.name, '八一·文枢院');
  assert.ok(neighbourhood.aliases.includes('八一·文殊院'), 'the wrong OSM spelling stays as an alias');
  assert.ok(neighbourhood.aliases.includes('八一文枢院'), 'the punctuated form is searchable too');
});

test('the district only overlays the 八一·文枢院 source footprints and invents no building', () => {
  assert.ok(result, 'the module found the estate');
  const slabs = REAL_BUILDINGS.filter(b =>
    b.category === 'residential' && b.height >= 8.5 && inside(b.cx, b.cz));
  assert.equal(slabs.length, 18, 'the estate keeps its 18 mapped residential rows');
  assert.equal(result.stats.buildings, 18, 'every mapped row is detailed, none is invented');
  for (const r of result.group.userData.records) {
    assert.ok(inside(r.cx, r.cz), `no detail outside the boundary: ${r.cx},${r.cz}`);
    assert.ok(r.floors >= 2 && r.floors <= 9, `storeys stay typological: ${r.floors}`);
  }
  assert.equal(result.group.userData.records.length, result.stats.buildings);
  assert.match(result.group.userData.photoBasis, /capture date unpublished/i);
});

test('every row carries a white parapet ring and dark rooftop cores, tanks and solar panels', () => {
  assert.ok(result.stats.parapets >= 18 * 4, `parapet edges: ${result.stats.parapets}`);
  assert.ok(result.stats.roofCores >= 18, `roof cores: ${result.stats.roofCores}`);
  assert.ok(result.stats.tanks >= 8, `water tanks: ${result.stats.tanks}`);
  assert.ok(result.stats.solarPanels >= 16, `solar panels: ${result.stats.solarPanels}`);
  for (const r of result.group.userData.records) {
    assert.ok(r.cores >= 1, `each row keeps at least one stair core (${r.cx},${r.cz})`);
    assert.ok(r.cores <= 8, `core count stays typological (${r.cx},${r.cz})`);
  }
});

test('balconies only appear above the ground floor on sun-facing rows', () => {
  const records = result.group.userData.records;
  const withBalconies = records.filter(r => r.balconyRows > 0);
  for (const r of records) {
    assert.ok(r.balconyRows === 0 || r.balconyRows === r.floors - 1,
      `balcony rows repeat on every storey above ground (${r.cx},${r.cz})`);
  }
  assert.ok(withBalconies.length >= records.length * 0.5, 'most rows carry balconies');
  assert.ok(result.stats.balconies > result.stats.entrances * 3, 'balconies outnumber unit doors');
  const slab = result.group.children.find(m => m.name === '文枢院·阳台板');
  assert.ok(slab);
  const pos = slab.geometry.attributes.position.array;
  let minY = Infinity;
  for (let i = 1; i < pos.length; i += 3) minY = Math.min(minY, pos[i]);
  assert.ok(minY >= 2.5, `no balcony on the ground floor (lowest slab ${minY})`);
});

test('shopfronts only face 公园西路 and their sign quads stand vertical', () => {
  assert.ok(result.stats.shopEdges >= 1 && result.stats.shopEdges <= 8,
    `only the 公园西路 frontage gets shops: ${result.stats.shopEdges}`);
  assert.ok(result.stats.signs >= result.stats.shopEdges, 'each shop edge carries sign faces');
  const signs = result.group.children.find(m => m.name === '文枢院·店招');
  assert.ok(signs, 'the sign mesh exists');
  const pos = signs.geometry.attributes.position.array;
  assert.ok(pos.length >= result.stats.signs * 18);
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

test('the south gate and the sales-office forecourt carry the estate nameplate', () => {
  assert.equal(result.stats.gates, 1);
  const plate = result.group.children.find(m => m.name === '文枢院·名牌');
  assert.ok(plate, 'the nameplate mesh exists');
  const pos = plate.geometry.attributes.position.array;
  assert.ok(pos.length >= 4 * 3 * 2, 'gate and sales office both carry a plate');
  const stone = result.group.children.find(m => m.name === '文枢院·门柱');
  assert.ok(stone);
  const spos = stone.geometry.attributes.position.array;
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < spos.length; i += 3) {
    minX = Math.min(minX, spos[i]); maxX = Math.max(maxX, spos[i]);
  }
  assert.ok(minX > -800 && maxX < -650, `gate pillars sit at the estate south-west gate (${minX}..${maxX})`);
});

test('every mesh vertex is finite and stays inside the estate envelope', () => {
  const xs = ring.map(p => p.x), zs = ring.map(p => p.z);
  const minX = Math.min(...xs) - 45, maxX = Math.max(...xs) + 45;
  const minZ = Math.min(...zs) - 45, maxZ = Math.max(...zs) + 45;
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
  assert.ok(verts > 60000 && verts < 800000, `detail budget stayed in range: ${verts}`);
});
