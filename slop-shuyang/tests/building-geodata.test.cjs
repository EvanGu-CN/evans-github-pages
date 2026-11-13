const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { Script } = require('node:vm');
const { gunzipSync, gzipSync } = require('node:zlib');
const {createHash,webcrypto} = require('node:crypto');

const compressed = readFileSync(join(__dirname, '../js/building-geodata.bin.gz'));
const dataVersion=createHash('sha256').update(gunzipSync(compressed)).digest('hex');
const enriched = JSON.parse(gunzipSync(readFileSync(join(__dirname, '../tools/data/shuyang/buildings-enriched.json.gz'))));
const source = readFileSync(join(__dirname, '../js/building-geodata.js'), 'utf8')
  .replace(/^import \{GEO\} from '\.\/shuyang-geodata\.js';$/m,'')
  .replace('import.meta.url', JSON.stringify('https://example.test/city/js/building-geodata.js'))
  .replace('export const REAL_BUILDINGS', 'const REAL_BUILDINGS');
const script = new Script(`(async () => { ${source}\nreturn REAL_BUILDINGS; })()`);

function loadBuildings(bytes = compressed, status = 200,version=dataVersion) {
  return script.runInNewContext({ URL, Response, DecompressionStream,crypto:webcrypto,GEO:{buildingDataVersion:version,buildingAudit:enriched.report},
    fetch: async (url,options) => {
      assert.equal(url.href, 'https://example.test/city/js/building-geodata.bin.gz?v='+version);
      assert.equal(options.cache,'no-store');
      return new Response(bytes, { status });
    }
  });
}
const buildings = loadBuildings();

function area(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
  }
  return sum / 2;
}

test('the compressed survey retains every footprint and quantized dimension', async () => {
  const REAL_BUILDINGS = await buildings;
  assert.equal(REAL_BUILDINGS.length, enriched.buildings.length);
  assert.ok(REAL_BUILDINGS.length > 7000, 'the missing satellite-derived footprints are included');
  for (const [index, building] of REAL_BUILDINGS.entries()) {
    const original = enriched.buildings[index];
    for (const key of ['height', 'baseHeight', 'category', 'heightSource', 'source', 'levels', 'roofShape', 'roofHeight']) {
      assert.equal(building[key], original[key], `attribute ${key} retained for ${original.id}`);
    }
    assert.ok(building.height >= 2 && building.height <= 200);
    assert.equal(building.year, 0, 'OSM buildings carry no construction decade');
    const points = [];
    assert.equal(building.polygons.length, original.polygons.length, 'multi-part outlines are retained');
    assert.ok(building.polygons.length > 0);
    for (const polygon of building.polygons) {
      assert.ok(area(polygon.outer) > 0, 'Exterior winds counterclockwise in x/z.');
      for (const hole of polygon.holes) assert.ok(area(hole) < 0, 'courtyards wind opposite to exteriors');
      for (const ring of [polygon.outer, ...polygon.holes]) {
        assert.ok(ring.length >= 3);
        for (let i = 0; i < ring.length; i++) {
          const point = ring[i], next = ring[(i + 1) % ring.length];
          assert.ok(Number.isInteger(point.x * 2) && Number.isInteger(point.z * 2));
          assert.ok(point.x !== next.x || point.z !== next.z, 'No duplicate closing or adjacent vertices.');
          points.push(point);
        }
      }
    }
    assert.equal(building.minX, Math.min(...points.map(p => p.x)));
    assert.equal(building.maxX, Math.max(...points.map(p => p.x)));
    assert.equal(building.minZ, Math.min(...points.map(p => p.z)));
    assert.equal(building.maxZ, Math.max(...points.map(p => p.z)));
    assert.equal(building.cx, (building.minX + building.maxX) / 2);
    assert.equal(building.cz, (building.minZ + building.maxZ) / 2);
  }
});

test('survey buildings sit inside the Shuyang city frame', async () => {
  const REAL_BUILDINGS = await buildings;
  assert.ok(REAL_BUILDINGS.length > 1000);
  const near = REAL_BUILDINGS.filter((b) => Math.hypot(b.cx, b.cz) < 600);
  assert.ok(near.length > 50, 'the county seat has surveyed buildings');
  for (const building of REAL_BUILDINGS) {
    assert.ok(building.minX > -8000 && building.maxX < 10000, 'x within the city extent');
    assert.ok(building.minZ > -7000 && building.maxZ < 9000, 'z within the city extent');
    assert.ok(building.height > 0);
  }
});

test('building data reports HTTP and gzip failures', async () => {
  await assert.rejects(loadBuildings(compressed, 404), /Building data request failed: 404/);
  await assert.rejects(loadBuildings(Buffer.from('not gzip')));
});

test('a stale binary with a valid format and count cannot silently mix with another geography version',async()=>{
  await assert.rejects(loadBuildings(compressed,200,'0'.repeat(64)),/建筑数据版本未同步/);
});

test('building data rejects damaged headers, truncated streams and trailing bytes', async () => {
  const data = gunzipSync(compressed);
  const badVersion = Buffer.from(data);
  badVersion[3]++;
  const badOffsets = Buffer.from(data);
  badOffsets.writeUInt32LE(data.length, 4);
  for (const invalid of [data.subarray(0, 8), badVersion, badOffsets,
    data.subarray(0, data.length - 1), Buffer.concat([data, Buffer.from([0])])]) {
    await assert.rejects(loadBuildings(gzipSync(invalid)), /Invalid building data/);
  }
});
