import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {GEO} from '../js/shuyang-geodata.js';
import {ROADS} from '../js/city-config.js';
import {CityMapSystem} from '../js/city-map.js';
import {BUILDING_PHOTO_REFERENCES,reviewedSourceBindings,applyPhotoBuildingEstimate,buildingObservationPoint} from '../js/building-photo-references.js';

const review=BUILDING_PHOTO_REFERENCES.find(r=>r.id==='tcmHospital');
const records=JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz',import.meta.url)))).buildings;
const {loadModule}=createRequire(import.meta.url)('./helpers/module.cjs');
const inside=(x,z,p)=>{
  let hit=false;
  for(let i=0,j=p.length-2;i<p.length;j=i,i+=2){
    if((p[i+1]>z)!==(p[j+1]>z)&&x<(p[j]-p[i])*(z-p[i+1])/(p[j+1]-p[i+1])+p[i])hit=!hit;
  }
  return hit;
};
const distance=(p,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
};
function setup(){
  const boxes=[],groups=[],signs=[],cylinders=[];
  class Vec{constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){Object.assign(this,{x,y,z});return this;}length(){return Math.hypot(this.x,this.y,this.z);}normalize(){const n=this.length();this.x/=n;this.y/=n;this.z/=n;return this;}}
  class Group{constructor(){this.position=new Vec();this.userData={};this.children=[];}add(o){this.children.push(o);}}
  class Mesh{constructor(geometry,material){Object.assign(this,{geometry,material,position:new Vec(),quaternion:{setFromUnitVectors(){}}});}}
  class Geometry{setAttribute(name,a){(this.attributes||={})[name]=a;return this;}setIndex(i){this.index=i;}computeVertexNormals(){}}
  const THREE={Group,Mesh,Vector3:Vec,DoubleSide:2,MeshStandardNodeMaterial:class{constructor(o){Object.assign(this,o);}},
    BufferGeometry:Geometry,Float32BufferAttribute:class{constructor(array,itemSize){Object.assign(this,{array,itemSize});}},CylinderGeometry:class{}};
  const {buildHospitalPrecinct}=loadModule(readFileSync(new URL('../js/hospital-precinct.js',import.meta.url),'utf8'),{
    imports:{'three/webgpu':THREE,'./shuyang-geodata.js':{GEO},'./building-photo-references.js':{BUILDING_PHOTO_REFERENCES}}});
  const sourceEdges=c=>{
    const p=c.b.o,n=p.length/2;let area=0;
    for(let i=0;i<n;i++){const j=(i+1)%n;area+=p[2*i]*p[2*j+1]-p[2*j]*p[2*i+1];}
    return Array.from({length:n},(_,i)=>{
      const j=(i+1)%n,dx=p[2*j]-p[2*i],dz=p[2*j+1]-p[2*i+1],L=Math.hypot(dx,dz),s=Math.sign(area);
      return {x:(p[2*j]+p[2*i])/2-c.s.x,z:(p[2*j+1]+p[2*i+1])/2-c.s.z,L,
        nx:s*dz/L,nz:-s*dx/L,tx:dx/L,tz:dz/L,ry:-Math.atan2(dz,dx),facing:Math.atan2(s*dz,-s*dx)};
    });
  };
  buildHospitalPrecinct({root:{add(g){groups.push(g);}},M:new Proxy({},{get:()=>({})}),box(...a){boxes.push(a);},cyl(...a){cylinders.push(a);},
    sign(...a){signs.push(a);},sourceEdges,edgePanel(c,e,mat,y,h,w=e.L,v=.4){boxes.push([c,mat,e.x+e.nx*v,y,e.z+e.nz*v,w,h,.2,{ry:e.ry,collide:false}]);}});
  return {boxes,groups,signs,cylinders};
}
function corners([c,,x,,z,w,,d,opts]){
  const cs=Math.cos(opts.ry),sn=Math.sin(opts.ry);
  return [[-w/2,-d/2],[-w/2,d/2],[w/2,-d/2],[w/2,d/2]].map(([u,v])=>({x:c.s.x+x+u*cs+v*sn,z:c.s.z+z-u*sn+v*cs}));
}

