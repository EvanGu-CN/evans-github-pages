import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import clipping from '../js/vendor/polygon-clipping.js';
import {GEO} from '../js/shuyang-geodata.js';
import {CULTURAL_STREETS as streets} from '../js/cultural-streets-data.js';
import {STREET_MASK,culturalStreetAt,collectCulturalStreetTrees} from '../js/cultural-street-layout.js';
import {CULTURAL_HALLS,hallSiteSurfaces} from '../js/cultural-hall-layout.js';
import {ART_GALLERY,galleryDisplayFootprints,galleryPavingPolygons} from '../js/art-gallery-layout.js';
import {roadRibbonTriangles} from '../js/road-ribbon.js';
const points=r=>Array.from({length:r.length/2},(_,i)=>[r[i*2],r[i*2+1]]);
const poly=p=>[points(p.outer),...(p.holes||[]).map(points)];
const objpoly=p=>[p.outer,...(p.holes||[])].map(r=>r.map(q=>[q.x,q.z]));
const ar=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
const area=m=>m.reduce((s,p)=>s+ar(p[0])-p.slice(1).reduce((s,r)=>s+ar(r),0),0);
const all=streets.surfaces.flatMap(s=>s.polygons.map(poly));
const hash=x=>createHash('sha256').update(x).digest('hex');

test('cultural frontage work preserves the source building binary and every source road',()=>{
  assert.equal(hash(readFileSync(new URL('../js/building-geodata.bin.gz',import.meta.url))),'211ef701274c3124809f5fe0390b2fc949ce47c968b967b0d2c03d98fb79615f');
  assert.equal(hash(JSON.stringify(GEO.roads)),streets.sourceRoadsDigest);assert.equal(streets.sourceRoadsDigest,'6340f84446791cc0646838b9c3e81c6d067888d8bc71fe7a3a26ba39a2f730da');
  assert.equal(GEO.mapBuildings.length,7745);assert.equal(new Set(GEO.roadSourceIds).size,1104);assert.equal(GEO.mapPaths.length,92);
});
test('all new frontage polygons avoid actual rendered carriageway triangles and cultural bodies',()=>{
  const e=streets.extent,near=(x,z)=>x>e[0]-40&&x<e[2]+40&&z>e[1]-40&&z<e[3]+40;let roads=0;
  for(const r of GEO.roads){if(r[5])continue;const ps=points(r[6]).map(([x,z])=>({x,z}));
    // Long source legs may cross the window with both endpoints outside it.
    const xs=ps.map(p=>p.x),zs=ps.map(p=>p.z);if(Math.max(...xs)<e[0]-40||Math.min(...xs)>e[2]+40||Math.max(...zs)<e[1]-40||Math.min(...zs)>e[3]+40)continue;
    for(const t of roadRibbonTriangles(ps,r[2]+.8)){const ring=t.map(p=>[p.x,p.z]);if(ar(ring)<1e-7)continue;roads++;assert.ok(area(clipping.intersection(STREET_MASK,[ring]))<.002,r[0]);}
  }
  assert.ok(roads>10);
  const excluded=new Set([ART_GALLERY.sourceId,...CULTURAL_HALLS.map(h=>h.sourceId)]);
  const bodies=[...CULTURAL_HALLS,...galleryDisplayFootprints()].map(objpoly);
  for(const b of GEO.mapBuildings){if(excluded.has(b.id))continue;const p=points(b.o);if(!p.some(([x,z])=>near(x,z)))continue;bodies.push([p,...b.holes.map(points)]);}
  for(const b of bodies)assert.ok(area(clipping.intersection(STREET_MASK,b))<.002);
});
test('green strips, reddish paving and their narrow stone rims have no duplicate ground areas',()=>{
  for(const p of all){assert.ok(area([p])>.014);assert.ok(p.flat(2).every(Number.isFinite));}
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)assert.ok(area(clipping.intersection(all[i],all[j]))<.002);
  assert.ok(area(all)>3000&&area(all)<3400);
});
test('existing gallery and hall forecourts are trimmed around the new reviewed frontage',()=>{
  const g=galleryPavingPolygons();
  for(const p of [...g.base,...g.bands,...CULTURAL_HALLS.flatMap(h=>{const s=hallSiteSurfaces(h);return [...s.greens,...s.paving]})])assert.ok(area(clipping.intersection(objpoly(p),STREET_MASK))<1e-6);
});
test('authored street trees stay in green bands and avoid retained trees, pavement and runtime obstacles',()=>{
  const green=clipping.union(...streets.surfaces.filter(s=>s.kind==='green').flatMap(s=>s.polygons.map(poly)));
  const others=clipping.union(...streets.surfaces.filter(s=>s.kind!=='green').flatMap(s=>s.polygons.map(poly)));
  assert.equal(streets.treeSites.length,37);
  const square=p=>[[[p.x-.3,p.z-.3],[p.x+.3,p.z-.3],[p.x+.3,p.z+.3],[p.x-.3,p.z+.3]]];
  for(const p of streets.treeSites){assert.ok(area(clipping.difference(square(p),green))<1e-7);assert.ok(area(clipping.intersection(square(p),others))<1e-7);assert.equal(culturalStreetAt(p.x,p.z),true);}
  const chosen=collectCulturalStreetTrees([streets.treeSites[0]],(x,z)=>z>4350);
  assert.ok(chosen.length>0&&chosen.length<37);assert.ok(chosen.every(p=>p.z<=4350));assert.ok(chosen.every(p=>Math.hypot(p.x-streets.treeSites[0].x,p.z-streets.treeSites[0].z)>=5));
  assert.equal(culturalStreetAt(0,0,1),false);
});
test('evidence describes partial frontage and estimates rather than claiming complete road reconstruction',()=>{
  assert.equal(streets.captureDate,null);assert.equal(streets.imagery.imageAcquired,null);assert.match(streets.limits,/display estimates/);assert.match(streets.limits,/No lane-count/);
  assert.deepEqual(streets.frontages.map(f=>f.road),['兰亭路','承晖路']);
  for(const f of streets.frontages)for(const id of f.sourceWayIds)assert.ok(GEO.roadSourceIds.includes(id));
});
