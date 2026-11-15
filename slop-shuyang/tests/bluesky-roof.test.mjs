import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GEO} from '../js/shuyang-geodata.js';
import clipping from '../js/vendor/polygon-clipping.js';
import {BLUESKY_ROOF as R,blueskyRoofSurfaces,blueskyRoofPavilion} from '../js/bluesky-roof-layout.js';
import {RENMIN_JUNCTION_REFERENCE} from '../js/road-photo-references.js';
const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0)/2);
const polyArea=m=>m.reduce((s,p)=>s+area(p[0])-p.slice(1).reduce((a,r)=>a+area(r),0),0);
const ring=r=>r.map(p=>[p.x,p.z]);
const source=GEO.mapBuildings.find(b=>b.id===R.sourceId),sourceRing=Array.from({length:source.o.length/2},(_,i)=>source.o.slice(i*2,i*2+2));
test('roof detail keeps the bound market source footprint and original height',()=>{
  assert.equal(R.sourceIndex,2726);assert.equal(source.h,19.3);assert.equal(R.sourceHeight,19.3);
  assert.deepEqual(source.o,[8,-201.5,-262.5,-319.5,-344,-139.5,-34,-50.5]);assert.deepEqual(source.holes,[]);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../js/building-geodata.bin.gz',import.meta.url))).digest('hex'),'211ef701274c3124809f5fe0390b2fc949ce47c968b967b0d2c03d98fb79615f');
});
test('reviewed roof traces remain inside the original source and in separate regions',()=>{
  for(const r of [R.pavilion,R.terrace,R.darkPanel,...R.beds])assert.ok(polyArea(clipping.difference([r],[sourceRing]))<1e-7);
  assert.ok(polyArea(clipping.intersection([R.pavilion],[R.terrace]))<1e-7);
  assert.ok(area(R.pavilion)>2000&&area(R.pavilion)<2200);assert.ok(area(R.terrace)>10000&&area(R.terrace)<10400);
  for(const r of [...R.beds,R.darkPanel])assert.ok(polyArea(clipping.difference([r],[R.terrace]))<1e-7);
});
test('paving excludes all planted beds and the dark roof patch without overlaps',()=>{
  const surfaces=blueskyRoofSurfaces(),paving=surfaces.find(s=>s.material==='paving'),rings=[ring(paving.outer),...paving.holes.map(ring)];
  assert.equal(paving.holes.length,4);assert.equal(surfaces.filter(s=>s.material==='green').length,3);
  for(let i=1;i<rings.length;i++)for(let j=i+1;j<rings.length;j++)assert.ok(polyArea(clipping.intersection([rings[i]],[rings[j]]))<1e-7);
  assert.ok(Math.abs(polyArea([rings])+surfaces.filter(s=>s!==paving).reduce((s,p)=>s+area(ring(p.outer)),0)-area(R.terrace))<1e-6);
});
test('shallow polygonal roof triangles point up and side walls face outwards',()=>{
  const p=blueskyRoofPavilion(),normal=(a,b,c)=>{const u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};return{x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x}};
  assert.equal(p.top.length,R.pavilion.length*3);assert.equal(p.walls.length,R.pavilion.length*6);
  for(let i=0;i<p.top.length;i+=3)assert.ok(normal(...p.top.slice(i,i+3)).y>1);
  for(let i=0;i<p.walls.length;i+=3){const tri=p.walls.slice(i,i+3),n=normal(...tri),cx=tri.reduce((s,p)=>s+p.x,0)/3,cz=tri.reduce((s,p)=>s+p.z,0)/3;assert.ok(n.x*(cx-p.center.x)+n.z*(cz-p.center.z)>1);}
});
test('all roof details stay above the retained podium and below the gate lettering',()=>{
  const p=blueskyRoofPavilion();for(const v of [...p.top,...p.walls]){assert.ok(Object.values(v).every(Number.isFinite));assert.ok(v.y>=R.bodyTop&&v.y<=R.pavilionTop);}
  for(const s of blueskyRoofSurfaces())assert.ok(s.y>R.bodyTop&&s.y<R.pavilionRim);
  assert.equal(R.bodyTop,25.22);assert.ok(R.pavilionTop+.15<27);assert.equal(createHash('sha256').update(JSON.stringify(GEO.roads)).digest('hex'),'6340f84446791cc0646838b9c3e81c6d067888d8bc71fe7a3a26ba39a2f730da');
});
test('projected roof metadata preserves unknown dates and avoids ground courtyard or pool claims',()=>{
  const bytes=readFileSync(new URL('../tools/data/shuyang/bluesky-roof-traces.json',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),R.traceSha256);assert.equal(R.imagery.imageAcquired,null);assert.equal(R.photographs.captureDate,null);
  assert.match(R.limits,/not cut into a ground courtyard/);assert.match(R.limits,/not asserted to be a pool/);assert.match(R.limits,/all elevations are unmeasured/);
});
test('historical street reference binds an existing People Middle Road way without changing its section',()=>{
  const r=RENMIN_JUNCTION_REFERENCE;assert.equal(r.publicationDate,'2022-02-15');assert.equal(r.captureDate,null);assert.equal(r.status,'historical-junction-reference');
  for(const id of r.sourceWayIds){const i=GEO.roadSourceIds.indexOf(id);assert.ok(i>=0);assert.equal(GEO.roads[i][0],'人民中路');assert.equal(GEO.roads[i][2],20);assert.equal(GEO.roads[i][3],6);}
  assert.match(r.scope,/Intersection context only/);assert.equal(r.photos.length,2);
});
