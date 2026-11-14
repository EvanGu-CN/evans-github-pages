import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { GEO } from '../js/shuyang-geodata.js';
import { LANDMARK_SITES, TELEPORT_LOCATIONS, isWater } from '../js/city-config.js';
import { PHOTO_LANDMARK_SITES } from '../js/landmark-data.js';
const { loadModule } = createRequire(import.meta.url)('./helpers/module.cjs');

const enriched = JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz', import.meta.url))));
const trace = JSON.parse(readFileSync(new URL('../tools/data/shuyang/online-district-traces.json', import.meta.url)));

test('RT-Mart keeps one mapped footprint and gains no invented buildings', () => {
  const site = PHOTO_LANDMARK_SITES['大润发'];
  assert.ok(site && site.sourceId === 'way/497798167');
  for (const i of site.sourceBuildingIndices) assert.equal(enriched.buildings[i].id, site.sourceId);
  // 全量清单护栏：本批为八一·文枢院及周边补录 13 条 reviewed 来源（3 条因与既有来源重叠被保守拒绝）。
  assert.equal(enriched.buildings.length, 7741);
  assert.equal(enriched.buildings.filter(b => b.source === 'ReviewedImagery').length, 183);
});

test('the north forecourt is a reviewed asphalt surface with an unknown capture date', () => {
  const surface = GEO.urban.surfaces.find(s => s.id === 'reviewed/rtmart/north-forecourt');
  assert.ok(surface, 'reviewed forecourt surface');
  assert.equal(surface.kind, 'parking');
  assert.equal(surface.referenceId, 'amap-rtmart-20261113');
  assert.equal(surface.imageAcquired, null);
  assert.ok(surface.polygons.length >= 1);
  const ref = trace.additionalReferences.find(r => r.id === 'amap-rtmart-20261113');
  assert.ok(ref && ref.size[0] === 3840 && ref.size[1] === 3328);
  assert.equal(ref.imageAcquired, null);
  const area = surface.polygons.reduce((sum, p) => {
    const ring = p.outer;
    let a = 0;
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;
      a += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
    }
    return sum + Math.abs(a / 2);
  }, 0);
  assert.ok(area > 4000 && area < 12000, `plausible forecourt area, got ${area}`);
});

