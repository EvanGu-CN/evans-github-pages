import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import clipping from '../js/vendor/polygon-clipping.js';
import {GEO} from '../js/shuyang-geodata.js';
import {polygonContains} from '../js/building-collision.js';
import {TELEPORT_LOCATIONS,LANDMARK_SITES,isWater,blockAt} from '../js/city-config.js';
import {ART_GALLERY,ART_GALLERY_PARTS,ART_GALLERY_LINKS,galleryWorld,galleryRedPoint,galleryRedWorld,
  galleryShaftRing,galleryDisplayFootprints,galleryPondPolygons,galleryPavingPolygons} from '../js/art-gallery-layout.js';
const ring=p=>p.map(q=>[q.x,q.z]);
const shape=p=>[ring(p.outer),...(p.holes||[]).map(ring)];
const areaRing=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
const area=multi=>multi.reduce((s,p)=>s+areaRing(p[0])-p.slice(1).reduce((s,r)=>s+areaRing(r),0),0);
const parcel=GEO.mapBuildings.find(b=>b.id===ART_GALLERY.sourceId);
const parcelShape=[Array.from({length:parcel.o.length/2},(_,i)=>parcel.o.slice(i*2,i*2+2))];

test('art site plan fits the bound source parcel corners without mutating its survey records',()=>{
  assert.equal(GEO.mapBuildings[ART_GALLERY.sourceBuildingIndex],parcel);
  for(const [px,py,i] of [[233,360,4],[714,360,2],[714,1062,0],[233,1062,6]])assert.deepEqual(galleryWorld([px,py]),{x:parcel.o[i],z:parcel.o[i+1]});
  assert.equal(parcel.h,12.9);assert.equal(GEO.mapBuildings.length,7744);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../js/building-geodata.bin.gz',import.meta.url))).digest('hex'),'046c22fdec5cbfd2156a842b57643789abbc9f6248ac54b705b479e6c4a875a6');
});
test('individual halls and glazed links remain in their source parcel and outside neighbouring museums',()=>{
  const items=galleryDisplayFootprints();assert.equal(items.length,17);assert.equal(ART_GALLERY_PARTS.filter(p=>!p.base).length+1,9);assert.equal(ART_GALLERY_LINKS.length,8);
  for(const p of items){
    assert.ok(area(clipping.difference(shape(p),parcelShape))<1e-7,p.id+' escaped project parcel');
    for(const id of ['way/1321791112','way/1321791114']){
      const b=GEO.mapBuildings.find(b=>b.id===id),q=[Array.from({length:b.o.length/2},(_,i)=>b.o.slice(i*2,i*2+2))];
      assert.ok(area(clipping.intersection(shape(p),q))<1e-7,p.id+' overlaps neighbouring hall');
    }
  }
});
test('hall courts stay open while the office upper storey remains within its lower floor',()=>{
  const items=galleryDisplayFootprints();
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)assert.ok(area(clipping.intersection(shape(items[i]),shape(items[j])))<1e-7,items[i].id+' overlaps '+items[j].id);
  for(const point of [[445,800],[410,850]]){const p=galleryWorld(point);assert.ok(items.every(q=>!polygonContains(q,p.x,p.z)));}
  const upper=ART_GALLERY_PARTS.find(p=>p.base),lower=ART_GALLERY_PARTS.find(p=>p.id==='office');
  assert.ok(area(clipping.difference([upper.plan],[lower.plan]))<1e-7);assert.equal(upper.base,lower.height);
});
test('sculpted red facade retains its lower corners and recesses its upper north and east edges',()=>{
  assert.deepEqual(galleryRedPoint(33.5,17,.3),{u:33.5,v:17,y:.3});
  assert.equal(galleryRedPoint(33.5,17,26.8).u,30.5);
  assert.equal(galleryRedPoint(16.75,0,26.8).v,3);
  for(let y=.3;y<=26.8;y+=.5)for(let t=0;t<=1;t+=.05){const p=galleryRedWorld(33.5,34*t,y);assert.ok(Number.isFinite(p.x+p.y+p.z));}
});
test('tapered lightwell stays inside the sculpted shell at every collision layer',()=>{
  let last=0;
  for(let y=.3;y<=26.8;y+=.5){
    const outer=[galleryRedWorld(0,0,y),galleryRedWorld(33.5,0,y),galleryRedWorld(33.5,34,y),galleryRedWorld(0,34,y)],shaft=galleryShaftRing(y);
    for(const p of shaft)assert.ok(polygonContains({outer,holes:[]},p.x,p.z));
    const a=areaRing(ring(shaft));assert.ok(a>last);last=a;
    const center=galleryWorld([394,497]);assert.equal(polygonContains({outer,holes:[shaft]},center.x,center.z),false);
  }
});
test('entrance water is clipped away from every hall and glass link',()=>{
  const ponds=galleryPondPolygons();assert.equal(ponds.length,2);assert.ok(area(ponds.map(shape))>200);
  for(const p of ponds){assert.ok(area(clipping.difference(shape(p),parcelShape))<1e-7);
    for(const hall of galleryDisplayFootprints())assert.ok(area(clipping.intersection(shape(p),shape(hall)))<1e-7);}
});
test('illustrative wavy paving stays in its parcel and outside halls and water',()=>{
  const {base,bands}=galleryPavingPolygons();assert.ok(base.length&&bands.length>5);
  const obstacles=[...galleryDisplayFootprints(),...galleryPondPolygons()];
  for(const p of [...base,...bands]){
    assert.ok(area(clipping.difference(shape(p),parcelShape))<1e-7);
    for(const obstacle of obstacles)assert.ok(area(clipping.intersection(shape(p),shape(obstacle)))<1e-7);
  }
  assert.ok(area(base.map(shape))>area(bands.map(shape))*2);
});
test('reference metadata identifies historical architect evidence and estimated geometry',()=>{
  assert.equal(ART_GALLERY.captureDate,null);assert.match(ART_GALLERY.basis,/2020-07-07/);
  assert.match(ART_GALLERY.limits,/estimates/);assert.match(ART_GALLERY.sourcePage,/gooood.cn/);
});
test('culture arrival uses a dry road northeast of the gallery instead of looking through the library',()=>{
  const p=TELEPORT_LOCATIONS.culture,s=LANDMARK_SITES['沭阳文化中心'],a=s.viewTarget;
  assert.equal(isWater(p.x,p.z),false);assert.equal(blockAt(p.x,p.z),null);
  assert.ok(p.x>a.x&&p.z<a.z);assert.ok(Math.hypot(p.x-a.x,p.z-a.z)<150);
  assert.ok(Math.abs(Math.sin(p.heading)-(a.x-p.x)/Math.hypot(a.x-p.x,a.z-p.z))<1e-9);
});
