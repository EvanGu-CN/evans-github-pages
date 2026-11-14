import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {GEO} from '../js/shuyang-geodata.js';
import {LANDMARK_SITES} from '../js/city-config.js';
import * as layout from '../js/central-plaza-layout.js';
const {CENTRAL_PLAZA:C,centralEdges,centralTowerWindows,centralFacePoint,centralEntranceEdge}=layout;
const {loadModule}=createRequire(import.meta.url)('./helpers/module.cjs');
function setup(){
  const boxes=[],bodies=[],signs=[],root={children:[],add(m){this.children.push(m)}};
  class Group{constructor(){this.children=[];this.userData={}}add(m){this.children.push(m)}}
  class Geometry{constructor(){this.attributes={}}setAttribute(n,a){this.attributes[n]=a}computeVertexNormals(){}computeBoundingSphere(){}}
  class Vec{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z})}length(){return Math.hypot(this.x,this.y,this.z)}normalize(){const l=this.length();this.x/=l;this.y/=l;this.z/=l;return this}}
  class Mesh{constructor(geometry,material){Object.assign(this,{geometry,material});this.position={set(){}};this.quaternion={setFromUnitVectors(){}}}}
  const THREE={Group,Vector3:Vec,Mesh,BufferGeometry:Geometry,CylinderGeometry:class{},Float32BufferAttribute:class{constructor(array,itemSize){Object.assign(this,{array,itemSize})}},MeshStandardNodeMaterial:class{constructor(opts){Object.assign(this,opts)}}};
  const {buildCentralPlaza}=loadModule(readFileSync(new URL('../js/central-plaza.js',import.meta.url),'utf8'),{imports:{'three/webgpu':THREE,'./central-plaza-layout.js':layout,'./tsl-materials.js':{createCulturalPanelMaterial:()=>({})}}});
  buildCentralPlaza({ctxFor:()=>({s:LANDMARK_SITES['中央城市广场'],g:root}),box:(...args)=>boxes.push(args),sign:(...args)=>signs.push(args),sourceBody:(...args)=>bodies.push(args)});
  return{boxes,bodies,signs,group:root.children[0]};
}
test('central plaza retains both source records and separates reported display height from OSM height',()=>{
  const records=JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz',import.meta.url)))).buildings;
  assert.equal(records[C.podiumIndex].id,C.podiumId);assert.equal(records[C.towerIndex].id,C.towerId);
  assert.equal(records[C.towerIndex].height,150);assert.equal(C.towerHeight,147.15);assert.equal(C.sourceTowerHeight,150);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../js/building-geodata.bin.gz',import.meta.url))).digest('hex'),'211ef701274c3124809f5fe0390b2fc949ce47c968b967b0d2c03d98fb79615f');
  const {bodies}=setup();assert.equal(bodies.length,2);assert.deepEqual(bodies.map(a=>a[0].s.sourceId),[C.podiumId,C.towerId]);assert.deepEqual(bodies.map(a=>a[2]),[26.9,147.15]);
});
test('window modules follow every rotated source edge and remain within the reported 42-storey envelope',()=>{
  const edges=centralEdges(C.towerId),windows=centralTowerWindows();assert.equal(edges.length,4);assert.ok(windows.length>1500);assert.ok(edges.every((_,edge)=>new Set(windows.filter(w=>w.edge===edge).map(w=>w.floor)).size===42));
  for(const w of windows){assert.ok(w.u0>0&&w.u1<1&&w.u1>w.u0);assert.ok(w.bottom>=C.base&&w.top<=C.base+C.towerHeight);assert.ok(w.width>1.7&&w.width<2.3);
    for(const u of [w.u0,w.u1]){const p=centralFacePoint(edges[w.edge],u,w.top,.04);assert.ok([p.x,p.y,p.z].every(Number.isFinite));}}
  assert.deepEqual([...new Set(windows.filter(w=>w.refuge).map(w=>w.floor))],[14,29]);
});
test('actual model panels and all added boxes stop at the reported height without the previous extra crown',()=>{
  const {group,boxes}=setup();let triangles=0;
  for(const m of group.children){const a=m.geometry?.attributes?.position?.array;if(!a)continue;
    assert.ok(a.every(Number.isFinite));for(let i=1;i<a.length;i+=3)assert.ok(a[i]>=.2&&a[i]<=C.base+C.towerHeight+1e-6);
    for(let i=0;i<a.length;i+=9){const ax=a[i+3]-a[i],ay=a[i+4]-a[i+1],az=a[i+5]-a[i+2],bx=a[i+6]-a[i],by=a[i+7]-a[i+1],bz=a[i+8]-a[i+2];assert.ok(Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)>1e-8);triangles++;}}
  assert.ok(triangles>6000);for(const a of boxes)assert.ok(a[3]+a[6]<27,'entrance boxes do not create a tower crown');
});
test('tower panel triangle winding points away from the source body on every facade',()=>{
  const {group}=setup(),site=LANDMARK_SITES['中央城市广场'],edges=centralEdges(C.towerId);let checked=0;
  for(const m of group.children){const a=m.geometry?.attributes?.position?.array;if(!a)continue;
    for(let i=0;i<a.length;i+=9){if(a[i+1]<30||a[i+4]<30||a[i+7]<30)continue;
      const cx=site.x+(a[i]+a[i+3]+a[i+6])/3,cz=site.z+(a[i+2]+a[i+5]+a[i+8])/3,e=edges.reduce((a,b)=>Math.abs((cx-b.a.x)*b.nx+(cz-b.a.z)*b.nz)<Math.abs((cx-a.a.x)*a.nx+(cz-a.a.z)*a.nz)?b:a);
      const ax=a[i+3]-a[i],ay=a[i+4]-a[i+1],az=a[i+5]-a[i+2],bx=a[i+6]-a[i],by=a[i+7]-a[i+1],bz=a[i+8]-a[i+2];
      assert.ok((ay*bz-az*by)*e.nx+(ax*by-ay*bx)*e.nz>0);checked++;}}
  assert.ok(checked>5000);
});
test('entrance segment faces the inferred north frontage and does not add a closed projecting hall',()=>{
  const e=centralEntranceEdge();assert.ok(e.nz<-.9);assert.ok((e.a.z+e.b.z)/2<20,'north outer frontage is selected instead of the north-facing concave inner street at z=133.75');
  const {boxes,signs}=setup();assert.ok(signs.some(a=>a[1]==='①'));assert.ok(signs.some(a=>a[1]==='中央商场'));
  for(const a of boxes){assert.equal(a[8].collide,false);assert.ok(a[7]<3,'all entrance details remain shallow');}
});
test('the unknown roof and unmeasured facade placement remain explicit evidence limitations',()=>{
  assert.equal(C.captureDate,null);assert.match(C.limits,/do not show the complete tower roof/);assert.match(C.limits,/display estimates/);assert.match(C.limits,/Other podium facades remain generic/);
  assert.equal(createHash('sha256').update(JSON.stringify(GEO.roads)).digest('hex'),'6340f84446791cc0646838b9c3e81c6d067888d8bc71fe7a3a26ba39a2f730da');
});