test('the RT-Mart model rebuilds the 2024 beige entrance, east garage and roof plant', () => {
  const site = LANDMARK_SITES['大润发'];
  const building = GEO.mapBuildings.find(b => b.id === site.sourceId);
  assert.ok(building && building.o.length === 16);

  class Geo {
    constructor() { this.positions = []; this.attrs = {}; }
    setAttribute(name, attr) { this.attrs[name] = attr; }
    setIndex(index) { this.index = index; }
    computeVertexNormals() {}
    rotateX() { return this; }
    translate(x, y, z) { this.offset = [x, y, z]; return this; }
  }
  const Path = class {
    moveTo() {} lineTo() {} closePath() {}
  };
  const Mesh = class {
    constructor(geometry, material) {
      this.geometry = geometry; this.material = material;
      this.position = { set() {} }; this.rotation = { y: 0 }; this.scale = { set() {} };
      this.name = ''; this.castShadow = false; this.receiveShadow = false;
    }
  };
  const Instanced = class {
    constructor(geometry, material, count) {
      this.geometry = geometry; this.material = material; this.count = count;
      this.instanceMatrix = { needsUpdate: false }; this.name = '';
    }
    setMatrixAt() {} computeBoundingSphere() {}
  };
  const THREE = {
    Mesh, InstancedMesh: Instanced, Path, Shape: Path, ShapeGeometry: Geo, BufferGeometry: Geo,
    BoxGeometry: Geo, PlaneGeometry: Geo, Float32BufferAttribute: class { constructor(a) { this.array = a; } },
    MeshStandardNodeMaterial: class { constructor(o) { Object.assign(this, o); } clone() { return new this.constructor(this); } },
    MeshBasicNodeMaterial: class { constructor(o) { Object.assign(this, o); } clone() { return new this.constructor(this); } },
    Matrix4: class { compose() {} }, Quaternion: class { setFromEuler() {} },
    Vector3: class { set() {} }, Euler: class { set() {} },
    CanvasTexture: class { constructor(c) { this.image = c; } },
    DoubleSide: 2, SRGBColorSpace: 'srgb'
  };
  const ctx = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        clearRect() {}, fillRect() {}, fillText() {},
        set fillStyle(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {}
      })
    })
  };
  const meshes = [], boxes = [], instanced = [], sources = [];
  const group = { userData: {}, add(m) { meshes.push(m); } };
  const c = { s: site, g: group, M: {} };
  const sourceEdges = (cc) => {
    const b = GEO.mapBuildings.find(q => q.id === cc.s.sourceId);
    const n = b.o.length / 2;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += b.o[i * 2] * b.o[j * 2 + 1] - b.o[j * 2] * b.o[i * 2 + 1];
    }
    const side = area > 0 ? 1 : -1;
    return Array.from({ length: n }, (_, i) => {
      const j = (i + 1) % n, dx = b.o[j * 2] - b.o[i * 2], dz = b.o[j * 2 + 1] - b.o[i * 2 + 1];
      const L = Math.hypot(dx, dz);
      return {
        x: (b.o[j * 2] + b.o[i * 2]) / 2 - cc.s.x, z: (b.o[j * 2 + 1] + b.o[i * 2 + 1]) / 2 - cc.s.z, L,
        nx: side * dz / L, nz: -side * dx / L, tx: dx / L, tz: dz / L,
        ry: -Math.atan2(dz, dx), facing: Math.atan2(side * dz / L, -side * dx / L)
      };
    });
  };
  const { buildRtMartDistrict } = loadModule(
    readFileSync(new URL('../js/rtmart-district.js', import.meta.url), 'utf8'),
    {
      imports: { 'three/webgpu': THREE, './shuyang-geodata.js': { GEO } },
      globals: { document: ctx }
    }
  );
  buildRtMartDistrict({
    ctxFor: () => c,
    sourceBody: (cc, material, height) => sources.push(height),
    sourceEdges,
    box: (cc, material, x, y, z, w, h, d, opts = {}) => boxes.push({ x, y, z, w, h, d, opts })
  });

  assert.deepEqual(sources, [17.2], 'one source body at the mapped 17.2 m roofline');
  assert.ok(boxes.length > 25);
  assert.ok(boxes.every(b => b.opts.collide === false), 'all facade detail is non-colliding');
  const wing = boxes.find(b => b.h === 11.6 && b.d < 1);
  assert.ok(wing && wing.z < -40, 'lower two-storey frontage sits on the north side');
  assert.ok(boxes.some(b => Math.abs(b.y - 4.55) < .01 && b.d > 1.5), 'north entrance canopy');
  const booth = boxes.find(b => b.h === 2.7 && b.w === 2.0);
  assert.ok(booth && booth.x > 50, 'garage guard booth sits at the east end');

  const names = meshes.map(m => m.name || '');
  for (const name of ['大润发·西北圆角米色墙', '大润发·主楼屋面', '大润发·入口红色横带',
    '大润发·立体车库格栅', '大润发·屋顶空调机组', '大润发·停车位标线']) {
    assert.ok(names.includes(name), name);
  }
  const labels = names.filter(n => n.startsWith('大润发·文字·') || n.includes('入口横带文字')).join('|');
  for (const text of ['大润发入口', 'RT-Mart', '汽车入口']) assert.match(labels, new RegExp(text));
  assert.ok(meshes.filter(m => m.name === '大润发·文字·大润发').length >= 1);

  // 2026-11-14 批次：西屋面停车层、螺旋坡道口、沿街业态、南侧商铺、前场设施。
  for (const name of ['大润发·西屋面停车层', '大润发·螺旋坡道环', '大润发·螺旋坡道井',
    '大润发·车库水马', '大润发·南侧壁柱', '大润发·屋面车位线', '大润发·屋面停车车身']) {
    assert.ok(names.includes(name), name);
  }
  for (const text of ['收货区', '北门', '肯德基', '蜜雪冰城', '好必和大食堂', '罗莱家纺', '西门', '鸭血粉丝', '大润发北', '大润发西']) {
    assert.match(labels, new RegExp(text), 'tenant/gate/stop label ' + text);
  }
  assert.match(labels, /立体停车场|立/, 'vertical garage sign letters');
  assert.ok(boxes.length > 50, 'forecourt and facade furniture expands the box count');
  assert.ok(meshes.filter(m => typeof m.count === 'number').length >= 14, 'bays, cars, barriers and screens stay instanced');

  const arc = meshes.find(m => m.name === '大润发·西北圆角米色墙');
  const positions = arc.geometry.attrs.position.array;
  assert.ok(positions.length > 30);
  for (let i = 0; i < positions.length; i += 3) {
    assert.ok(positions[i] < -45 && positions[i + 2] < -43, 'curve stays at the north-west corner');
  }
  assert.ok(Math.min(...positions.filter((_, i) => i % 3 === 0)) < -58, 'curve reaches the west facade');
});

test('the RT-Mart teleport stays dry and outside the new frontage', () => {
  const p = TELEPORT_LOCATIONS.rtmart;
  assert.equal(isWater(p.x, p.z), false);
  const site = LANDMARK_SITES['大润发'];
  const distance = Math.hypot(p.x - site.x, p.z - site.z);
  assert.ok(distance > 40 && distance < 200);
});
