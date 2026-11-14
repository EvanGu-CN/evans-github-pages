import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const { loadModule } = createRequire(import.meta.url)('./helpers/module.cjs');
const source = readFileSync(new URL('../js/mizhong-campus.js', import.meta.url), 'utf8');

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

const { buildMizhongCampus } = loadModule(source, {
  imports: {
    'three/webgpu': THREE,
    './building-geodata.js': { REAL_BUILDINGS }
  }
});

const root = new THREE.Group();
const result = buildMizhongCampus(root);

test('all 23 campus source footprints are matched and rendered', () => {
  assert.ok(result, 'module returns a result');
  assert.equal(result.stats.buildings, 23, 'all23 campus buildings matched');
});

test('each named role appears exactly where the evidence places it', () => {
  assert.equal(result.stats.yuhua, 1, 'one 育华楼');
  assert.equal(result.stats.auditorium, 1, 'one 大礼堂');
  assert.equal(result.stats.dorm, 5, 'five dormitory blocks in the north cluster');
  assert.ok(result.stats.teaching >= 5, 'at least five teaching buildings');
  assert.equal(result.stats.track, 1, 'one 400 m track');
});

test('campus geometry stays inside the campus bounding box', () => {
  for (const m of result.group.children) {
    const p = m.geometry?.attributes?.position?.array;
    if (!p) continue;
    for (let i = 0; i < p.length; i += 3) {
      assert.ok(Number.isFinite(p[i]) && Number.isFinite(p[i + 1]) && Number.isFinite(p[i + 2]),
        'all coordinates finite');
      assert.ok(p[i] > 820 && p[i] < 1420, `x ${p[i].toFixed(0)} inside campus`);
      assert.ok(p[i + 2] > -520 && p[i + 2] < 180, `z ${p[i + 2].toFixed(0)} inside campus`);
    }
  }
});

test('育华楼 gets the distinctive pediment and forecourt features', () => {
  const names = result.group.children.map(m => m.name);
  assert.ok(names.includes('沭中·山花'), 'pediment batch present');
  assert.ok(names.includes('沭中·金字'), 'gold characters batch present');
  assert.ok(names.includes('沭中·泰山石'), 'Taishan stone batch present');
});

test('the auditorium gets its gabled roof and brick walls', () => {
  const names = result.group.children.map(m => m.name);
  assert.ok(names.includes('沭中·蓝瓦坡顶'), 'blue-tile pitched roof present');
  assert.ok(names.includes('沭中·青砖墙'), 'grey brick wall present');
  assert.ok(names.includes('沭中·红窗框'), 'red window frames present');
});

test('teaching buildings get corridor railings and accent panels', () => {
  const names = result.group.children.map(m => m.name);
  assert.ok(names.includes('沭中·外廊栏板'), 'corridor balustrade present');
  assert.ok(names.includes('沭中·橙粉墙板'), 'orange accent panels present');
});

test('the running track and football field are rendered as ground surfaces', () => {
  const names = result.group.children.map(m => m.name);
  assert.ok(names.includes('沭中·跑道'), 'track surface present');
  assert.ok(names.includes('沭中·足球场'), 'green field present');
});

test('no source building was replaced — only overlay geometry exists', () => {
  // The module must not emit full building bodies; it emits facade strips,
  // roof planes, and ground surfaces. Every mesh name starts with 沭中·.
  for (const m of result.group.children) {
    assert.ok(m.name.startsWith('沭中·'), `mesh ${m.name} is an overlay batch`);
  }
});
