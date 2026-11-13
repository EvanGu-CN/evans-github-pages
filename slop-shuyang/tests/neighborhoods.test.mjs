import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { GEO } from '../js/shuyang-geodata.js';
import { NEIGHBORHOODS, neighborhoodAt, getLocationLabel } from '../js/city-config.js';
import { CityMapSystem, externalMapLinks } from '../js/city-map.js';

test('real named housing polygons resolve at their interior anchors and remain searchable', () => {
  assert.ok(NEIGHBORHOODS.length >= 130);
  for (const name of ['巴黎新城', '金三角小区', '南湖郡', '天下景城', '沭阳县新江南小区']) {
    const n = NEIGHBORHOODS.find((p) => p.name === name);
    assert.ok(n, name);
    assert.ok(neighborhoodAt(n.x, n.z), `${name} anchor is inside a real boundary`);
    assert.equal(CityMapSystem.prototype.findPlace(name).name, name);
    assert.equal(CityMapSystem.prototype.findPlace(name).id, n.id);
  }
  assert.equal(CityMapSystem.prototype.findPlace('新江南').name, '沭阳县新江南小区');
  assert.equal(CityMapSystem.prototype.findPlace('不存在的小区名称'), null);
  assert.equal(neighborhoodAt(-10000, -10000), null);
  const n = NEIGHBORHOODS.find((p) => p.name === '金三角小区');
  assert.equal(getLocationLabel(n.x, n.z), n.name);
});

test('community building indices refer to this exact building extract without duplicate assignment', () => {
  const raw = fs.readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz', import.meta.url));
  const { buildings } = JSON.parse(zlib.gunzipSync(raw));
  const urban = JSON.parse(fs.readFileSync(new URL('../tools/data/shuyang/urban-context.json', import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), urban.buildingExtractSha256);
  const assigned = new Set();
  for (const n of GEO.neighborhoods) {
    assert.ok(n.polygons.length);
    for (const i of n.buildings) {
      assert.ok(i >= 0 && i < buildings.length);
      assert.ok(!assigned.has(i), 'nested residential areas cannot fight over facade styles');
      assigned.add(i);
      assert.ok(n.labelHeight > buildings[i].height, 'navigation annotations clear mapped rooftops');
    }
  }
  assert.equal(assigned.size, GEO.urban.audit.associatedBuildings);
  assert.ok(assigned.size > 2800);
});

test('3D paths and parking come from mapped surfaces with valid polygon holes', () => {
  assert.ok(GEO.urban.surfaces.filter((s) => s.kind === 'path').length >= 60);
  assert.ok(GEO.urban.surfaces.some((s) => s.kind === 'parking'));
  for (const s of GEO.urban.surfaces) for (const p of s.polygons) {
    assert.ok(p.outer.length >= 6);
    for (const ring of [p.outer, ...p.holes]) {
      assert.equal(ring.length % 2, 0);
      assert.ok(ring.every(Number.isFinite));
    }
  }
  assert.ok(GEO.urban.audit.snapshots.roads >= '2026-11-11T16:00:00Z');
});

test('non-residential building and campus names are searchable with source provenance', () => {
  assert.ok(GEO.namedSites.length >= 110);
  assert.equal(new Set(GEO.namedSites.map((s) => s.id)).size, GEO.namedSites.length);
  for (const kind of ['school', 'hospital', 'commercial', 'government', 'office', 'culture']) {
    const sites = GEO.namedSites.filter((p) => p.kind === kind);
    assert.ok(sites.length > 0, `${kind} is included`);
    for (const s of sites) {
      assert.ok(s.name && Number.isFinite(s.x) && Number.isFinite(s.z));
      assert.ok(['OSM', 'Overture'].includes(s.source));
      assert.ok(['building', 'place'].includes(s.scope));
      assert.equal(CityMapSystem.prototype.findPlace(s.name).name, s.name);
    }
  }
});

test('external map references use official search URLs and encode the selected place without mixing coordinates', () => {
  const name = '沭阳中医院 & 东门';
  const { amap, baidu } = externalMapLinks(name);
  const a = new URL(amap), b = new URL(baidu);
  assert.equal(a.origin, 'https://uri.amap.com');
  assert.equal(b.origin, 'https://api.map.baidu.com');
  assert.equal(a.searchParams.get('keyword'), name);
  assert.equal(b.searchParams.get('query'), name);
  assert.equal(a.searchParams.get('city'), '沭阳县');
  assert.equal(b.searchParams.get('region'), '沭阳县');
  assert.equal(a.searchParams.has('center'), false, 'WGS84 must not be passed as a GCJ/BD coordinate');
});
