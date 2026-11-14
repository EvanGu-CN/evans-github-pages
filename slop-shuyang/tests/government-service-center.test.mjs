import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {GEO} from '../js/shuyang-geodata.js';
import {ROADS} from '../js/city-config.js';
import {BUILDING_PHOTO_REFERENCES,buildingObservationPoint,applyPhotoBuildingEstimate} from '../js/building-photo-references.js';
import clipping from '../js/vendor/polygon-clipping.js';
const r=BUILDING_PHOTO_REFERENCES.find(r=>r.id==='governmentService'),b=GEO.mapBuildings.find(b=>b.id===r.sourceId);
const {loadModule}=createRequire(import.meta.url)('./helpers/module.cjs');
function setup(){
  const boxes=[],signs=[],groups=[];
  class Group{constructor(){this.position={set(x,y,z){Object.assign(this,{x,y,z});}};this.userData={};this.children=[];}add(m){this.children.push(m);}}
  class Geometry{constructor(){this.attributes={};}setAttribute(n,a){this.attributes[n]=a;}computeBoundingSphere(){}}
  const THREE={Group,BufferGeometry:Geometry,Float32BufferAttribute:class{constructor(array,itemSize){Object.assign(this,{array,itemSize});}},Mesh:class{constructor(geometry,material){Object.assign(this,{geometry,material});}},MeshStandardNodeMaterial:class{constructor(o){Object.assign(this,o);}}};
  const {buildGovernmentServiceCenter,SERVICE_CENTER_FORECOURT}=loadModule(readFileSync(new URL('../js/government-service-center.js',import.meta.url),'utf8'),{
    imports:{'three/webgpu':THREE,'./shuyang-geodata.js':{GEO},'./building-photo-references.js':{BUILDING_PHOTO_REFERENCES}}});
  buildGovernmentServiceCenter({root:{add(g){groups.push(g);}},M:{darkStone:{}},box(...a){boxes.push(a);},sign(...a){signs.push(a);},
    sourceEdges(c){
      let area=0;const p=b.o,n=p.length/2;
      for(let i=0;i<n;i++){const j=(i+1)%n;area+=p[i*2]*p[j*2+1]-p[j*2]*p[i*2+1];}
      return Array.from({length:n},(_,i)=>{const j=(i+1)%n,dx=p[j*2]-p[i*2],dz=p[j*2+1]-p[i*2+1],L=Math.hypot(dx,dz),nx=Math.sign(area)*dz/L,nz=-Math.sign(area)*dx/L;
        return{x:(p[i*2]+p[j*2])/2-c.s.x,z:(p[i*2+1]+p[j*2+1])/2-c.s.z,tx:dx/L,tz:dz/L,nx,nz,L,ry:-Math.atan2(dz,dx),facing:Math.atan2(nx,nz)};});
    }});
  return{boxes,signs,groups,plots:SERVICE_CENTER_FORECOURT};
}
const distance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);};
test('the named service centre retains its exact source and CNBH height separately from photo panel divisions',()=>{
  const records=JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz',import.meta.url)))).buildings;
  assert.equal(records[r.sourceBuildingIndex].id,r.sourceId);assert.equal(b.n,r.name);assert.equal(b.h,25.7);
  assert.equal(applyPhotoBuildingEstimate(records[r.sourceBuildingIndex],r),records[r.sourceBuildingIndex]);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../js/building-geodata.bin.gz',import.meta.url))).digest('hex'),'046c22fdec5cbfd2156a842b57643789abbc9f6248ac54b705b479e6c4a875a6');
  const {groups}=setup();assert.equal(groups.length,1);assert.equal(groups[0].userData.photoReview.retainedHeight,25.7);
  assert.ok(!groups[0].userData.replacesSource);assert.deepEqual(Array.from(r.modeledFaces),['south']);
});
test('all facade additions fit the retained vertical extent and stay clear of both named roads',()=>{
  const {boxes,signs}=setup();assert.ok(boxes.length>75);
  for(const [c,,x,y,z,w,h,d,o] of boxes){
    assert.ok([x,y,z,w,h,d,o.ry].every(Number.isFinite));assert.equal(o.collide,false);
    assert.ok(y>=.2&&y+h<=b.h+.001);
    const cs=Math.cos(o.ry),sn=Math.sin(o.ry);
    for(const [u,v] of [[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]]){
      const p={x:c.s.x+x+cs*u+sn*v,z:c.s.z+z-sn*u+cs*v};
      for(const road of ROADS.filter(r=>['苏州东路','永康路'].includes(r.name)))for(let i=1;i<road.pts.length;i++)assert.ok(distance(p,road.pts[i-1],road.pts[i])>road.w/2+1,'fitting intrudes into mapped road');
    }
  }
  assert.equal(signs.length,1);const s=signs[0];assert.equal(s[1],r.name);assert.ok(s[3]-s[6]/2>=.2&&s[3]+s[6]/2<=b.h);assert.equal(s.at(-1).vertical,true);
});
test('the road observation point is on Suzhou East Road and looks north toward the building',()=>{
  const p=buildingObservationPoint(r,ROADS),roads=ROADS.filter(r=>r.name==='苏州东路');assert.ok(p);
  assert.ok(Math.min(...roads.flatMap(road=>road.pts.slice(1).map((q,i)=>distance(p,road.pts[i],q))))<.001);
  assert.ok(Math.cos(p.heading)<-.5);assert.equal(buildingObservationPoint(r,[]),null);
});
test('reference images keep the 2022 date caveat and do not turn an unlocated self-service door into an entrance',()=>{
  assert.equal(r.captureDate,null);assert.equal(r.photos.length,2);assert.match(r.note,/2022-01-04/);assert.match(r.note,/自助入口尚未定位/);
  assert.ok(r.photos.every(p=>p.page==='https://www.suxinwen.cn/wap/news/2164315'));assert.match(r.accessLabel,/观察点/);
  const {groups}=setup();assert.ok(groups[0].userData.photoReview.counts.fins>=6);
});
test('satellite-traced forecourt gardens preserve all source buildings and the entrance paving gap',()=>{
  const {plots,groups}=setup();assert.equal(plots.length,2);
  const poly=b=>[Array.from({length:b.o.length/2},(_,i)=>b.o.slice(i*2,i*2+2)),...(b.holes||[]).map(h=>Array.from({length:h.length/2},(_,i)=>h.slice(i*2,i*2+2)))];
  for(const p of plots){
    assert.ok(p.every(q=>q.every(Number.isFinite)));
    for(const building of GEO.mapBuildings)assert.equal(clipping.intersection([p],poly(building)).length,0,'garden overlaps source building '+building.id);
    for(const q of p)for(const road of ROADS.filter(r=>['苏州东路','永康路'].includes(r.name)))for(let i=1;i<road.pts.length;i++)assert.ok(distance({x:q[0],z:q[1]},road.pts[i-1],road.pts[i])>road.w/2+1);
  }
  assert.equal(clipping.intersection([plots[0]],[plots[1]]).length,0);
  const a=groups[0].children.find(m=>m.name==='政务中心·前场绿地').geometry.attributes.position.array;
  for(let i=0;i<a.length;i+=9){assert.equal(a[i+1],.245);assert.ok((a[i+5]-a[i+2])*(a[i+6]-a[i])-(a[i+3]-a[i])*(a[i+8]-a[i+2])>0,'upward triangles');}
});
