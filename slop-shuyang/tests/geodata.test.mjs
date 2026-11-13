import assert from 'node:assert/strict';
import test from 'node:test';

// 沭阳地理数据是 tools/build-shuyang-geodata.mjs 的产物；这里校验生成结果的结构与坐标范围。
test('Shuyang geodata exposes the roads, blocks, water and landmarks the city builds from', async () => {
  const { GEO } = await import('../js/shuyang-geodata.js');
  assert.equal(GEO.frame.bearingDeg, 0, 'the city frame is north-up');
  assert.equal(GEO.frame.origin, '人民中路 & 上海中路');
  assert.ok(GEO.roads.length > 500, 'OSM road ways');
  assert.ok(GEO.roadGraph.nodes.length > 100, 'road graph nodes');
  assert.ok(GEO.roadGraph.links.length > 500, 'road graph links');
  assert.ok(GEO.blocks.length > 100, 'curb islands');
  assert.ok(GEO.water.polygons.length > 10, 'water areas');
  assert.ok(GEO.water.lines.length > 10, 'waterways');
  assert.ok(GEO.parks.length > 5, 'parks');
  assert.ok(Object.keys(GEO.landmarks).length >= 15, 'landmarks');
  assert.ok(GEO.mapPaths.length > 20, 'map-only footpaths and cycleways');
  assert.ok(GEO.mapBuildings.length > 500, 'surveyed buildings for the vector map');
  assert.ok(GEO.railways.length > 0, 'railways');
  for (const road of GEO.roads) {
    assert.equal(typeof road[0], 'string');
    assert.ok(road[2] > 2, 'curb-to-curb width');
    assert.ok(road[6].length >= 4, 'polyline points');
  }
  for (const [flat] of GEO.blocks) {
    assert.ok(flat.length >= 6, 'a block outline has at least three points');
  }
  const { BOUNDS } = { BOUNDS: GEO.bounds };
  for (const [, , x, z] of GEO.pois) {
    assert.ok(x > BOUNDS.minX - 4000 && x < BOUNDS.maxX + 4000);
    assert.ok(z > BOUNDS.minZ - 4000 && z < BOUNDS.maxZ + 4000);
  }
});

test('the city configuration resolves blocks, roads, water and teleports', async () => {
  const { BLOCKS, ROADS, LANDMARKS, TELEPORT_LOCATIONS, blockAt, nearestRoads, isWater, getLocationLabel } =
    await import('../js/city-config.js');
  assert.ok(BLOCKS.length > 100);
  assert.ok(ROADS.length > 500);
  assert.ok(LANDMARKS.length >= 17);
  assert.deepEqual(Object.keys(TELEPORT_LOCATIONS).sort(), LANDMARKS.map((l) => l.id).sort());
  const block = BLOCKS.find((b) => b.park === 0 && !isWater(b.cx, b.cz) && b.area > 1000);
  assert.ok(block, 'a dry block exists');
  assert.ok(blockAt(block.cx, block.cz), 'blockAt finds the block centre');
  const road = ROADS.find((r) => r.name === '人民中路');
  assert.ok(road, '人民中路 exists');
  const p = road.pts[Math.floor(road.pts.length / 2)];
  assert.ok(nearestRoads(p.x, p.z, 30).length > 0);
  assert.ok(getLocationLabel(p.x, p.z).length > 0);
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    assert.ok(Number.isFinite(point.heading), `${name} has a heading`);
    assert.equal(blockAt(point.x, point.z), null, `${name} lands on a roadway`);
    assert.ok(!isWater(point.x, point.z), `${name} lands on dry land`);
  }
});