test('the hospital binds four exact sources and leaves the northern Zhongyi tower distinct',()=>{
  const bindings=reviewedSourceBindings().filter(r=>r.reviewId===review.id);
  assert.equal(bindings.length,4);
  for(const r of bindings){assert.equal(records[r.sourceBuildingIndex].id,r.sourceId);assert.equal(GEO.mapBuildings[r.sourceBuildingIndex].id,r.sourceId);}
  assert.ok(!bindings.some(r=>r.sourceId==='way/1086134484'));
  assert.equal(GEO.mapBuildings[3555].n,'中医大厦');
  const {groups}=setup();assert.equal(groups.length,4);
  assert.equal(groups[0].userData.photoReview.originalHeight,25.9);
  assert.equal(groups[0].userData.photoReview.displayHeight,68.4);
  assert.ok(groups.every(g=>!g.userData.sourceBody&&!g.userData.replacesSource));
});

test('photo height estimates are separate from immutable CNBH records and preserve low wings',()=>{
  const bindings=reviewedSourceBindings().filter(r=>r.reviewId===review.id);
  for(const r of bindings){
    const original=records[r.sourceBuildingIndex],before=JSON.stringify(original),b=applyPhotoBuildingEstimate(original,r);
    assert.equal(JSON.stringify(original),before);assert.equal(b.sourceRecord,original);assert.equal(b.category,'civic');
    assert.equal(b.height,r.displayHeight||original.height);assert.equal(b.originalSourceHeight,original.height);
    if(r.displayHeight)assert.equal(b.levels,19);
  }
  assert.equal(applyPhotoBuildingEstimate(records[3555]),records[3555]);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../js/building-geodata.bin.gz',import.meta.url))).digest('hex'),'046c22fdec5cbfd2156a842b57643789abbc9f6248ac54b705b479e6c4a875a6');
});

test('the curved crown stays on the source roof and podium equipment stays off the courtyard',()=>{
  const {groups,boxes}=setup(),tower=groups[0];
  const roof=tower.children.find(c=>c.geometry?.attributes?.position),p=GEO.mapBuildings[3558].o;
  assert.ok(roof);const a=roof.geometry.attributes.position.array;
  for(let i=0;i<a.length;i+=3){assert.ok(a.slice(i,i+3).every(Number.isFinite));assert.ok(a[i+1]>=68.4&&a[i+1]<=71.001);assert.ok(inside(a[i]+tower.position.x,a[i+2]+tower.position.z,p));}
  const equipment=boxes.filter(b=>b[0].record.role==='west-podium'&&b[3]>26.9);
  assert.equal(equipment.length,8);
  for(const b of equipment)for(const p of corners(b))assert.ok(inside(p.x,p.z,b[0].b.o),'roof equipment has source support');
});

test('frontage fittings and forecourt keep every corner clear of Shanghai Middle Road',()=>{
  const {boxes,cylinders}=setup(),roads=ROADS.filter(r=>r.name==='上海中路');
  assert.ok(roads.length);assert.ok(boxes.length>250);
  for(const b of boxes){
    assert.ok(b.slice(2,8).every(Number.isFinite));assert.equal(b[8].collide,false);
    for(const p of corners(b))for(const r of roads)for(let i=1;i<r.pts.length;i++)assert.ok(distance(p,r.pts[i-1],r.pts[i])>=r.w/2+.25,'fitting crosses carriageway');
  }
  assert.equal(cylinders.length,8);
  for(const [c,,x,,z] of cylinders){
    assert.ok(c.s.z+z>220,'photographed shelter stays south of the entry, not mirrored north');
    for(const r of roads)for(let i=1;i<r.pts.length;i++)assert.ok(distance({x:c.s.x+x,z:c.s.z+z},r.pts[i-1],r.pts[i])>=r.w/2+.35);
  }
});

test('historical ratings are omitted, while the gallery, alias and road observation remain usable',()=>{
  const {signs}=setup();assert.equal(signs.length,3);assert.ok(signs.every(s=>s[1]==='沭阳县中医院'));
  assert.equal(review.captureDate,null);assert.match(review.note,/展示估计/);assert.match(review.note,/未写成实测/);
  const a=CityMapSystem.prototype.findPlace.call({},review.name),b=CityMapSystem.prototype.findPlace.call({},'沭阳中医院');
  assert.ok(a&&b);assert.equal(a.x,b.x);assert.equal(a.z,b.z);assert.equal(a.h,71);
  const south=CityMapSystem.prototype.findPlace.call({},'南关院区');assert.ok(south&&south.x<-200&&south.z>800);
  const p=buildingObservationPoint(review,ROADS);assert.ok(p&&p.z>=162&&p.z<=280);assert.ok(Math.sin(p.heading)>.9);
  const roads=ROADS.filter(r=>r.name==='上海中路');assert.ok(Math.min(...roads.flatMap(r=>r.pts.slice(1).map((q,i)=>distance(p,r.pts[i],q))))<.001);
});
