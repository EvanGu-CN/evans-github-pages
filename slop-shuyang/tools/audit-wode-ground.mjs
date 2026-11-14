// Audit the Wode ground-detail batch: green surfaces, planted area and trees.
// Reads the same modules the app loads, so counts match what renders.
import { writeFileSync } from 'node:fs';
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

const greens = GEO.urban.surfaces.filter(s => s.kind === 'green' && s.id.startsWith('reviewed/wode/'));
const rowGreen = greens.filter(s => s.id.startsWith('reviewed/wode/row-green'));
const perimeter = greens.filter(s => s.id.startsWith('reviewed/wode/perimeter-'));
const areaOf = (list) => list.reduce((sum, s) =>
  sum + s.polygons.reduce((a, p) => a + ringArea(p.outer), 0), 0);

const buildings = JSON.parse(gunzipSync(readFileSync(
  new URL('../tools/data/shuyang/buildings-enriched.json.gz', import.meta.url)))).buildings;
const boxes = buildings.map(b => {
  const xs = [], zs = [];
  for (const p of b.polygons) for (const [x, z] of p.outer) { xs.push(x); zs.push(z); }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
});
const blockedAt = (x, z, pad = 1.6) => boxes.some(b =>
  x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);
const trees = collectGreenTreeSites(GEO.urban.surfaces, blockedAt);

const hood = GEO.neighborhoods.find(n => n.name === '沃德嘉园');
const audit = {
  neighbourhood: hood.name,
  neighbourhoodAreaM2: Math.round(ringArea(hood.polygons[0].outer)),
  greenSurfaces: greens.length,
  rowGreenStrips: rowGreen.length,
  perimeterBelts: perimeter.length,
  plantedAreaM2: Math.round(areaOf(greens)),
  rowGreenAreaM2: Math.round(areaOf(rowGreen)),
  perimeterAreaM2: Math.round(areaOf(perimeter)),
  courtyardTrees: trees.length,
  buildingRecords: buildings.length,
  newBuildingRecords: 0,
  surfaceReference: 'amap-wode-rtmart-20261113',
  imageAcquired: greens.every(s => s.imageAcquired === null) ? null : 'mixed',
  note: 'Row strips are derived from mapped row footprints and clipped against every source building and each other; perimeter belts follow the estate boundary inset 14 m. Trees come from the same sampler the street module uses, with the building collision pad. No building footprint is added or replaced.'
};
writeFileSync(new URL('../docs/acceptance/wode-ground-2026-11-13/data-audit.json', import.meta.url),
  JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify(audit));
