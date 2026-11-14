import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {GEO} from '../js/shuyang-geodata.js';
import {BLOCKS,blockAt,ISLAND_BOUNDS} from '../js/city-config.js';
import {roadRibbonEdges,roadRibbonTriangles} from '../js/road-ribbon.js';
import {polygonContains,polygonBoxOverlaps} from '../js/building-collision.js';
const {loadModule}=createRequire(import.meta.url)('./helpers/module.cjs');
const roadPoints=r=>Array.from({length:r[6].length/2},(_,i)=>({x:r[6][i*2],z:r[6][i*2+1]}));

test('rotated road edges retain their perpendicular width with the same miter on both bend legs',()=>{
  for(const angle of [0,.3,.8,1.5]){
    const c=Math.cos(angle),s=Math.sin(angle),p=[{x:0,z:0},{x:100*c,z:100*s}],e=roadRibbonEdges(p,12.8);
    for(let i=0;i<2;i++){
      assert.ok(Math.abs(Math.hypot(e.left[i].x-p[i].x,e.left[i].z-p[i].z)-6.4)<1e-9);
      assert.ok(Math.abs((e.left[i].x-p[i].x)*c+(e.left[i].z-p[i].z)*s)<1e-9);
    }
  }
  const e=roadRibbonEdges([{x:0,z:0},{x:100,z:0},{x:100,z:100}],12);
  assert.deepEqual(e.left[1],{x:94,z:6});assert.deepEqual(e.right[1],{x:106,z:-6});
});

test('every source asphalt triangle centroid remains outside all curb islands, including dead-end holes',()=>{
  let checked=0;
  for(const r of GEO.roads){
    if(r[5])continue;
    for(const t of roadRibbonTriangles(roadPoints(r),r[2]+.8)){
      const twiceArea=Math.abs((t[1].x-t[0].x)*(t[2].z-t[0].z)-(t[1].z-t[0].z)*(t[2].x-t[0].x));
      if(twiceArea<1e-8)continue; // Duplicate quantised source points draw no asphalt.
      const x=t.reduce((s,p)=>s+p.x,0)/3,z=t.reduce((s,p)=>s+p.z,0)/3;
      if(x<=ISLAND_BOUNDS.minX||x>=ISLAND_BOUNDS.maxX||z<=ISLAND_BOUNDS.minZ||z>=ISLAND_BOUNDS.maxZ)continue;
      assert.ok(blockAt(x,z)===null,`${r[0]} road at ${x},${z} was filled by a curb island`);checked++;
    }
  }
  assert.ok(checked>6000);assert.ok(BLOCKS.some(b=>b.holes.length>0));
});

test('holed curb membership keeps each actual hole edge open instead of using an outer-only fill',()=>{
  let checked=0;
  for(const b of BLOCKS)for(const hole of b.holes){
    const polygon={outer:b.poly,holes:b.holes};
    // A point halfway between a hole vertex and its centre is a candidate;
    // test only candidates actually in the hole, not a concave ring's bbox.
    const centre={x:hole.reduce((s,p)=>s+p.x,0)/hole.length,z:hole.reduce((s,p)=>s+p.z,0)/hole.length};
    const hp={outer:hole,holes:[]};
    for(const p of hole){
      const x=(p.x+centre.x)/2,z=(p.z+centre.z)/2;
      if(!polygonContains(hp,x,z))continue;
      assert.equal(polygonContains(polygon,x,z),false);assert.notEqual(blockAt(x,z),b);checked++;break;
    }
  }
  assert.ok(checked>=30,'actual enclosed water/road holes were exercised');
});

test('traffic sidewalk queries retain polygon boundaries and holes within the spatial hash',()=>{
  const {buildRoadNetwork}=loadModule(readFileSync(new URL('../js/road-network.js',import.meta.url),'utf8'),{imports:{
    './city-config.js':{ISLAND_BOUNDS},'./shuyang-geodata.js':{GEO:{roadGraph:{nodes:[],links:[],names:[]}}},
    './building-collision.js':{polygonBoxOverlaps},'./road-photo-references.js':{reviewedLaneCenters:()=>null}
  }});
  const net=buildRoadNetwork([{minX:0,maxX:100,minZ:0,maxZ:100,polygon:{
    outer:[{x:0,z:0},{x:100,z:0},{x:0,z:100}],holes:[[{x:10,z:10},{x:20,z:10},{x:10,z:20}]]
  }}],[]);
  assert.equal(net.onSidewalk(5,5),true);assert.equal(net.onSidewalk(12,12),false);
  assert.equal(net.onSidewalk(90,90),false,'the diagonal island bounding box is not solid sidewalk');
  assert.equal(net.onSidewalk(-5,10),false);
});

