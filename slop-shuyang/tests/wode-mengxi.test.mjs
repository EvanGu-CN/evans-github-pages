import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {GEO} from '../js/shuyang-geodata.js';
import {LANDMARKS,LANDMARK_SITES,TELEPORT_LOCATIONS,isWater,blockAt} from '../js/city-config.js';
import {COMMUNITY_DETAILS} from '../js/community-data.js';
import {LANDMARK_REFERENCES} from '../js/landmark-references.js';
import {loadModule} from './helpers/module.cjs';
const load=f=>JSON.parse(readFileSync(new URL('../tools/data/shuyang/'+f,import.meta.url)));
const rows=JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz',import.meta.url)))).buildings;

test('corridor additions cover four estates, preserve overlaps and use their own GCJ map frame',()=>{
  const trace=load('online-district-traces.json'),audit=load('building-audit.json'),review=load('corridor-review-audit.json');
  const ref=trace.additionalReferences.find(r=>r.id==='amap-wode-rtmart-20261113');
  assert.deepEqual(ref.mapOffset,[0,100]);assert.deepEqual(ref.size,[1536,1200]);assert.equal(ref.imageAcquired,null);
  assert.equal(review.reviewedWholeSilhouettes,186);assert.equal(review.newFootprints.length,35);
  const decisions=audit.reviewedImagery.decisions.filter(x=>x.traceId.includes('/wode-rtmart/'));
  assert.equal(decisions.filter(x=>x.status==='accepted').length,34);
  const rejected=decisions.filter(x=>x.status!=='accepted');assert.equal(rejected.length,1);
  assert.ok(rows.some(b=>b.id===rejected[0].conflicts[0].sourceId));
  for(const name of ['沃德嘉园','天下景城','苏通花苑','颖都家园']){
    const accepted=trace.buildings.filter(b=>b.communityContext===name&&rows.some(r=>r.id==='reviewed/online/'+b.id));assert.ok(accepted.length>0,name);
    const n=GEO.neighborhoods.find(n=>n.name===name);assert.ok(n.buildings.length>0);
    for(const b of accepted){const source=rows.find(r=>r.id==='reviewed/online/'+b.id);assert.equal(source.geometryReference.imageDate,null);assert.equal(source.heightSource,'estimate');}
  }
  assert.ok(GEO.neighborhoods.find(n=>n.name==='沃德嘉园').aliases.includes('沃德家园'));
});

test('Mengxi only replaces six identified teaching footprints and preserves the rest of its campus',()=>{
  const c=load('reviewed-mengxi-campus.json'),s=LANDMARK_SITES[c.name];
  assert.equal(s.teachingSourceIds.length,6);assert.equal(s.sourceBuildingIndices.length,6);assert.ok(s.campusBuildingIndices.length>=15);
  for(const id of c.westTeachingIds){const b=rows.find(b=>b.id===id);assert.equal(b.height,21.6);assert.equal(b.levels,0);
    assert.equal(b.heightSource,'estimate');assert.equal(b.previousHeightReference.heightSource,'cnbh-raster');assert.equal(b.heightMatch,undefined);
    assert.ok(s.sourceBuildingIndices.includes(rows.indexOf(b)));}
  assert.ok(s.x>400&&s.x<550&&s.z>1550&&s.z<1650,'GCJ inverse must place the gate on the school south axis');
  const p=TELEPORT_LOCATIONS.mengxi;assert.equal(isWater(p.x,p.z),false);assert.equal(blockAt(p.x,p.z),null);
  assert.ok(LANDMARKS.some(l=>l.id==='mengxi'));assert.equal(LANDMARK_REFERENCES.mengxi.photos.length,2);
});

test('Mengxi red apron retains the green field hole without duplicate old generic sports polygons',()=>{
  const ss=GEO.urban.surfaces.filter(s=>s.sourceSiteId==='way/497849521');assert.equal(ss.length,5);
  const red=ss.find(s=>s.id.endsWith('/east-sport-apron'));assert.ok(red.polygons.some(p=>p.holes.length));
  assert.ok(ss.some(s=>s.kind==='infield'));assert.ok(ss.some(s=>s.kind==='court'));
  for(const id of ['way/497849393','way/1371978223'])assert.equal(GEO.urban.surfaces.some(s=>s.id===id),false);
  for(const s of ss){assert.equal(s.imageAcquired,null);assert.equal(s.referenceId,'amap-wode-rtmart-20261113');}
  const wode=GEO.urban.surfaces.filter(s=>s.sourceSiteId==='way/1321791085');
  assert.equal(wode.filter(s=>s.kind==='community-path').length,4);
  assert.ok(wode.some(s=>s.kind==='green'&&!s.id.startsWith('reviewed/wode/perimeter-')));
  assert.equal(wode.filter(s=>s.id.startsWith('reviewed/wode/perimeter-')&&s.kind==='green').length,4,'the four boundary planting belts join the estate ground');
  assert.ok(wode.length>=10);
  assert.ok(wode.some(s=>s.kind==='plaza'&&s.polygons.some(p=>p.holes.length)));
});

test('community photo references keep uncertain entrances unlocated while the located Sutong west gate stays evidence-based',()=>{
  for(const name of ['沃德嘉园','颖都家园','天下景城']){
    const c=COMMUNITY_DETAILS.communities.find(c=>c.name===name);assert.ok(c.photo?.referenceOnly);assert.equal(c.gate,undefined);assert.equal(c.photo.date,'未注明');
  }
  assert.equal(COMMUNITY_DETAILS.communities.find(c=>c.name==='沃德嘉园').photo.identityVisible,false);
  // 苏通花苑西门：2026-11 街景把胡记水饺(苏通花园34幢)与大润发东端立体车库同框，门址钉在 way/1321791101 西边界；坐标为近似，不再当作无门址参考。
  const sutong=COMMUNITY_DETAILS.communities.find(c=>c.name==='苏通花苑');
  assert.equal(sutong.photo.model,'sutongWest');assert.ok(sutong.gate);assert.equal(sutong.photo.date,'未注明');
  assert.match(sutong.photo.placementNote,/近似/);assert.equal(sutong.photo.referenceOnly,undefined);
});

test('Mengxi model uses six source bodies while its entrance leaves the central ground passage clear',()=>{
  class Mesh{constructor(){this.position={set(){}}}}
  const {buildMengxiCampus}=loadModule(readFileSync(new URL('../js/mengxi-campus.js',import.meta.url),'utf8'),{imports:{'three/webgpu':{Mesh,SphereGeometry:class{}}}});
  const s=LANDMARK_SITES['江苏省沭阳梦溪中学'],sources=[],solid=[],colliders=[],g={userData:{},add(){}};
  buildMengxiCampus({ctxFor:()=>({s,g}),sourceBody:(c,m,h)=>{sources.push(c.s.sourceId);colliders.push({maxY:h})},
    sourceEdges:()=>[],box:(c,m,x,y,z,w,h,d,o)=>{if(o.collide)solid.push({x,z,w,d});},sign(){},cyl(){},M:{},colliders});
  assert.deepEqual([...sources].sort(),[...s.teachingSourceIds].sort());assert.ok(colliders.every(c=>c.maxY===21.82));
  assert.ok(solid.every(b=>Math.abs(b.x)>b.w/2+1),'name wall, pillars and guardhouse leave the centre open');
});
