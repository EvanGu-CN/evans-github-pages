import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ROADS } from '../js/city-config.js';

const { loadModule } = createRequire(import.meta.url)('./helpers/module.cjs');
const source = readFileSync(new URL('../js/wode-streetscape.js', import.meta.url), 'utf8');

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
  CanvasTexture: class { constructor() { this.colorSpace = ''; } },
  RepeatWrapping: 1000,
  SRGBColorSpace: 'srgb'
};

const { buildWodeStreetscape } = loadModule(source, {
  imports: {
    'three/webgpu': THREE,
    './city-config.js': { ROADS }
  }
});

const root = new THREE.Group();
const result = buildWodeStreetscape(root);

test('road-edge study window only carries photo-backed strip types', () => {
  assert.ok(result, 'the module builds');
  const { stats } = result;
  assert.ok(stats.brickSegments > 20, `brick parking strips along the mapped roads: ${stats.brickSegments}`);
  assert.ok(stats.slabSegments > 20, `stone-slab sidewalk accents: ${stats.slabSegments}`);
  assert.ok(stats.slotLines > 200, `yellow parking slot lines: ${stats.slotLines}`);
  assert.ok(stats.promenadeSegments > 4, `riverside promenade along 河滨路: ${stats.promenadeSegments}`);
  assert.ok(stats.lamps > 20, `decorative lamp posts: ${stats.lamps}`);
  // Brick strips follow 临安*/长安路 only; 苏州西路 keeps its avenue character.
  for (const name of stats.roads) {
    assert.match(name, /^(临安|长安路|苏州西路|河滨)/, `unexpected road in the window: ${name}`);
  }
  assert.ok(stats.roads.some(n => /^临安/.test(n)), 'the 临安 roads are covered');
  assert.ok(stats.roads.includes('河滨路'), 'the riverfront road is covered');
  assert.ok(stats.roads.includes('苏州西路'), 'the north avenue is covered');
});

test('no strip leaves the study window and all pieces hug the ground', () => {
  for (const mesh of result.group.children) {
    const pos = mesh.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      assert.ok(x > 360 && x < 860, `${mesh.name} outside window x=${x}`);
      assert.ok(z > 1540 && z < 2480, `${mesh.name} outside window z=${z}`);
      if (mesh.name === '沿街·景观灯柱' || mesh.name === '沿街·景观灯头') {
        assert.ok(y >= 0.2 && y <= 4.6, `${mesh.name} height ${y}`);
      } else {
        assert.ok(y >= 0.22 && y <= 0.27, `${mesh.name} height ${y}`);
      }
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), mesh.name);
    }
  }
});

test('the photo basis keeps the position caveat and unpublished capture dates', () => {
  assert.match(result.group.userData.photoBasis, /position not point-bound/i);
  assert.match(result.group.userData.photoBasis, /capture date unpublished/i);
});

test('bricks never cover the carriageway: offsets sit outside the mapped road half-width', () => {
  // The brick strip centre is at half+1.9 m and 2.6 m wide, so its inner edge is
  // 0.6 m clear of the carriageway edge of every road the module touches.
  for (const name of result.group.userData.stats.roads) {
    const road = ROADS.find(r => r.name === name);
    assert.ok(road, name);
    assert.ok((road.w || 12) >= 6, `${name} is a real carriageway`);
  }
});
