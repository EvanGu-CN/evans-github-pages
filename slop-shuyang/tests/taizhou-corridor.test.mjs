import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import clipping from '../js/vendor/polygon-clipping.js';
import {GEO} from '../js/shuyang-geodata.js';
import {TAIZHOU_ROAD_REVIEW as review,reviewRoadSections,reviewedLaneCenters} from '../js/road-photo-references.js';
import {TAIZHOU_CORRIDOR as corridor} from '../js/taizhou-corridor-data.js';
import {collectTaizhouTreeSites,taizhouNoPlantAt} from '../js/taizhou-corridor-sites.js';
import {polygonContains,polygonBoxOverlaps} from '../js/building-collision.js';

const points=p=>Array.from({length:p.length/2},(_,i)=>[p[i*2],p[i*2+1]]);
const multi=p=>[points(p.outer),...(p.holes||[]).map(points)];
const bounds=p=>{const x=p.filter((_,i)=>i%2===0),z=p.filter((_,i)=>i%2===1);return[Math.min(...x),Math.min(...z),Math.max(...x),Math.max(...z)];};
const overlaps=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
const ringArea=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
const area=polys=>polys.reduce((s,p)=>s+ringArea(p[0])-p.slice(1).reduce((s,r)=>s+ringArea(r),0),0);
const length=p=>points(p).slice(1).reduce((s,b,i)=>{const a=points(p)[i];return s+Math.hypot(b[0]-a[0],b[1]-a[1]);},0);

test('the reviewed section preserves source centrelines and splits the terminal boundaries without widening northern Taizhou',()=>{
  const original={name:'台州北路',w:16,lanes:5,dir:0,bridge:false,flat:[2400,200,2350,500,2200,4000]};
  const before=JSON.stringify(original),parts=reviewRoadSections(original);
  assert.equal(parts.length,3);assert.equal(JSON.stringify(original),before);
  assert.ok(Math.abs(parts.reduce((s,p)=>s+length(p.flat),0)-length(original.flat))<1e-6);
  assert.equal(parts[0].w,16);assert.equal(parts[1].w,21.5);assert.equal(parts[1].lanes,6);assert.equal(parts[2].w,16);
  assert.equal(parts[0].flat.at(-1),review.minZ);assert.equal(parts[2].flat[1],review.maxZ);
  assert.equal(reviewRoadSections({...original,name:'台州南路辅路'})[0].w,16);
  assert.equal(reviewRoadSections({...original,bridge:true})[0].w,16);
});

test('three reviewed ways and their graph links carry the same six-lane width while all 1104 original way identities remain',()=>{
  assert.equal(GEO.roadSourceIds.length,GEO.roads.length);assert.equal(new Set(GEO.roadSourceIds).size,1104);
  assert.equal(GEO.roadReviews.length,3);
  for(const r of GEO.roadReviews){
    const road=GEO.roads[r.index];assert.equal(road[2],21.5);assert.equal(road[3],6);assert.equal(r.originalWidth,16);
    assert.equal(r.sourceId,GEO.roadSourceIds[r.index]);
    const zs=road[6].filter((_,i)=>i%2===1);assert.ok(Math.min(...zs)>=review.minZ-.01&&Math.max(...zs)<=review.maxZ+.01);
  }
  const links=GEO.roadGraph.links.filter(l=>review.mainNames.includes(GEO.roadGraph.names[l[2]])&&l[3]===21.5);
  assert.ok(links.length>=3);assert.ok(links.every(l=>l[4]===6));
  assert.ok(GEO.roads.some(r=>r[0]==='台州北路'&&r[2]===16&&r[6].some((v,i)=>i%2===1&&v<0)));
  assert.equal(corridor.sourceRoadsDigest,createHash('sha256').update(JSON.stringify(GEO.roads)).digest('hex'));
});

test('the production traffic generator exposes three lane centres per direction on rotated reviewed sections',()=>{
  const {loadModule}=createRequire(import.meta.url)('./helpers/module.cjs');
  for(const angle of [0,.7]){
    const nodes=[],links=[];
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      const x=col*200,z=row*200;nodes.push(1800+x*Math.cos(angle)-z*Math.sin(angle),2000+x*Math.sin(angle)+z*Math.cos(angle));
    }
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      const i=row*3+col,reviewed=row===1;
      if(col<2)links.push([i,i+1,reviewed?0:1,reviewed?21.5:12,reviewed?6:2,0,[]]);
      if(row<2)links.push([i,i+3,1,12,2,0,[]]);
    }
    const {buildRoadNetwork}=loadModule(readFileSync(new URL('../js/road-network.js',import.meta.url),'utf8'),{imports:{
      './city-config.js':{ISLAND_BOUNDS:{minX:-1e4,maxX:1e4,minZ:-1e4,maxZ:1e4}},
      './shuyang-geodata.js':{GEO:{roadGraph:{nodes,names:['台州南路','cross'],links}}},
      './building-collision.js':{polygonBoxOverlaps},'./road-photo-references.js':{reviewedLaneCenters}
    }});
    const network=buildRoadNetwork([],[]),reviewed=network.edges.filter(e=>e.half===10.75);assert.equal(reviewed.length,4);
    for(const e of reviewed){assert.equal(e.lanes.length,3);assert.deepEqual(Array.from(e.lanes),review.laneCenters);assert.ok(e.lanes.at(-1)+1.75<=e.half);}
    assert.ok(network.paintEdges.some(e=>e.half===10.75),'paint uses the same widened carriageway');
  }
});

