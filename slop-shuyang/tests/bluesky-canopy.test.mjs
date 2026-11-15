import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import clipping from '../js/vendor/polygon-clipping.js';
import {GEO} from '../js/shuyang-geodata.js';
import {BLUESKY_CANOPY as C,blueskyFront,blueskyCanopyPlan,blueskyWorld,blueskyPosts} from '../js/bluesky-canopy-layout.js';
import {polygonContains} from '../js/building-collision.js';
const ar=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
const area=m=>m.reduce((s,p)=>s+ar(p[0])-p.slice(1).reduce((s,r)=>s+ar(r),0),0);
test('Bluesky canopy preserves its source geometry and separates display estimates from source height',()=>{
  const records=JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz',import.meta.url)))).buildings;
  assert.equal(records[C.sourceIndex].id,C.sourceId);assert.equal(records[C.sourceIndex].height,C.sourceHeight);assert.equal(C.sourceHeight,19.3);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../js/building-geodata.bin.gz',import.meta.url))).digest('hex'),'211ef701274c3124809f5fe0390b2fc949ce47c968b967b0d2c03d98fb79615f');
  assert.equal(createHash('sha256').update(JSON.stringify(GEO.roads)).digest('hex'),'6340f84446791cc0646838b9c3e81c6d067888d8bc71fe7a3a26ba39a2f730da');
});
test('one circular oculus and rectangular sky slots are disjoint holes inside a single roof plate',()=>{
  const p=blueskyCanopyPlan();assert.equal(p.holes.length,9);assert.equal(p.holes[0].length,64);
  for(const h of p.holes)assert.ok(area(clipping.difference([h],[p.outer]))<1e-8);
  for(let i=0;i<p.holes.length;i++)for(let j=i+1;j<p.holes.length;j++)assert.ok(area(clipping.intersection([p.holes[i]],[p.holes[j]]))<1e-8);
  const solid=clipping.difference([p.outer],...p.holes.map(h=>[h]));assert.ok(Math.abs(area(solid)-(ar(p.outer)-p.holes.reduce((s,h)=>s+ar(h),0)))<1e-7);
  assert.ok(p.holes.reduce((s,h)=>s+ar(h),0)>460);
});
test('the rotated canopy and collision polygon keep the real openings open',()=>{
  const p=blueskyCanopyPlan(),e=blueskyFront();assert.ok(e.nz>.9);assert.ok(Math.abs(e.tx*e.nz-e.tz*e.nx-1)<1e-9);
  const ring=r=>r.map(([u,v])=>{const p=blueskyWorld(u,v);return{x:p.x,z:p.z}}),poly={outer:ring(p.outer),holes:p.holes.map(ring)};
  for(const h of p.holes){const u=h.reduce((s,p)=>s+p[0],0)/h.length,v=h.reduce((s,p)=>s+p[1],0)/h.length,w=blueskyWorld(u,v);assert.equal(polygonContains(poly,w.x,w.z),false);}
  const q=blueskyWorld(0,7);assert.equal(polygonContains(poly,q.x,q.z),true);assert.equal(q.y,C.base);
  assert.ok(C.base+C.thickness<C.displayMaxHeight);assert.ok(Math.abs(area([[p.outer,...p.holes]])-area([[poly.outer.map(p=>[p.x,p.z]),...poly.holes.map(r=>r.map(p=>[p.x,p.z]))]]))<1e-6);
});
test('slender post centres avoid roof holes and existing motor carriageways',()=>{
  const e=blueskyFront(),p=blueskyCanopyPlan();assert.equal(blueskyPosts().length,8);
  for(const q of blueskyPosts()){
    const u=(q.x-e.x)*e.tx+(q.z-e.z)*e.tz,v=(q.x-e.x)*e.nx+(q.z-e.z)*e.nz-C.offset;
    assert.ok(Math.abs(u)<C.halfWidth&&Math.abs(v)<C.halfDepth);assert.ok(Math.hypot(u,v)>C.radius+.45);
    for(const r of GEO.roads){if(r[5])continue;const ps=r[6];for(let i=2;i<ps.length;i+=2){const ax=ps[i-2],az=ps[i-1],dx=ps[i]-ax,dz=ps[i+1]-az,t=Math.max(0,Math.min(1,((q.x-ax)*dx+(q.z-az)*dz)/(dx*dx+dz*dz||1)));assert.ok(Math.hypot(q.x-ax-t*dx,q.z-az-t*dz)>r[2]/2+.45,r[0]);}}
  }
});
test('photographic limits do not promote the estimated gate to a surveyed market building',()=>{
  assert.equal(C.captureDate,null);assert.match(C.limits,/slot count\/spacing/);assert.match(C.limits,/not a reconstructed whole-market roofprint/);assert.match(C.limits,/display estimates/);assert.match(C.limits,/No newly bound 28-storey tower/);
});
