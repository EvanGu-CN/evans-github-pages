// Full source inventory for the ongoing refinement goal. Statuses describe
// evidence registration, not a claim that every visible surface is restored.
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {GEO} from '../js/shuyang-geodata.js';
import {LANDMARK_SITES, ROADS} from '../js/city-config.js';
import {BUILDING_PHOTO_REFERENCES} from '../js/building-photo-references.js';

const root = new URL('../', import.meta.url);
const source = JSON.parse(gunzipSync(readFileSync(new URL('tools/data/shuyang/buildings-enriched.json.gz', root)))).buildings;
const bindings = new Map();
for (const [name, site] of Object.entries(LANDMARK_SITES)) {
  for (const i of site.sourceBuildingIndices || []) {
    if (!source[i]) throw new Error('Invalid model source index: '+i);
    if (!bindings.has(i)) bindings.set(i, []);
    bindings.get(i).push(name);
  }
}
const reviewed = new Map(BUILDING_PHOTO_REFERENCES.map(r => [r.sourceBuildingIndex, r]));
for (const [i, r] of reviewed) if (source[i]?.id !== r.sourceId) throw new Error('Photo binding drift: '+r.sourceId);
const mapNames = new Map(GEO.mapBuildings.map(b => [b.id, b.n || '']));
const buildings = source.map((b, i) => {
  const points = b.polygons.flatMap(p => p.outer);
  const xs = points.map(p=>p[0]), zs = points.map(p=>p[1]);
  const x = (Math.min(...xs)+Math.max(...xs))/2, z = (Math.min(...zs)+Math.max(...zs))/2;
  const r = reviewed.get(i);
  return {index:i, id:b.id, name:r?.name || mapNames.get(b.id) || '', x:Math.round(x), z:Math.round(z),
    height:b.height, category:b.category, status:r?'photo-frontage-estimate':bindings.has(i)?'model-bound':'not-yet-inventoried',
    model:bindings.get(i)||[], review:r?.id||null, modeledFaces:r?.modeledFaces||[]};
});
const geometryKey = (name, pts) => createHash('sha256').update(JSON.stringify([name,pts])).digest('hex').slice(0,16);
const roads = ROADS.map(r => {
  const review = BUILDING_PHOTO_REFERENCES.filter(p => p.streetSection?.name === r.name &&
    Math.max(...r.pts.map(p=>p.z)) >= p.streetSection.minZ && Math.min(...r.pts.map(p=>p.z)) <= p.streetSection.maxZ);
  return {key:geometryKey(r.name,r.pts), name:r.name, kind:r.kind, width:r.w,
    status:review.length?'partial-frontage-reference':'not-yet-inventoried',
    review:review.map(p=>({id:p.id,...p.streetSection})), points:r.pts};
});
const paths = GEO.mapPaths.map(p=>({key:geometryKey(p[0],p),name:p[0],status:'not-yet-inventoried',source:p}));
const statusCounts = entries => Object.fromEntries([...new Set(entries.map(b=>b.status))].map(s=>[s,entries.filter(b=>b.status===s).length]));
const zones = new Map();
for (const b of buildings) {
  const key = `${Math.floor(b.x/600)},${Math.floor(b.z/600)}`;
  if (!zones.has(key)) zones.set(key,{grid:key,buildings:0,notInventoried:0,named:[]});
  const z = zones.get(key); z.buildings++; if(b.status==='not-yet-inventoried')z.notInventoried++;
  if(b.name)z.named.push({id:b.id,name:b.name,status:b.status});
}
const report = {scope:'All source buildings and roads within the existing Shuyang core-city dataset; no area is removed from the goal.',
  limits:'Not-yet-inventoried means no per-source evidence record here; existing campus, housing and street overlays are not yet fully registered. Model-bound is not full facade verification. No status means complete.',
  buildings:buildings.length, roads:roads.length, paths:paths.length,
  buildingStatus:statusCounts(buildings),roadStatus:statusCounts(roads),
  sourceDigest:createHash('sha256').update(readFileSync(new URL('tools/data/shuyang/buildings-enriched.json.gz',root))).digest('hex')};
const out = new URL('docs/refinement/',root); mkdirSync(out,{recursive:true});
writeFileSync(new URL('coverage.json',out),JSON.stringify({report,zones:[...zones.values()],buildings,roads,paths})+'\n');
writeFileSync(new URL('summary.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
