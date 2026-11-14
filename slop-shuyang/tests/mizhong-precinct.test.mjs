import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const { loadModule } = createRequire(import.meta.url)('./helpers/module.cjs');
const source = readFileSync(new URL('../js/mizhong-precinct.js', import.meta.url), 'utf8');

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

const { buildMizhongPrecinct } = loadModule(source, {
  imports: {
    'three/webgpu': THREE,
    './building-geodata.js': { REAL_BUILDINGS }
  }
});

const root = new THREE.Group();
const result = buildMizhongPrecinct(root);

test('street shops are overlaid on existing source buildings only', () => {
  assert.ok(result, 'module returns a result');
  assert.ok(result.stats.buildings >= 8, `at least 8 street-facing buildings dressed, got ${result.stats.buildings}`);
  assert.ok(result.stats.shops >= 16, `at least 16 shopfronts, got ${result.stats.shops}`);
});

test('three photo-evidenced gates are present', () => {
  assert.equal(result.stats.gates, 3, '东关实验小学 + 西大门 + 7号门');
});

test('shop signs use real AMap POI labels from the standard map', () => {
  const src = readFileSync(new URL('../js/mizhong-precinct.js', import.meta.url), 'utf8');
  for (const name of ['东关实验小学', '阳光文具', '状元书店', '北大书店', '意林书店', '瑞幸咖啡', '蜜雪冰城']) {
    assert.ok(src.includes(name), `POI label ${name} present`);
  }
});

test('all overlay meshes stay named and inside the precinct box', () => {
  for (const m of root.children) {
    assert.ok(m.name.startsWith('沭中周边·'), `mesh ${m.name} is a precinct overlay`);
    const p = m.geometry?.attributes?.position?.array;
    if (!p) continue;
    for (let i = 0; i < p.length; i += 3) {
      assert.ok(Number.isFinite(p[i]) && Number.isFinite(p[i + 1]) && Number.isFinite(p[i + 2]), 'finite coords');
      assert.ok(p[i] > 600 && p[i] < 1400, `x ${p[i].toFixed(0)} inside precinct`);
      assert.ok(p[i + 2] > -600 && p[i + 2] < 400, `z ${p[i + 2].toFixed(0)} inside precinct`);
    }
  }
});

test('no source building replaced — overlay only', () => {
  for (const m of root.children) {
    const p = m.geometry?.attributes?.position?.array;
    if (!p) continue;
    // 每个三角形都是小构件（店招/窗/雨棚/柱），不应出现整栋体量
    for (let i = 0; i < p.length; i += 9) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let k = 0; k < 9; k += 3) {
        minX = Math.min(minX, p[i + k]); maxX = Math.max(maxX, p[i + k]);
        minZ = Math.min(minZ, p[i + k + 2]); maxZ = Math.max(maxZ, p[i + k + 2]);
      }
      assert.ok(maxX - minX < 120, `triangle x-span in ${m.name} is not a building body`);
      assert.ok(maxZ - minZ < 120, `triangle z-span in ${m.name} is not a building body`);
    }
  }
});

test('userData records photo basis and caveats', () => {
  assert.ok(root.userData.photoBasis.includes('高德'), 'map basis recorded');
  assert.ok(root.userData.precinctNote.includes('不代表实际商户'), 'shop caveat recorded');
});
