import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import clipping from '../js/vendor/polygon-clipping.js';
import {GEO} from '../js/shuyang-geodata.js';
import {roadRibbonTriangles} from '../js/road-ribbon.js';
import {CORE_JUNCTION_FRONTAGE as F} from '../js/core-junction-frontage-data.js';
import {CORE_FRONTAGE_POLYGONS,coreFrontageAt,coreFrontageHeightAt} from '../js/core-junction-frontage-layout.js';
const points=r=>Array.from({length:r.length/2},(_,i)=>[r[i*2],r[i*2+1]]);
const poly=p=>[points(p.outer),...p.holes.map(points)];
const ar=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0)/2);
const area=m=>m.reduce((s,p)=>s+ar(p[0])-p.slice(1).reduce((s,r)=>s+ar(r),0),0);
const all=F.surfaces.flatMap(s=>s.polygons.map(poly)),mask=clipping.union(...all);
const near=(p)=>{const xs=p.map(p=>p[0]),zs=p.map(p=>p[1]),b=F.extent;return Math.max(...xs)>b[0]-30&&Math.min(...xs)<b[2]+30&&Math.max(...zs)>b[1]-30&&Math.min(...zs)<b[3]+30};
test('core frontage preserves every source road, map part and building binary',()=>{
  assert.equal(createHash('sha256').update(JSON.stringify(GEO.roads)).digest('hex'),F.sourceRoadsDigest);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../js/building-geodata.bin.gz',import.meta.url))).digest('hex'),'211ef701274c3124809f5fe0390b2fc949ce47c968b967b0d2c03d98fb79615f');
  assert.equal(GEO.mapBuildings.length,7745);assert.equal(new Set(GEO.roadSourceIds).size,1104);assert.equal(GEO.mapPaths.length,92);
  for(const id of F.sourceWayIds)assert.ok(GEO.roadSourceIds.includes(id));
});
test('coloured frontage never overlaps actual road ribbon triangles',()=>{
  let checked=0;for(const r of GEO.roads){if(r[5])continue;const ps=points(r[6]);if(!near(ps))continue;
    for(const t of roadRibbonTriangles(ps.map(([x,z])=>({x,z})),r[2])){const ring=t.map(p=>[p.x,p.z]);if(ar(ring)<1e-7)continue;checked++;assert.ok(area(clipping.intersection(mask,[ring]))<.002,r[0]);}}
  assert.ok(checked>12);assert.equal(F.audit.roadOverlapM2,0);
});
test('new surfaces avoid every nearby source building, including the separate southern shop row',()=>{
  const checked=new Set();for(const b of GEO.mapBuildings){const p=points(b.o);if(!near(p))continue;checked.add(b.id);assert.ok(area(clipping.intersection(mask,[p,...b.holes.map(points)]))<.002,b.id);}
  for(const id of ['way/1367632165','way/995943494','way/1086134483'])assert.ok(checked.has(id));assert.equal(F.audit.buildingOverlapM2,0);
});
test('blue/red/joint surfaces remain disjoint and preserve the clipped area',()=>{
  for(const p of all){assert.ok(p.flat(2).every(Number.isFinite));assert.ok(area([p])>.014);}
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)assert.ok(area(clipping.intersection(all[i],all[j]))<.002);
  assert.ok(Math.abs(area(all)-F.audit.blueAreaM2-F.audit.redAreaM2)<.1);assert.ok(area(all)>2400&&area(all)<2600);assert.ok(F.audit.removedAreaM2>600);
});
test('tree exclusion and walking height use exactly the displayed frontage polygons',()=>{
  let inside=0;for(let x=F.extent[0];x<F.extent[2];x+=2)for(let z=F.extent[1];z<F.extent[3];z+=2)if(coreFrontageAt(x,z)){inside++;assert.equal(coreFrontageHeightAt(x,z),F.height);assert.ok(coreFrontageAt(x,z,.65));}
  assert.ok(inside>500);assert.equal(coreFrontageAt(0,0,1),false);assert.equal(coreFrontageHeightAt(0,0),null);
  assert.equal(CORE_FRONTAGE_POLYGONS.length,all.length);assert.equal(F.height,.33);
});
test('AI pedestrians follow the reviewed height without changing remote crosswalk stepping',()=>{
  const source=readFileSync(new URL('../js/pedestrian-system.js',import.meta.url),'utf8'),fn=source.match(/  function pedGround\([^]*?\n  \}/)[0];
  const ground=vm.runInNewContext('('+fn+')',{coreFrontageHeightAt,SIDEWALK_Y:.22,CROSSWALK_Y:.012});
  const sample=all.flatMap(p=>p[0]).find(([x,z])=>coreFrontageAt(x+.1,z+.1));assert.ok(sample);assert.equal(ground({node:null},sample[0]+.1,sample[1]+.1),F.height);
  assert.equal(ground({node:null},0,0),.22);assert.equal(ground({node:{},ax:0,az:0,ux:1,uz:0,len:20},10,0),.012);
});
test('evidence keeps the two colour bands distinct from regulated traffic lanes',()=>{
  assert.equal(F.captureDate,null);assert.equal(F.imagery.imageAcquired,null);assert.match(F.limits,/not asserted to be regulated cycle lanes/);assert.match(F.limits,/Road names, motor lane counts\/widths, crosswalks, signals/);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../tools/data/shuyang/core-junction-frontage-traces.json',import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),F.traceSha256);
});
