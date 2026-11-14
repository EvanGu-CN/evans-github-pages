import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {GEO} from '../js/shuyang-geodata.js';
import {ROADS} from '../js/city-config.js';
import {CityMapSystem} from '../js/city-map.js';
import {BUILDING_PHOTO_REFERENCES,buildingObservationPoint} from '../js/building-photo-references.js';

const {loadModule}=createRequire(import.meta.url)('./helpers/module.cjs');
const review=BUILDING_PHOTO_REFERENCES[0];
const source=GEO.mapBuildings.find(b=>b.id===review.sourceId);
function setup(){
  const boxes=[],groups=[],panels=[],signs=[];
  class Vec{set(x,y,z){Object.assign(this,{x,y,z});return this;}}
  class Group{constructor(){this.position=new Vec();this.userData={};this.children=[];}add(o){this.children.push(o);}}
  class Mesh{constructor(){this.position=new Vec();this.rotation={};}}
  const THREE={Group,Mesh,MeshStandardNodeMaterial:class{},TorusGeometry:class{},SphereGeometry:class{}};
  const {buildCoreCommercialFrontages}=loadModule(readFileSync(new URL('../js/core-commercial-frontages.js',import.meta.url),'utf8'),{
    imports:{'three/webgpu':THREE,'./shuyang-geodata.js':{GEO},'./building-photo-references.js':{BUILDING_PHOTO_REFERENCES}}});
  const sourceEdges=c=>{
    const p=source.o,n=p.length/2;let area=0;
    for(let i=0;i<n;i++){const j=(i+1)%n;area+=p[2*i]*p[2*j+1]-p[2*j]*p[2*i+1];}
    return Array.from({length:n},(_,i)=>{
      const j=(i+1)%n,dx=p[2*j]-p[2*i],dz=p[2*j+1]-p[2*i+1],L=Math.hypot(dx,dz);
      return {x:(p[2*j]+p[2*i])/2-c.s.x,z:(p[2*j+1]+p[2*i+1])/2-c.s.z,L,
        nx:Math.sign(area)*dz/L,nz:-Math.sign(area)*dx/L,tx:dx/L,tz:dz/L,ry:-Math.atan2(dz,dx),facing:Math.atan2(Math.sign(area)*dz,-Math.sign(area)*dx)};
    });
  };
  buildCoreCommercialFrontages({root:{add(g){groups.push(g);}},M:new Proxy({},{get:()=>({})}),
    box(...args){boxes.push(args);},cyl(){},sign(...args){signs.push(args);},sourceEdges,
    edgePanel(c,e,mat,y,h,w=e.L,v=.4){panels.push(e);boxes.push([c,mat,e.x+e.nx*v,y,e.z+e.nz*v,w,h,.5,{ry:e.ry,collide:false}]);}});
  return {boxes,groups,panels,signs};
}
const distance=(p,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
};

test('the photographed shopping square binds its exact source, not a Vienna hotel',()=>{
  const records=JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz',import.meta.url)))).buildings;
  assert.equal(records[review.sourceBuildingIndex].id,review.sourceId);
  assert.match(review.name,/商业广场/);assert.doesNotMatch(review.name,/酒店/);
  assert.equal(review.captureDate,null);assert.match(review.note,/其他三面|朝向.*推定/);
  const {groups}=setup();
  assert.equal(groups.length,1);
  assert.equal(groups[0].userData.photoReview.retainedHeight,source.h);
  assert.deepEqual(Array.from(groups[0].userData.photoReview.faces),['east']);
});

test('facade, canopy and walking strip keep clear of the mapped seven-metre road',()=>{
  const {boxes,panels}=setup();assert.ok(boxes.length>100);
  for(const e of panels)assert.ok(e.nx>.9,'only east source elevation is clad');
  const road=ROADS.find(r=>r.name==='广场路');assert.equal(road.w,7);
  for(const [c,,x,y,z,w,h,d,opts] of boxes){
    assert.ok([x,y,z,w,h,d].every(Number.isFinite));assert.equal(opts.collide,false);
    assert.ok(y>=.2&&y+h<=source.h+.01);
    const cs=Math.cos(opts.ry),sn=Math.sin(opts.ry);
    for(const [u,v] of [[-w/2,-d/2],[-w/2,d/2],[w/2,-d/2],[w/2,d/2]]){
      const p={x:c.s.x+x+u*cs+v*sn,z:c.s.z+z-u*sn+v*cs};
      for(let i=1;i<road.pts.length;i++)assert.ok(distance(p,road.pts[i-1],road.pts[i])>=road.w/2+.25,'no facade fitting crosses the carriageway');
    }
  }
});

test('historical shop names are not turned into current tenants or replacement buildings',()=>{
  const {boxes,signs}=setup();
  assert.ok(signs.every(s=>s[1]==='维也纳商业广场'));
  assert.ok(boxes.every(b=>b[8].collide===false));
  assert.match(review.accessLabel,/观察点/);
  assert.match(review.note,/不是已核实的入口/);
});

test('the observation point stays on Guangchang Road and faces the reviewed source',()=>{
  const p=buildingObservationPoint(review,ROADS),road=ROADS.find(r=>r.name==='广场路');
  assert.ok(p&&p.z>=783&&p.z<=883);
  assert.ok(Math.min(...road.pts.slice(1).map((q,i)=>distance(p,road.pts[i],q)))<.001);
  assert.ok(Math.sin(p.heading)<-.9);
  assert.equal(buildingObservationPoint(review,[]),null);
});

test('the ongoing inventory retains every source building, road and map path',()=>{
  const inventory=JSON.parse(readFileSync(new URL('../docs/refinement/coverage.json',import.meta.url)));
  const records=JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz',import.meta.url)))).buildings;
  assert.equal(inventory.buildings.length,records.length);
  records.forEach((b,i)=>{assert.equal(inventory.buildings[i].id,b.id);assert.equal(inventory.buildings[i].index,i);});
  assert.equal(inventory.roads.length,ROADS.length);
  assert.equal(inventory.paths.length,GEO.mapPaths.length);
  assert.ok(inventory.buildings.every(b=>b.status!=='complete'));
  assert.match(inventory.report.limits,/not full facade verification/);
});

test('both the photographed title and the original map name resolve to the same building',()=>{
  const a=CityMapSystem.prototype.findPlace.call({},'维也纳商业广场');
  const b=CityMapSystem.prototype.findPlace.call({},'维也纳购物中心');
  assert.ok(a&&b);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.5);
  assert.equal(a.name,'维也纳商业广场');
});
