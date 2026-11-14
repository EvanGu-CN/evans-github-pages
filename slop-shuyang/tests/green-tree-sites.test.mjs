import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { GEO } from '../js/shuyang-geodata.js';
import { collectGreenTreeSites } from '../js/green-tree-sites.js';

const ringArea = (ring) => {
  let a = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    a += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
  }
  return Math.abs(a / 2);
};
const inRing = (ring, x, z) => {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const x1 = ring[i], z1 = ring[i + 1], x2 = ring[j], z2 = ring[j + 1];
    if ((z1 > z) !== (z2 > z) && x < (x2 - x1) * (z - z1) / (z2 - z1) + x1) hit = !hit;
  }
  return hit;
};

test('the sampler fills a green surface and skips blocked ground', () => {
  const surfaces = [{
    id: 'reviewed/wode/row-green-000', kind: 'green',
    polygons: [{ outer: [0, 0, 40, 0, 40, 30, 0, 30], holes: [] }]
  }];
  const blocked = (x, z) => x > 30;
  const sites = collectGreenTreeSites(surfaces, blocked);
  assert.ok(sites.length >= 6, `got ${sites.length} trees`);
  for (const s of sites) {
    assert.ok(inRing(surfaces[0].polygons[0].outer, s.x, s.z), `tree outside the surface: ${s.x},${s.z}`);
    assert.ok(s.x <= 30, 'blocked side stays empty');
    assert.ok(Number.isFinite(s.scale) && s.scale > 0);
  }
});

test('only reviewed Wode green surfaces receive courtyard trees', () => {
  const buildings = JSON.parse(gunzipSync(readFileSync(
    new URL('../tools/data/shuyang/buildings-enriched.json.gz', import.meta.url)))).buildings;
  const boxes = buildings.map(b => {
    const xs = [], zs = [];
    for (const p of b.polygons) for (const [x, z] of p.outer) { xs.push(x); zs.push(z); }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  });
  // Same bbox-pad rejection the street module applies through its collider grid.
  const blockedAt = (x, z, pad = 1.6) => boxes.some(b =>
    x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);
  const sites = collectGreenTreeSites(GEO.urban.surfaces, blockedAt);
  assert.ok(sites.length > 100, `Wode green surfaces yield trees: ${sites.length}`);
  const hood = GEO.neighborhoods.find(n => n.name === '沃德嘉园');
  const ring = hood.polygons[0].outer;
  const flat = [];
  for (let i = 0; i < ring.length; i += 2) flat.push(ring[i], ring[i + 1]);
  for (const s of sites) assert.ok(inRing(flat, s.x, s.z), `tree outside the estate: ${s.x},${s.z}`);

  // Trees must not sit on a mapped building footprint.
  for (const s of sites) {
    for (const b of buildings) {
      for (const p of b.polygons) {
        if (inRing(p.outer.flatMap(q => [q[0], q[1]]), s.x, s.z)) {
          assert.fail(`tree inside building ${b.id}: ${s.x},${s.z}`);
        }
      }
    }
  }
});

test('green areas are real surfaces, not empty placeholders', () => {
  const greens = GEO.urban.surfaces.filter(s => s.kind === 'green' && s.id.startsWith('reviewed/wode/'));
  assert.ok(greens.length > 50, `reviewed Wode green surfaces: ${greens.length}`);
  const area = greens.reduce((sum, s) => sum + s.polygons.reduce((a, p) => a + ringArea(p.outer), 0), 0);
  assert.ok(area > 12000, `planted area: ${area}`);
  for (const s of greens) {
    assert.equal(s.referenceId, 'amap-wode-rtmart-20261113');
    assert.equal(s.imageAcquired, null);
  }
});