test('all corridor surface polygons avoid retained source buildings and motor/service carriageways',()=>{
  const buildings=GEO.mapBuildings.map(b=>({bb:bounds(b.o),poly:[points(b.o),...(b.holes||[]).map(points)]}));
  const roads=[];
  for(const r of GEO.roads){if(r[5])continue;const p=points(r[6]);for(let i=1;i<p.length;i++){
    const a=p[i-1],b=p[i],L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L<.01)continue;
    const nx=-(b[1]-a[1])/L*r[2]/2,nz=(b[0]-a[0])/L*r[2]/2;
    const poly=[[[a[0]-nx,a[1]-nz],[b[0]-nx,b[1]-nz],[b[0]+nx,b[1]+nz],[a[0]+nx,a[1]+nz]]];roads.push({bb:bounds(poly[0].flat()),poly,reviewed:review.mainNames.includes(r[0])&&r[2]===21.5});
  }}
  let buildingOverlap=0,roadOverlap=0;
  for(const s of corridor.surfaces)for(const p of s.polygons){
    assert.ok(p.outer.every(Number.isFinite));const bb=bounds(p.outer),poly=multi(p);
    for(const b of buildings)if(overlaps(bb,b.bb))buildingOverlap+=area(clipping.intersection(poly,b.poly));
    for(const r of roads)if(overlaps(bb,r.bb))roadOverlap+=area(clipping.intersection(poly,r.poly));
  }
  assert.ok(buildingOverlap<.01,`source building overlap ${buildingOverlap} m²`);
  assert.ok(roadOverlap<.2,`carriageway overlap ${roadOverlap} m² (millimetre clipping grid)`);
  let widenedBuildingOverlap=0,oldSurfaceOverlap=0;
  for(const road of roads.filter(r=>r.reviewed)){
    for(const b of buildings)if(overlaps(road.bb,b.bb))widenedBuildingOverlap+=area(clipping.intersection(road.poly,b.poly));
    for(const s of GEO.urban.surfaces)for(const p of s.polygons)if(overlaps(road.bb,bounds(p.outer)))oldSurfaceOverlap+=area(clipping.intersection(road.poly,multi(p)));
  }
  assert.ok(widenedBuildingOverlap<.01,`widened carriageway intersects ${widenedBuildingOverlap} m² of source buildings`);
  assert.ok(oldSurfaceOverlap<.1,`old urban surfaces cover ${oldSurfaceOverlap} m² of widened road`);
  const walkway=corridor.surfaces.find(s=>s.kind==='walkway'),green=corridor.surfaces.find(s=>s.kind==='landscape');
  let overlap=0;for(const a of walkway.polygons)for(const b of green.polygons)if(overlaps(bounds(a.outer),bounds(b.outer)))overlap+=area(clipping.intersection(multi(a),multi(b)));
  assert.ok(overlap<.01,`walkway has no duplicate grass layer (${overlap} m²)`);
});

test('corridor trees stay in reviewed green polygons, clear runtime obstacles and deduplicate existing trees',()=>{
  const greens=corridor.surfaces.filter(s=>s.kind==='landscape').flatMap(s=>s.polygons).map(p=>({outer:points(p.outer).map(([x,z])=>({x,z})),holes:p.holes.map(h=>points(h).map(([x,z])=>({x,z})))}));
  assert.ok(corridor.treeSites.length>100);
  for(const p of corridor.treeSites)assert.ok(greens.some(g=>polygonContains(g,p.x,p.z)));
  assert.equal(collectTaizhouTreeSites([],()=>true).length,0);
  const lane=corridor.surfaces.find(s=>s.kind==='cycleway').polygons[0].outer;
  assert.equal(taizhouNoPlantAt(lane[0],lane[1]),true);
  const main=GEO.roads[GEO.roadReviews[0].index][6];assert.equal(taizhouNoPlantAt(main[0],main[1]),true);
  assert.equal(taizhouNoPlantAt(-1000,-1000),false);
  const existing=[corridor.treeSites[0]],sites=collectTaizhouTreeSites(existing,()=>false);
  for(let i=0;i<sites.length;i++)for(const q of [...existing,...sites.slice(0,i)])assert.ok(Math.hypot(sites[i].x-q.x,sites[i].z-q.z)>=6);
  assert.equal(review.captureDate,null);assert.match(review.note,/展示估计/);
});
