import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {gableRoofPlan} from '../js/pitched-roofs.js';

const ring=points=>points.map(([x,z])=>({x,z}));
const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p.x*q.z-q.x*p.z;},0)/2);
const footprintArea=p=>area(p.outer)-(p.holes||[]).reduce((s,r)=>s+area(r),0);
const close=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('a rotated gable splits into two planes on the source long axis within the recorded total height',()=>{
  const angle=.41,c=Math.cos(angle),s=Math.sin(angle),outer=ring([[0,0],[40,0],[40,12],[0,12]]).map(p=>({x:p.x*c-p.z*s,z:p.x*s+p.z*c}));
  const plan=gableRoofPlan({outer,holes:[]},21,2.5);assert.ok(plan);assert.equal(plan.faces.length,2);
  close(Math.abs(plan.axis[0]*c+plan.axis[1]*s),1);close(plan.eaveHeight,18.72);
  for(const f of plan.faces){close(footprintArea(f),240);for(const p of f.outer)assert.ok(plan.heightAt(p.x,p.z)>=18.719&&plan.heightAt(p.x,p.z)<=21.221);}
  close(plan.heightAt(20*c-6*s,20*s+6*c),21.22);
});

test('concave notches, courtyards and ridge-crossing holes retain precisely their source plan areas',()=>{
  const cases=[
    {outer:ring([[0,0],[30,0],[30,8],[12,8],[12,20],[0,20]]),holes:[]},
    {outer:ring([[0,0],[30,0],[30,20],[0,20]]),holes:[ring([[10,7],[20,7],[20,13],[10,13]])]},
    {outer:ring([[0,0],[30,0],[30,20],[22,20],[22,8],[8,8],[8,20],[0,20]]),holes:[]}
  ];
  for(const p of cases){
    const before=JSON.stringify(p),plan=gableRoofPlan(p,15,2);
    close(plan.faces.reduce((s,f)=>s+footprintArea(f),0),footprintArea(p));assert.equal(JSON.stringify(p),before);
    for(const f of plan.faces){
      const ds=f.outer.map(q=>plan.across(q.x,q.z));assert.ok(ds.every(d=>d>=-1e-6)||ds.every(d=>d<=1e-6),'no triangulation polygon crosses the ridge');
    }
  }
  const court=gableRoofPlan(cases[1],15,2);close(court.faces.reduce((s,f)=>s+footprintArea(f),0),540);
});

test('all 71 existing gabled sources receive finite clipped roof planes without mutating records',()=>{
  const buildings=JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz',import.meta.url)))).buildings;
  const sources=buildings.filter(b=>b.roofShape==='gabled');assert.equal(sources.length,71);
  for(const b of sources)for(const p of b.polygons){
    const polygon={outer:p.outer.map(([x,z])=>({x,z})),holes:(p.holes||[]).map(r=>r.map(([x,z])=>({x,z})))},before=JSON.stringify(b);
    const roof=gableRoofPlan(polygon,b.height,b.roofHeight);assert.ok(roof,b.id);
    close(roof.faces.reduce((s,f)=>s+footprintArea(f),0),footprintArea(polygon),.001);
    for(const f of roof.faces)for(const q of f.outer){const y=roof.heightAt(q.x,q.z);assert.ok(Number.isFinite(y)&&y>=roof.eaveHeight-1e-6&&y<=b.height+.22001);}
    assert.equal(JSON.stringify(b),before);
  }
  assert.equal(gableRoofPlan({outer:ring([[0,0],[10,0],[10,5],[0,5]]),holes:[]},12,0),null);
});

test('the production mesh has inclined roof triangles and blank gable caps with consistent winding',()=>{
  const {loadModule}=createRequire(import.meta.url)('./helpers/module.cjs');
  class Attribute{constructor(array,itemSize){Object.assign(this,{array:Float32Array.from(array),itemSize});}}
  class Geometry{constructor(){this.attributes={};}setAttribute(n,a){this.attributes[n]=a;}setIndex(i){this.index=i;}computeBoundingSphere(){}}
  const THREE={Vector2:class{constructor(x,y){Object.assign(this,{x,y});}equals(p){return this.x===p.x&&this.y===p.y;}},
    Group:class{constructor(){this.children=[];}add(o){this.children.push(o);}},Mesh:class{constructor(geometry){Object.assign(this,{geometry,userData:{}});}},
    BufferGeometry:Geometry,Float32BufferAttribute:Attribute,ShapeUtils:{isClockWise:r=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p.x*q.y-q.x*p.y;},0)<0,
      triangulateShape:(outer,holes)=>{assert.equal(holes.length,0);return Array.from({length:outer.length-2},(_,i)=>[0,i+1,i+2]);}}};
  const {createBuildingFootprints}=loadModule(readFileSync(new URL('../js/building-footprints.js',import.meta.url),'utf8'),{imports:{
    'three/webgpu':THREE,'./tsl-materials.js':{WALL_KINDS:{shop:0,front:1,rear:2,lotLine:3}},'./building-collision.js':{polygonContains(){}},'./pitched-roofs.js':{gableRoofPlan}}});
  const b={height:21,roofShape:'gabled',roofHeight:2.5,levels:6,cx:20,cz:6,polygons:[{outer:ring([[0,0],[40,0],[40,12],[0,12]]),holes:[]}]};
  const {geometry:g}=createBuildingFootprints({},[b]).children[0],a=g.attributes.position.array,n=g.attributes.normal.array;
  let roofArea=0,caps=0;
  for(let j=0;j<g.index.length;j+=3){
    const ids=g.index.slice(j,j+3),[A,B,C]=ids.map(i=>Array.from(a.slice(i*3,i*3+3))),u=B.map((v,k)=>v-A[k]),v=C.map((v,k)=>v-A[k]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],normal=Array.from(n.slice(ids[0]*3,ids[0]*3+3));
    assert.ok(cross.reduce((s,q,k)=>s+q*normal[k],0)>0,'winding agrees with normal');
    if(normal[1]>.1){assert.ok(normal[1]<.999);roofArea+=cross[1]/2;}
    else if(ids.every(i=>a[i*3+1]>=18.719)){
      caps++;assert.ok(ids.every(i=>g.attributes.facadeWall.array[i*3+2]===3));
    }
  }
  close(roofArea,480,.001);assert.ok(caps>=4);close(Math.max(...Array.from({length:a.length/3},(_,i)=>a[i*3+1])),21.22);
  close(g.attributes.buildingInfo.array[1],18.5/6);
});
