import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { PHOTO_LANDMARK_SITES as sites } from '../js/landmark-data.js';
import { LANDMARKS, LANDMARK_SITES, TELEPORT_LOCATIONS, isWater } from '../js/city-config.js';
import { LANDMARK_REFERENCES } from '../js/landmark-references.js';

const source = JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz', import.meta.url)))).buildings;

test('commercial replacements reference exact source records, while the school preserves its campus', () => {
  for (const name of ['大润发', '吾悦广场']) {
    const site = sites[name];
    assert.ok(site.sourceBuildingIndices.length);
    for (const i of site.sourceBuildingIndices) assert.equal(source[i].id, site.sourceId);
  }
  const school = sites['江苏省沭阳高级中学'];
  assert.equal(school.preserveSource, true);
  assert.equal(school.sourceBuildingIndices, undefined);
  assert.ok(school.campusBuildingIndices.length >= 20);
  const replacements = new Set(Object.values(sites).flatMap(s => s.sourceBuildingIndices || []));
  for (const i of school.campusBuildingIndices) {
    assert.ok(source[i].polygons.length);
    assert.equal(replacements.has(i), false);
  }
});

test('new landmark arrivals stay dry, in front of their verified entrance and face it', () => {
  for (const id of ['rtmart', 'wuyue', 'highschool']) {
    const lm = LANDMARKS.find(l => l.id === id), site = LANDMARK_SITES[lm.name];
    const p = TELEPORT_LOCATIONS[id], a = site.viewTarget || lm;
    const dx = p.x - a.x, dz = p.z - a.z, distance = Math.hypot(dx, dz);
    assert.equal(isWater(p.x, p.z), false, id);
    assert.ok((dx * site.front.x + dz * site.front.z) / distance > .75, id + ' reaches the entrance side');
    assert.ok(distance > 40 && distance < 200, id + ' has a useful viewing distance');
    assert.ok(Math.abs(Math.sin(p.heading) + dx / distance) < 1e-9);
    assert.ok(Math.abs(Math.cos(p.heading) + dz / distance) < 1e-9);
  }
});

test('every selectable landmark has an attributed public photograph and source page', () => {
  assert.ok(LANDMARKS.length >= 17);
  assert.deepEqual(Object.keys(LANDMARK_REFERENCES).sort(), LANDMARKS.map(l => l.id).sort());
  for (const r of Object.values(LANDMARK_REFERENCES)) {
    assert.ok(r.note.length && r.photos.length);
    for (const p of r.photos) {
      for (const key of ['image', 'page']) {
        assert.equal(new URL(p[key]).protocol, 'https:');
        assert.doesNotMatch(p[key], /(?:[?&](?:key|jscode|securityJsCode)=)/i);
      }
      assert.ok(p.caption.length && p.credit.length);
    }
  }
  assert.match(LANDMARK_REFERENCES.rtmart.note, /历史/);
  assert.match(LANDMARK_REFERENCES.rtmart.photos[0].caption, /2009/);
});

test('name corrections retain the north river sculpture and current factory district locations', () => {
  assert.ok(LANDMARKS.find(l => l.id === 'shuhe').z < -1200);
  assert.match(LANDMARKS.find(l => l.id === 'cotton').name, /老服装厂/);
  assert.equal(LANDMARKS.find(l => l.id === 'yuji').name, '虞姬生态园');
});
