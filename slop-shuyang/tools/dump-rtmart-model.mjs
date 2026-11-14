// Dump the RT-Mart model's actual element geometry for plan/elevation review drawings.
// No browser or GPU is used: the production module runs unchanged against a recording
// three.js stub, so the drawing reflects the code rather than a hand-redrawn sketch.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { GEO } from '../js/shuyang-geodata.js';
import { LANDMARK_SITES } from '../js/city-config.js';
const { loadModule } = createRequire(import.meta.url)('../tests/helpers/module.cjs');

const site = LANDMARK_SITES['大润发'];
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);

class Geo {
  constructor(w = 0, h = 0) {
    this.positions = [];
    this.attrs = {};
    this.width = w;
    this.height = h;
  }
  setAttribute(name, attr) { this.attrs[name] = attr; }
  setIndex(index) { this.index = index; }
  computeVertexNormals() {}
  rotateX() { return this; }
  translate(x, y, z) { this.offset = [x, y, z]; return this; }
}
const Path = class {
  constructor() { this.points = []; }
  moveTo(x, y) { this.points.push([x, y]); }
  lineTo(x, y) { this.points.push([x, y]); }
  closePath() {}
};
class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = { set: (x, y, z) => { this.p = [x, y, z]; } };
    this.rotation = { y: 0 };
    this.scale = { set() {} };
    this.castShadow = false;
    this.receiveShadow = false;
    this.name = '';
  }
}
class Instanced {
  constructor(geometry, material, count) {
    this.geometry = geometry;
    this.material = material;
    this.count = count;
    this.items = [];
    this.instanceMatrix = { needsUpdate: false };
    this.name = '';
  }
  setMatrixAt(i, matrix) { this.items[i] = { ...matrix.item }; }
  computeBoundingSphere() {}
}
class Matrix4 {
  compose(pos, quat, scale) {
    this.item = { x: pos.x, y: pos.y, z: pos.z, w: scale.x, h: scale.y, d: scale.z, ry: quat.y };
  }
}
const THREE = {
  Mesh, InstancedMesh: Instanced, Path, Shape: Path,
  ShapeGeometry: class extends Geo { constructor(shape) { super(); this.shape = shape; } },
  BufferGeometry: Geo,
  BoxGeometry: class extends Geo { constructor(w = 1, h = 1, d = 1) { super(w, h, d); } },
  PlaneGeometry: class extends Geo { constructor(w, h) { super(w, h); } },
  Float32BufferAttribute: class { constructor(a) { this.array = a; } },
  MeshStandardNodeMaterial: class { constructor(o) { Object.assign(this, o); } clone() { return new this.constructor(this); } },
  MeshBasicNodeMaterial: class { constructor(o) { Object.assign(this, o); } clone() { return new this.constructor(this); } },
  Matrix4, Quaternion: class { setFromEuler(e) { this.y = e.y; } },
  Vector3: class { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
  Euler: class { set(x, y, z) { this.y = y; } },
  CanvasTexture: class { constructor(c) { this.image = c; } },
  DoubleSide: 2, SRGBColorSpace: 'srgb'
};
const fakeDocument = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      clearRect() {}, fillRect() {}, fillText() {},
      set fillStyle(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {}
    })
  })
};
const meshes = [], boxes = [], instances = [];
const c = { s: site, g: { userData: {}, add: (m) => meshes.push(m) }, M: {} };
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
  { imports: { 'three/webgpu': THREE, './shuyang-geodata.js': { GEO } }, globals: { document: fakeDocument } }
);
buildRtMartDistrict({
  ctxFor: () => c,
  sourceBody: (_c, _m, height) => boxes.push({ kind: 'sourceBody', height }),
  sourceEdges,
  box: (_c, material, x, y, z, w, h, d, opts = {}) => {
    boxes.push({ x, y, z, w, h, d, ry: opts.ry || 0, color: hex(material.color) });
    return null;
  }
});
const meshRecords = [];
for (const m of meshes) {
  if (m.items) {
    instances.push({ name: m.name, color: hex(m.material.color), items: m.items });
  } else {
    meshRecords.push({
      kind: 'mesh', name: m.name, color: hex(m.material?.color),
      positions: m.geometry?.attrs?.position?.array || [],
      shape: m.geometry?.shape?.points || [],
      w: m.geometry?.width, h: m.geometry?.height,
      p: m.p || [0, 0, 0], ry: m.rotation?.y || 0
    });
  }
}
const output = {
  site,
  building: GEO.mapBuildings.find(b => b.id === site.sourceId),
  edges: sourceEdges(c),
  boxes,
  meshes: meshRecords,
  instances: instances.filter(x => x.name && x.items?.length),
  generatedAt: new Date().toISOString(),
  note: 'Recorded from js/rtmart-district.js via a stubbed three.js module; positions are group-local metres. Not a browser screenshot.'
};
writeFileSync(new URL('../docs/acceptance/rtmart-district-2026-11-14/model-elements.json', import.meta.url), JSON.stringify(output) + '\n');
console.log(JSON.stringify({ boxes: boxes.length, instancedGroups: instances.length, meshes: meshes.length }));
