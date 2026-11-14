import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {GEO} from '../js/shuyang-geodata.js';
import {LANDMARK_SITES} from '../js/city-config.js';
import {LANDMARK_REFERENCES} from '../js/landmark-references.js';

const {loadModule} = createRequire(import.meta.url)('./helpers/module.cjs');
const load = name => JSON.parse(readFileSync(new URL('../tools/data/shuyang/' + name, import.meta.url)));
const enriched = JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz', import.meta.url))));
const REF = 'amap-core-retail-20261113';

test('core retail review adds forecourts and inner-street routes without inventing footprints', () => {
  const traces = load('online-district-traces.json');
  const ref = traces.additionalReferences.find(r => r.id === REF);
  assert.ok(ref && ref.imageAcquired === null);
  assert.equal(ref.mapOffset.length, 2);
  assert.ok(traces.coreRetail.towerVolumes.length >= 3);
  assert.ok(traces.coreRetail.sources.length >= 6);
  const ids = [
    'reviewed/core/central-north-plaza',
    'reviewed/core/bluesky-south-plaza',
    'reviewed/core/bluesky-snack-street'
  ];
  for (const id of ids) {
    const s = GEO.urban.surfaces.find(q => q.id === id);
    assert.ok(s && s.polygons.length, id);
    assert.equal(s.referenceId, REF, id);
    assert.equal(s.imageAcquired, null, id);
  }
  // The 1936 inner street falls inside already mapped pedestrian paving, so the
  // urban build absorbs it rather than laying a duplicate surface.
  const inner = load('reviewed-district-surfaces.json').surfaces
    .find(s => s.id === 'reviewed/core/central-arcade-walk');
  assert.ok(inner && inner.rings.length, 'inner street is traced');
  assert.equal(GEO.urban.surfaces.some(s => s.id === 'reviewed/core/central-arcade-walk'), false);
  assert.equal(enriched.buildings.filter(b => b.source === 'ReviewedImagery'
    && b.geometryReference?.referenceId === REF).length, 0, 'no guessed source footprints');
  assert.equal(enriched.buildings.filter(b => b.source !== 'ReviewedImagery').length, 7558);
});

test('core retail notes keep the two malls distinct and cite the 2026 field survey', () => {
  assert.match(LANDMARK_REFERENCES.central.note, /147\.15|2025|七层/);
  assert.match(LANDMARK_REFERENCES.bluesky.note, /28层|贴砖/);
  assert.ok(LANDMARK_SITES['中央城市广场'] && LANDMARK_SITES['蓝天国际商贸城']);
  assert.ok(LANDMARK_SITES['中央城市广场'].h >= 147);
});

test('core retail detail module builds facades, category signs and the tower crown', () => {
  const geom = class { constructor() {} };
  const Vec = class {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new Vec(this.x, this.y, this.z); }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
    length() { return Math.hypot(this.x, this.y, this.z); }
  };
  let meshCount = 0;
  const Mesh = class {
    constructor() {
      meshCount++;
      this.position = {set() {}, copy() { return this; }, add() { return this; }, multiplyScalar() { return this; }};
      this.rotation = {x:0, y:0};
      this.quaternion = {setFromUnitVectors() {}};
    }
  };
  const THREE = {
    Mesh,
    MeshStandardNodeMaterial: class {},
    MeshBasicNodeMaterial: class {},
    TorusGeometry: geom, CircleGeometry: geom, CylinderGeometry: geom, SphereGeometry: geom,
    Vector3: Vec,
    DoubleSide: 2
  };
  const {buildCoreRetail} = loadModule(
    readFileSync(new URL('../js/core-retail.js', import.meta.url), 'utf8'),
    {imports: {'three/webgpu': THREE}}
  );
  const calls = {box:0, cyl:0, sign:0, panel:0, edges:[]};
  const M = new Proxy({}, {get: () => ({})});
  const longEdge = {x:0, z:0, L:60, nx:0, nz:1, tx:1, tz:0, ry:0, facing:0};
  const sideEdge = {x:0, z:0, L:40, nx:1, nz:0, tx:0, tz:1, ry:0, facing:Math.PI / 2};
  const towerEdge = {x:70, z:51, L:20, nx:0, nz:1, tx:1, tz:0, ry:0, facing:0};
  const contexts = [];
  const ctxFor = name => {
    const s = {...LANDMARK_SITES[name], sourceId: name === '中央城市广场' ? 'way/1086134482' : 'way/1321791084'};
    const c = {s, g:{userData:{}, add() {}}, M};
    contexts.push(c);
    return c;
  };
  buildCoreRetail({
    ctxFor,
    box: () => { calls.box++; },
    cyl: () => { calls.cyl++; },
    sign: () => { calls.sign++; },
    M,
    sourceEdges: c => {
      calls.edges.push(c.s.sourceId);
      return c.s.sourceId === 'way/1455053540' ? [towerEdge] : [longEdge, sideEdge];
    },
    edgePanel: () => { calls.panel++; }
  });
  assert.equal(contexts.length, 2, 'both malls are refined');
  assert.deepEqual(calls.edges, ['way/1086134482', 'way/1455053540', 'way/1321791084']);
  assert.ok(calls.panel > 80, 'projecting slabs, louvers, tile bands and refuge galleries are placed');
  assert.ok(calls.box > 150, 'stone fins, entrance hall, roof plant and crown are placed');
  assert.ok(calls.cyl > 20, 'portico columns, entrance posts, lamps and furniture');
  assert.equal(calls.sign, 6, 'category shop signs plus the mall fascia, no invented brand names');
  assert.ok(meshCount > 20, 'solid struts, roundels, lanterns and aviation lights are real meshes');
});
