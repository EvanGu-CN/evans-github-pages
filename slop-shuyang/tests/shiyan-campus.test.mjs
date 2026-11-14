import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {GEO} from '../js/shuyang-geodata.js';
import {LANDMARKS, LANDMARK_SITES, TELEPORT_LOCATIONS, isWater} from '../js/city-config.js';
import {PHOTO_LANDMARK_SITES} from '../js/landmark-data.js';
import {LANDMARK_REFERENCES} from '../js/landmark-references.js';
import {createRequire} from 'node:module';
const {loadModule} = createRequire(import.meta.url)('./helpers/module.cjs');

const load = name => JSON.parse(readFileSync(new URL('../tools/data/shuyang/' + name, import.meta.url)));
const enriched = JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz', import.meta.url))));
const REF = 'amap-shiyan-core-20261113';

test('Shiyan campus keeps its six mapped teaching blocks and does not invent footprints', () => {
  const site = PHOTO_LANDMARK_SITES['沭阳实验小学'];
  assert.ok(site && LANDMARK_SITES['沭阳实验小学']);
  assert.equal(site.teachingSourceIds.length, 6);
  assert.equal(site.sourceBuildingIndices.length, 6);
  assert.equal(site.preserveSource, true);
  assert.ok(site.campusBuildingIndices.length > 6, 'the rest of the campus keeps ordinary source buildings');
  const ids = site.sourceBuildingIndices.map(i => enriched.buildings[i].id);
  // Indices follow the enriched building table, not the trace ordering.
  assert.deepEqual([...ids].sort(), [...site.teachingSourceIds].sort());
  assert.ok(site.campusBoundary.length >= 5 && site.fountain.length === 2 && site.secondaryGate.length === 2);
  const fromThisBatch = enriched.buildings.filter(b => b.source === 'ReviewedImagery'
    && b.geometryReference?.referenceId === REF);
  assert.equal(fromThisBatch.length, 0, 'no guessed new building footprints');
  assert.equal(enriched.buildings.filter(b => b.source !== 'ReviewedImagery').length, 7558);
});

test('reviewed school and park surfaces carry the new unknown-date tile reference', () => {
  const expected = [
    'reviewed/shiyan/fountain-plaza',
    'reviewed/shiyan/east-sport-apron',
    'reviewed/shiyan/east-infield',
    'reviewed/chengbei/north-running-track',
    'reviewed/chengbei/north-infield'
  ];
  for (const id of expected) {
    const s = GEO.urban.surfaces.find(q => q.id === id);
    assert.ok(s && s.polygons.length, id);
    assert.equal(s.referenceId, REF, id);
    assert.equal(s.imageAcquired, null, id);
  }
  const walk = GEO.urban.surfaces.find(s => s.id === 'reviewed/shiyan/central-walk');
  assert.ok(walk && walk.kind === 'community-path');
  const track = GEO.urban.surfaces.find(s => s.id === 'reviewed/chengbei/north-running-track');
  const infield = GEO.urban.surfaces.find(s => s.id === 'reviewed/chengbei/north-infield');
  assert.equal(track.kind, 'running-track');
  assert.equal(infield.kind, 'infield');
});

test('the 21st teleport and its 2026 photo references stay consistent', () => {
  assert.ok(LANDMARKS.find(l => l.id === 'shiyan'));
  assert.equal(Object.keys(LANDMARK_REFERENCES).length, LANDMARKS.length);
  const ref = LANDMARK_REFERENCES.shiyan;
  assert.ok(ref.note.includes('拍摄日'));
  assert.equal(ref.photos.length, 3);
  for (const p of ref.photos) {
    for (const key of ['image', 'page']) assert.equal(new URL(p[key]).protocol, 'https:');
  }
  const p = TELEPORT_LOCATIONS.shiyan;
  const site = LANDMARK_SITES['沭阳实验小学'];
  assert.equal(isWater(p.x, p.z), false);
  const d = Math.hypot(p.x - site.x, p.z - site.z);
  assert.ok(d > 40 && d < 200, 'useful viewing distance from the south gate');
});

test('Shiyan model rebuilds six mapped facades and keeps the central gate passage open', () => {
  const geom = class { constructor() {} };
  const Mesh = class {
    constructor() { this.position = {set() {}}; this.rotation = {y:0}; }
  };
  const THREE = {
    Mesh,
    MeshStandardNodeMaterial: class {},
    TorusGeometry: geom, CircleGeometry: geom, PlaneGeometry: geom,
    DoubleSide: 2
  };
  const site = LANDMARK_SITES['沭阳实验小学'];
  const towerId = site.teachingSourceIds[3];
  const GEO = {mapBuildings: [{id:towerId, o:[0,0, 20,0, 20,40, 0,40]}]};
  const {buildShiyanCampus} = loadModule(
    readFileSync(new URL('../js/shiyan-campus.js', import.meta.url), 'utf8'),
    {imports: {'three/webgpu': THREE, './shuyang-geodata.js': {GEO}}}
  );
  const sources = [], solid = [], cylinders = [], g = {userData:{}, add() {}};
  const M = new Proxy({}, {get: () => ({})});
  const edge = {x:0, z:0, L:20, nx:0, nz:1, tx:1, tz:0, ry:0, facing:0};
  buildShiyanCampus({
    ctxFor: () => ({s:site, g, M}),
    sourceBody: c => sources.push(c.s.sourceId),
    sourceEdges: () => [edge],
    edgePanel: () => {},
    box: (c, m, x, y, z, w, h, d, o = {}) => { if (o.collide) solid.push({x, w}); },
    cyl: (c, m, x, y, z) => cylinders.push({x, z}),
    sign: () => {},
    M
  });
  assert.deepEqual([...sources].sort(), [...site.teachingSourceIds].sort());
  assert.equal(sources.length, 6);
  assert.ok(solid.every(b => Math.abs(b.x) > b.w / 2 + 1), 'gate centre stays open');
  assert.ok(cylinders.length >= 6, 'fountain basin, water and jets are built');
});