test('curb and inset data preserve every source road identity and the immutable building binary',()=>{
  assert.equal(GEO.roads.length,1105);assert.equal(new Set(GEO.roadSourceIds).size,1104);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../js/building-geodata.bin.gz',import.meta.url))).digest('hex'),'046c22fdec5cbfd2156a842b57643789abbc9f6248ac54b705b479e6c4a875a6');
  assert.match(GEO.curbIslandAudit.method,/renderer road triangles/);assert.equal(GEO.curbIslandAudit.slabInsetM,.3);
  for(const b of BLOCKS){assert.ok(b.area>0&&Number.isFinite(b.cx+b.cz));assert.ok(b.surfaces.length&&b.slabs.length,'a valid road-adjacent parcel must not collapse during inset buffering');assert.equal(blockAt(b.cx,b.cz),b);}
  assert.ok(BLOCKS.reduce((s,b)=>s+b.slabs.length,0)>450);
});
test('large park and industrial parcels keep street-side paving without filling their interiors',()=>{
  const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p.x*q.z-q.x*p.z;},0)/2);
  let parcel=0,paving=0,large=0,bands=0;
  for(const b of BLOCKS)if(b.area>120000){
    large++;parcel+=b.area;if(b.surfaces.length)bands++;
    paving+=b.surfaces.reduce((s,p)=>s+area(p.outer)-p.holes.reduce((s,h)=>s+area(h),0),0);
  }
  assert.ok(large>50&&bands>50);assert.ok(paving>100000);assert.ok(paving<parcel*.15,'large parcel interiors remain outside the new paving bands');
});
test('traffic retains independent valid cycles and their approaches while pruning terminal chains',()=>{
  const {edgesWithWayOn}=loadModule(readFileSync(new URL('../js/road-network.js',import.meta.url),'utf8')+'\nexport {edgesWithWayOn};',{imports:{
    './city-config.js':{ISLAND_BOUNDS},'./shuyang-geodata.js':{GEO},'./building-collision.js':{polygonBoxOverlaps},'./road-photo-references.js':{reviewedLaneCenters:()=>null}
  }});
  const graph={a:['b'],b:['c'],c:['a'],x:['y'],y:['x'],approach:['a'],branch:['x','dead'],dead:['end'],end:[]};
  const keep=edgesWithWayOn(Object.keys(graph),n=>graph[n]);
  assert.deepEqual([...keep].sort(),['a','approach','b','branch','c','x','y']);
  for(const n of keep)assert.ok(graph[n].some(next=>keep.has(next)));
});
test('the complete production road graph keeps northern and southern traffic with exact sidewalk polygons',()=>{
  const {reviewedLaneCenters}=loadModule(readFileSync(new URL('../js/road-photo-references.js',import.meta.url),'utf8'));
  const {buildRoadNetwork}=loadModule(readFileSync(new URL('../js/road-network.js',import.meta.url),'utf8'),{imports:{
    './city-config.js':{ISLAND_BOUNDS},'./shuyang-geodata.js':{GEO},'./building-collision.js':{polygonBoxOverlaps},'./road-photo-references.js':{reviewedLaneCenters}
  }});
  const sidewalks=BLOCKS.flatMap(b=>b.surfaces.map(p=>({minX:Math.min(...p.outer.map(p=>p.x)),maxX:Math.max(...p.outer.map(p=>p.x)),minZ:Math.min(...p.outer.map(p=>p.z)),maxZ:Math.max(...p.outer.map(p=>p.z)),polygon:p})));
  const n=buildRoadNetwork(sidewalks,[]),keep=new Set(n.edges),nodes=new Set(n.nodes);
  assert.ok(n.edges.length>1000);assert.ok(n.edges.some(e=>e.sz<-1200));assert.ok(n.edges.some(e=>e.sz>4700));
  assert.ok(n.edges.some(e=>e.sx<-2000));assert.ok(n.edges.some(e=>e.sx>3200));
  for(const e of n.edges){assert.ok(nodes.has(e.from)&&nodes.has(e.to),'every approach endpoint is initialised for traffic');assert.ok(Number.isInteger(e.inSide)&&Number.isInteger(e.outSide));assert.ok(e.moves.length);for(const m of e.moves)assert.ok(keep.has(m.to));for(let i=0;i<e.lanes.length;i++)assert.ok(e.moves.some(m=>m.out[i]>=0));}
});
