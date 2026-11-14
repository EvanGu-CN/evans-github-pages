import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GEO} from '../js/shuyang-geodata.js';
import clipping from '../js/vendor/polygon-clipping.js';
import {CULTURAL_HALLS,CULTURAL_IMAGERY,hallPoint,hallEdge,hallFacePoint,hallSiteSurfaces} from '../js/cultural-hall-layout.js';
import {galleryDisplayFootprints} from '../js/art-gallery-layout.js';
import {STREET_MASK} from '../js/cultural-street-layout.js';
const ring=p=>p.map(q=>[q.x,q.z]);
const poly=p=>[ring(p.outer),...(p.holes||[]).map(ring)];
const areaRing=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
const area=m=>m.reduce((s,p)=>s+areaRing(p[0])-p.slice(1).reduce((s,r)=>s+areaRing(r),0),0);
const parcel=h=>{const b=GEO.mapBuildings.find(b=>b.id===h.sourceId);return[Array.from({length:b.o.length/2},(_,i)=>b.o.slice(i*2,i*2+2))];};

test('both cultural hall reconstructions retain their source records and source heights separately',()=>{
  assert.equal(CULTURAL_HALLS.length,2);
  for(const h of CULTURAL_HALLS){const b=GEO.mapBuildings[h.sourceBuildingIndex];assert.equal(b.id,h.sourceId);assert.equal(b.h,h.sourceHeight);}
  assert.equal(GEO.mapBuildings.length,7745);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../js/building-geodata.bin.gz',import.meta.url))).digest('hex'),'211ef701274c3124809f5fe0390b2fc949ce47c968b967b0d2c03d98fb79615f');
});
test('traced hall bodies leave their forecourts open instead of filling the whole source parcels',()=>{
  for(const h of CULTURAL_HALLS){
    assert.ok(area(clipping.difference(poly(h),parcel(h)))<1e-7,h.id);
    const ratio=area([poly(h)])/area([parcel(h)]);assert.ok(ratio>.25&&ratio<.5,h.id+' should occupy a plausible subset of its project parcel');
    assert.deepEqual(hallPoint(h,0,0),h.outer[0]);assert.deepEqual(hallPoint(h,1,1),h.outer[2]);
  }
});
test('neighbouring museums and all 17 art-gallery display pieces remain disjoint',()=>{
  const [a,b]=CULTURAL_HALLS;assert.ok(area(clipping.intersection(poly(a),poly(b)))<1e-7);
  for(const h of CULTURAL_HALLS)for(const p of galleryDisplayFootprints())assert.ok(area(clipping.intersection(poly(h),poly(p)))<1e-7);
});
test('facade coordinates follow the inferred west library front and south museum entrance',()=>{
  for(const h of CULTURAL_HALLS){const e=hallEdge(h,h.front),p=hallFacePoint(h,h.front,.5),q=hallFacePoint(h,h.front,.5,2);
    assert.ok(Math.abs(Math.hypot(e.nx,e.nz)-1)<1e-9);assert.ok(Math.abs(Math.hypot(p.x-q.x,p.z-q.z)-2)<1e-9);
    const center=hallPoint(h,.5,.5);assert.ok((p.x-center.x)*e.nx+(p.z-center.z)*e.nz>0);
    if(h.id==='library')assert.ok(e.nx<-.95);else assert.ok(e.nz>.95);
  }
});
test('the raised library skylight is inside its roof and leaves a real surrounding roof band',()=>{
  const h=CULTURAL_HALLS.find(h=>h.id==='library');assert.ok(area(clipping.difference([ring(h.skylight)],poly(h)))<1e-7);
  const a=area([[ring(h.skylight)]]),total=area([poly(h)]);assert.ok(a>800&&a<total*.4);assert.ok(h.displayMaxHeight>h.height);
  // A skylight is not a ground courtyard: the displayed ground footprint has no holes.
  assert.equal(h.holes,undefined);
});
test('museum fold profiles close at the eaves and its blue dome stays inside the source project',()=>{
  const h=CULTURAL_HALLS.find(h=>h.id==='museum');assert.equal(h.roofProfile[0][0],0);assert.equal(h.roofProfile.at(-1)[0],1);
  assert.equal(h.roofProfile[0][1],h.height);assert.equal(h.roofProfile.at(-1)[1],h.height);
  assert.equal(Math.max(...h.roofProfile.map(p=>p[1])),h.displayMaxHeight);
  const d=h.dome,ring=Array.from({length:64},(_,i)=>[d.x+d.radius*Math.cos(i/64*Math.PI*2),d.z+d.radius*Math.sin(i/64*Math.PI*2)]);
  assert.ok(area(clipping.difference([ring],parcel(h)))<1e-7);assert.ok(d.base+d.radius<=h.displayMaxHeight+1e-9);
});
test('green beds and paving partition the free project ground without covering either hall',()=>{
  for(const h of CULTURAL_HALLS){const {greens,paving}=hallSiteSurfaces(h);assert.equal(greens.length,2);assert.ok(paving.length);
    const ps=[...greens,...paving];
    for(let i=0;i<ps.length;i++){assert.ok(area(clipping.difference(poly(ps[i]),parcel(h)))<1e-7);assert.ok(area(clipping.intersection(poly(ps[i]),poly(h)))<1e-7);
      for(let j=i+1;j<ps.length;j++)assert.ok(area(clipping.intersection(poly(ps[i]),poly(ps[j])))<1e-7);}
    const expected=area(clipping.difference(parcel(h),poly(h),STREET_MASK)),actual=area(ps.map(poly));assert.ok(Math.abs(expected-actual)<1e-6);
  }
});
test('imagery and built-photo dates stay distinct from inferred dimensions and acquisition dates',()=>{
  assert.equal(CULTURAL_IMAGERY.imageAcquired,null);assert.equal(CULTURAL_IMAGERY.zoom,18);
  for(const h of CULTURAL_HALLS){assert.equal(h.captureDate,null);assert.match(h.limits,/estimates/);assert.ok(h.photoPage.startsWith('https://'));assert.ok(h.publicationDate);}
});
test('the complete source inventory records all three cultural models with evidence limitations',()=>{
  const inventory=JSON.parse(readFileSync(new URL('../docs/refinement/coverage.json',import.meta.url)));
  for(const i of [621,622,623]){const r=inventory.buildings[i];assert.match(r.status,/^photo-/);assert.ok(r.geometryEvidence.limits.length);assert.equal(r.geometryEvidence.captureDate,null);assert.ok(r.review);assert.equal(r.id,GEO.mapBuildings[i].id);}
  assert.equal(inventory.buildings[621].geometryEvidence.sourceHeight,11.7);assert.equal(inventory.buildings[623].geometryEvidence.sourceHeight,15);
  assert.equal(inventory.buildings.length,7742);assert.ok(inventory.buildings.every(b=>b.status!=='complete'));
});
