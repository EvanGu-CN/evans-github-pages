import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import clipping from '../js/vendor/polygon-clipping.js';
import {GEO} from '../js/shuyang-geodata.js';
import {CULTURAL_HALLS,ARCHIVES_ROOF,archivesRoofFootprint} from '../js/cultural-hall-layout.js';
import {preserveBuildingCoverage} from '../js/building-coverage.js';
const records=JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz',import.meta.url)))).buildings;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ring=p=>p.map(q=>[q.x,q.z]);
const ar=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
const area=m=>m.reduce((s,p)=>s+ar(p[0])-p.slice(1).reduce((s,r)=>s+ar(r),0),0);
const outer=archivesRoofFootprint(),r=records[ARCHIVES_ROOF.sourceBuildingIndex];

test('adding the missing archive candidate preserves all 7741 established source records verbatim',()=>{
  assert.equal(hash(records.slice(0,7741)),'0dfe83213b18f3a711db593d43162a9649a9c6e3befc60cd582046c665ee6276');
  assert.equal(records.length,7742);assert.equal(r.id,ARCHIVES_ROOF.sourceId);
  assert.equal(GEO.mapBuildings.length,7745);
});
test('the tracked ID order matches every packed source index including the appended record',()=>{
  const order=JSON.parse(readFileSync(new URL('../tools/data/shuyang/building-source-order.json',import.meta.url))).ids;
  assert.equal(new Set(order).size,order.length);assert.deepEqual(order,records.map(b=>b.id));
  assert.equal(order[7741],'reviewed/online/cultural/archives');
});
test('the appended source keeps unknown acquisition date, inferred identity and estimated height explicit',()=>{
  assert.equal(r.source,'ReviewedImagery');assert.equal(r.heightSource,'estimate');assert.equal(r.height,20);assert.equal(r.levels,0);
  assert.match(r.name,/位置推定/);assert.equal(r.geometryReference.imageDate,null);
  assert.match(r.geometryReference.accuracyNote,/identity is inferred/);assert.match(r.heightNote,/no measured height or floor count/);
  assert.match(ARCHIVES_ROOF.limits,/Ground facade remains generic/);assert.equal(ARCHIVES_ROOF.streetPhoto,undefined);
});
test('the new roof remains separate from both museums and the library instead of extending an old parcel',()=>{
  assert.ok(area([[ring(outer)]])>4000&&area([[ring(outer)]])<5000);
  for(const h of CULTURAL_HALLS)assert.ok(area(clipping.intersection([ring(outer)],[ring(h.outer)]))<1e-7);
  for(const p of outer)assert.ok(p.x>=-3200&&p.x<=3400&&p.z>=-2400&&p.z<=5000);
});
test('satellite-visible glazing and dark roof region stay inside the new source body and do not overlap',()=>{
  for(const p of [ARCHIVES_ROOF.glazing,ARCHIVES_ROOF.roofWell])assert.ok(area(clipping.difference([ring(p)],[ring(outer)]))<1e-7);
  assert.ok(area(clipping.intersection([ring(ARCHIVES_ROOF.glazing)],[ring(ARCHIVES_ROOF.roofWell)]))<1e-7);
});
test('a source-backed roof collider cannot remove the source body in ground coverage clipping',()=>{
  const xs=outer.map(p=>p.x),zs=outer.map(p=>p.z),body={height:20,polygons:[{outer,holes:[]}],minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
  const result=preserveBuildingCoverage([body],new Set(),[{...body,minY:20.22,maxY:20.6,polygon:body.polygons[0],sourceFootprint:true}]);
  assert.equal(result.rendered[0],body);assert.equal(result.audit.fullyCovered.length,0);assert.equal(result.audit.clipped.length,0);
});
test('building expansion leaves every source road centreline and all mapped paths intact',()=>{
  assert.equal(hash(GEO.roads),'6340f84446791cc0646838b9c3e81c6d067888d8bc71fe7a3a26ba39a2f730da');
  assert.equal(new Set(GEO.roadSourceIds).size,1104);assert.equal(GEO.mapPaths.length,92);
});
