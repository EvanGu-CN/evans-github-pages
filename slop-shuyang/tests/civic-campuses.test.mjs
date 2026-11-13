import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadModule} from './helpers/module.cjs';
import {GEO} from '../js/shuyang-geodata.js';
import {LANDMARK_SITES,TELEPORT_LOCATIONS,isWater} from '../js/city-config.js';

class Vector {
  constructor(x=0,y=0,z=0){this.set(x,y,z)}
  set(x,y,z){Object.assign(this,{x,y,z});return this}
  copy(v){return this.set(v.x,v.y,v.z)}
  clone(){return new Vector(this.x,this.y,this.z)}
  sub(v){return this.set(this.x-v.x,this.y-v.y,this.z-v.z)}
  add(v){return this.set(this.x+v.x,this.y+v.y,this.z+v.z)}
  multiplyScalar(k){return this.set(this.x*k,this.y*k,this.z*k)}
  length(){return Math.hypot(this.x,this.y,this.z)}
  normalize(){return this.multiplyScalar(1/(this.length()||1))}
}
class Geometry {constructor(...args){this.args=args}setAttribute(){return this}setIndex(){return this}computeVertexNormals(){}rotateX(){}setFromPoints(){return this}}
class Path {moveTo(){}lineTo(){}closePath(){}}
class Mesh {constructor(geometry,material){Object.assign(this,{geometry,material,position:new Vector(),rotation:{},quaternion:{setFromUnitVectors(){}}})}}
const THREE={Vector3:Vector,BufferGeometry:Geometry,ExtrudeGeometry:Geometry,CylinderGeometry:Geometry,PlaneGeometry:Geometry,
  Float32BufferAttribute:Geometry,Mesh,Line:Mesh,Shape:Path,Path,MeshStandardNodeMaterial:class{},LineBasicNodeMaterial:class{}};
const {buildCivicCampuses}=loadModule(readFileSync(new URL('../js/civic-campuses.js',import.meta.url),'utf8'),
  {imports:{'three/webgpu':THREE,'./shuyang-geodata.js':{GEO}}});

const groups=[],colliders=[],sources=[],boxes=[];
const addCollider=(points,height)=>colliders.push({minY:0,maxY:height,polygon:{outer:points,holes:[]}});
const ctxFor=name=>{const g={children:[],userData:{},add(m){this.children.push(m)}};groups.push({name,g});return {s:LANDMARK_SITES[name],g}};
const sourceBody=(c,mat,h)=>{sources.push(c.s.sourceId);const b=GEO.mapBuildings.find(b=>b.id===c.s.sourceId);assert.ok(b,c.s.sourceId);
  addCollider(Array.from({length:b.o.length/2},(_,i)=>({x:b.o[2*i],z:b.o[2*i+1]})),h)};
const sourceEdges=c=>{const b=GEO.mapBuildings.find(b=>b.id===c.s.sourceId),p=b.o,n=p.length/2;
  return Array.from({length:n},(_,i)=>{const j=(i+1)%n,dx=p[j*2]-p[i*2],dz=p[j*2+1]-p[i*2+1],L=Math.hypot(dx,dz);
    return {x:(p[i*2]+p[j*2])/2-c.s.x,z:(p[i*2+1]+p[j*2+1])/2-c.s.z,L,tx:dx/L,tz:dz/L,nx:dz/L,nz:-dx/L,ry:-Math.atan2(dz,dx),facing:0}})};
const box=(c,mat,x,y,z,w,h,d)=>{boxes.push({c,x,y,z,w,h,d});const m=new Mesh();c.g.add(m);return m};
buildCivicCampuses({ctxFor,sourceBody,sourceEdges,box,colliders,M:{},edgePanel(){},sign(){},cyl(){}});
const inside=(r,x,z)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];
  if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)yes=!yes}return yes};
const occupied=(x,z,y)=>colliders.some(c=>y>=c.minY&&y<=c.maxY&&inside(c.polygon.outer,x,z)&&!c.polygon.holes.some(h=>inside(h,x,z)));

test('government tower sits over the mapped central strip rather than the old plaza location',()=>{
  assert.equal(occupied(2335,1748,40),true);
  assert.equal(occupied(2277,1800,40),false);
  assert.equal(occupied(2335,1875,1),false,'the open civic plaza is not a giant campus extrusion');
  assert.ok(sources.includes('way/1372583964'));assert.ok(sources.includes('way/1372583963'));
  assert.equal(sources.includes('way/1027263213'),false);
});
test('stadium field and north/south passages remain open while actual stands collide',()=>{
  for(const [dx,dz] of [[0,0],[33,51],[-33,-51],[0,-113],[0,113]])for(const y of [1,8,20])
    assert.equal(occupied(-489.25+dx,4722.5+dz,y),false,`${dx},${dz} at ${y}m`);
  assert.equal(occupied(-489.25+85,4722.5,10),true);
  const pitch=boxes.find(b=>b.w===68&&b.d===105);assert.ok(pitch,'the rectangular pitch is longer north-south');
});
test('sports gym and pool use their own mapped source roofs and have separate Chinese names',()=>{
  assert.ok(sources.includes('way/496856000'));
  assert.ok(sources.includes('4b78a3d2-c2c3-4e55-b5c5-af47da2fbfb1'));
  assert.equal(occupied(-715,4578,5),true);assert.equal(occupied(-743.8,4775,5),true);
  assert.equal(occupied(-743.8,4775,18),false,'pool is a low building rather than a 21m source default box');
  const names=LANDMARK_SITES['沭阳体育中心'].subsites.map(s=>s.name);
  assert.deepEqual(names,['沭阳体育场','沭阳体育馆','体育中心游泳馆']);
});
test('revised civic arrivals are on dry open ground clear of the model walls',()=>{
  for(const id of ['gov','sports']){const p=TELEPORT_LOCATIONS[id];assert.equal(isWater(p.x,p.z),false);
    for(const dx of [-2,0,2])for(const dz of [-2,0,2])assert.equal(occupied(p.x+dx,p.z+dz,1.5),false,id)}
});
