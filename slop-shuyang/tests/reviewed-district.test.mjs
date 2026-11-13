import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {GEO} from '../js/shuyang-geodata.js';
import {LANDMARKS,LANDMARK_SITES,PARK_FOOTBRIDGES,getParkFootbridgeHeight,isOnBridge,isWater} from '../js/city-config.js';
import {COMMUNITY_DETAILS} from '../js/community-data.js';
import clip from '../js/vendor/polygon-clipping.js';

const load=name=>JSON.parse(readFileSync(new URL('../tools/data/shuyang/'+name,import.meta.url)));
const enriched=JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/shuyang/buildings-enriched.json.gz',import.meta.url))));
const area=ring=>Math.abs(ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-q[0]*p[1]},0)/2);
const multiArea=ps=>ps.reduce((a,p)=>a+area(p[0])-p.slice(1).reduce((s,h)=>s+area(h),0),0);
const shape=b=>b.polygons.map(p=>[p.outer,...p.holes]);
const bound=b=>{const p=b.polygons.flatMap(p=>p.outer);return [Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1])),Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))]};
const added=enriched.buildings.filter(b=>b.source==='ReviewedImagery');

test('reviewed additions retain image acquisition date and estimated heights, separately from service publication',()=>{
  assert.ok(added.length>=30);
  const refs=load('reviewed-buildings.geojson'),ids=new Set(refs.features.map(f=>f.properties.id));
  assert.equal(refs.reference.imageAcquired,'2021-01-29');assert.match(refs.reference.serviceRelease,/2026/);
  for(const b of added){assert.ok(ids.has(b.id));
    assert.equal(b.geometryReference.imageDate,refs.features.find(f=>f.properties.id===b.id).properties.referenceImageDate);
    assert.equal(b.heightSource,'estimate');assert.equal(b.heightMatch,undefined);assert.equal(b.levels,0);
    assert.ok(GEO.mapBuildings.some(p=>p.id===b.id&&p.s==='ReviewedImagery'))}
  assert.equal(enriched.buildings.filter(b=>b.source!=='ReviewedImagery').length,7558,'existing pinned source records remain present');
});

test('online outlines retain unknown imagery date and converted coordinates, with separate southern community names',()=>{
  const online=added.filter(b=>b.geometryReference.referenceId==='amap-wuyue-south-20261113');
  assert.equal(online.length,21);
  for(const b of online){
    assert.equal(b.geometryReference.imageDate,null);
    assert.match(b.geometryReference.retrievedAt,/^2026-11-13/);
    assert.equal(b.geometryReference.referenceId,'amap-wuyue-south-20261113');
    assert.equal(b.heightSource,'estimate');assert.equal(b.levels,0);
  }
  const palace=online.find(b=>b.id.endsWith('/workers-palace'));
  assert.match(palace.name,/工人文化宫/);
  const site=LANDMARK_SITES[palace.name];
  assert.ok(site.x>1900&&site.x<2200&&site.z>2900&&site.z<3200,'GCJ coordinates must not be used as WGS84');
  assert.equal(enriched.buildings[site.sourceBuildingIndices[0]].id,palace.id);
  assert.ok(LANDMARKS.find(l=>l.id==='workersPalace'));
  const a=GEO.neighborhoods.find(n=>n.name==='华辰大厦小区'),b=GEO.neighborhoods.find(n=>n.name==='幸福家园1期');
  assert.ok(a&&b&&a.id!==b.id);assert.ok(b.buildings.length>=18);
  assert.ok(a.z<b.z,'street strip stays north of the inner residential rows');
  for(const n of [a,b]){
    assert.equal(n.scope,'approximate-context');assert.equal(n.referenceImageDate,null);
    assert.match(n.boundarySource,/not an official/);
    const photo=COMMUNITY_DETAILS.communities.find(c=>c.id===n.id);
    assert.equal(photo.photo.referenceOnly,true);assert.equal(photo.gate,undefined);
  }
  const plaza=GEO.urban.surfaces.find(s=>s.id==='reviewed/online/workers-palace/plaza');
  assert.ok(plaza&&plaza.polygons.length);assert.equal(plaza.imageAcquired,null);
  assert.match(plaza.referenceRetrievedAt,/^2026-11-13/);
  const pairs=r=>Array.from({length:r.length/2},(_,i)=>[r[i*2],r[i*2+1]]);
  const geometry=plaza.polygons.map(p=>[p.outer,...p.holes].map(pairs));
  assert.equal(multiArea(clip.intersection(geometry,shape(palace))),0,'paving does not overlap the source building');
});

test('supplemental roofprints do not duplicate existing buildings or each other after quantization',()=>{
  const records=enriched.buildings.map(b=>({b,bounds:bound(b)}));
  for(const a of added){const ab=bound(a),ag=shape(a);
    for(const {b,bounds:bb} of records){if(a===b||ab[0]>=bb[2]||ab[2]<=bb[0]||ab[1]>=bb[3]||ab[3]<=bb[1])continue;
      const bg=shape(b),overlap=multiArea(clip.intersection(ag,bg));
      if(a.geometryReference.replacesSourceIds?.includes(b.id)){
        assert.ok(overlap/multiArea(bg)>=.8&&multiArea(ag)>=2*multiArea(bg),'only a substantially covered partial source may be explicitly bound');
        assert.ok(Object.values(LANDMARK_SITES).some(s=>{const ids=(s.sourceBuildingIndices||[]).map(i=>enriched.buildings[i].id);return ids.includes(a.id)&&ids.includes(b.id)}));
        continue;
      }
      assert.ok(overlap<=Math.min(multiArea(ag),multiArea(bg))*.22+2,a.id+' overlaps '+b.id)}
  }
});

test('Junlin numbered outlines and Huachen complete towers preserve original partial data and date uncertainty',()=>{
  const j=added.filter(b=>b.id.startsWith('reviewed/online/junlin/'));
  assert.equal(j.length,27);assert.equal(j.filter(b=>/^君临天下\d+号楼$/.test(b.name)).length,24);
  const units=GEO.namedSites.filter(s=>/^君临天下\d+号楼$/.test(s.name));assert.equal(units.length,24);
  assert.ok(units.every(s=>s.labelScope==='building-unit'&&s.scope==='building'),'unit visibility must not erase searchable building identities');
  const n=GEO.neighborhoods.find(n=>n.name==='君临天下');assert.ok(n&&n.buildings.length>=25);
  assert.equal(n.referenceId,'amap-junlin-huachen-20261113');
  for(const b of j){assert.equal(b.geometryReference.imageDate,null);assert.equal(b.levels,0);assert.equal(b.heightSource,'estimate');}
  const model=LANDMARK_SITES['华辰大厦沿街楼群'];assert.equal(model.towerParts.length,2);
  assert.equal(model.sourceBuildingIndices.length,4);assert.equal(model.heightSource,'photo/satellite proportion estimates, floor counts unknown');
  const bound=added.find(b=>b.id==='reviewed/online/huachen/02');
  assert.deepEqual(bound.geometryReference.replacesSourceIds,['1f3ce979-3701-4115-870e-3d42e2d11918']);
  assert.ok(enriched.buildings.some(b=>b.id==='1f3ce979-3701-4115-870e-3d42e2d11918'),'original partial source is retained');
  assert.equal(model.podiumHeight,8);assert.equal(model.towerHeight,78);
  const paths=GEO.urban.surfaces.filter(s=>s.sourceSiteId==='reviewed/junlin');assert.equal(paths.length,7);
  for(const s of paths){assert.equal(s.kind,'community-path');assert.equal(s.imageAcquired,null);assert.ok(s.polygons.length);}
  const photo=COMMUNITY_DETAILS.communities.find(c=>c.name==='君临天下');
  assert.equal(photo.photo.referenceOnly,true);assert.equal(photo.gate,undefined);
});

test('new named communities expose approximate boundaries and never invent a gate from a photograph',()=>{
  for(const name of ['盛源金城','临安小区']){
    const n=GEO.neighborhoods.find(n=>n.name===name),c=COMMUNITY_DETAILS.communities.find(c=>c.name===name);
    assert.ok(n&&n.buildings.length>10);assert.equal(n.source,'ReviewedImagery');assert.equal(n.scope,'approximate-context');
    assert.match(n.boundarySource,/not an official/);assert.ok(n.photoStyle);assert.ok(c.boundarySource);
    assert.equal(c.photoStatus,'reviewed');assert.equal(c.photo.referenceOnly,true);assert.equal(c.gate,undefined);
  }
});

test('Rose Garden supplemental outlines preserve dated pixel provenance, original source conflicts and unlocated gate status',()=>{
  const traced=load('reviewed-buildings.geojson').features.filter(f=>f.properties.id.startsWith('reviewed/wuyue/rose-garden/'));
  const accepted=added.filter(b=>b.id.startsWith('reviewed/wuyue/rose-garden/'));
  assert.equal(traced.length,18);assert.equal(accepted.length,16);
  for(const f of traced){assert.ok(f.properties.referencePixels.length>=6);assert.equal(f.properties.geometrySource,'manually-reviewed-roof-outline');}
  for(const b of accepted){assert.equal(b.heightSource,'estimate');assert.equal(b.levels,0);assert.equal(b.photoLevelsEstimate,0);
    assert.equal(b.geometryReference.imageDate,'2021-01-29');assert.equal(b.geometrySource,'manually-reviewed-roof-outline');}
  const decisions=GEO.buildingAudit.reviewedImagery.decisions.filter(d=>d.traceId.startsWith('reviewed/wuyue/rose-garden/'));
  assert.equal(decisions.filter(d=>d.status==='accepted').length,16);
  for(const d of decisions.filter(d=>d.status==='rejected-overlap'))for(const conflict of d.conflicts)
    assert.ok(enriched.buildings.some(b=>b.id===conflict.sourceId),'overlapping original record remains present');
  const c=COMMUNITY_DETAILS.communities.find(c=>c.name==='嘉瑞·玫瑰园');
  assert.equal(c.photoStatus,'reviewed');assert.equal(c.photo.referenceOnly,true);assert.equal(c.gate,undefined);
  assert.match(c.photo.caption,/不据此统一全小区层数/);
});

test('school sports grounds use actual mapped outlines, while historic and ecological Yuji parks stay distinct',()=>{
  for(const id of ['way/497324861','way/497324863'])assert.ok(GEO.urban.surfaces.some(s=>s.id===id&&s.kind==='sports-ground'&&s.polygons.length));
  const park=LANDMARKS.find(l=>l.id==='yujiPark'),eco=LANDMARKS.find(l=>l.id==='yuji');
  assert.ok(park&&eco);assert.ok(Math.hypot(park.x-eco.x,park.z-eco.z)>2500);
  assert.equal(LANDMARK_SITES[park.name].preserveParkLandscape,true);
  assert.equal(LANDMARK_SITES[park.name].sourceBuildingIndices,undefined,'unknown monument anchors do not erase park buildings');
});

test('Wuli sports surfaces retain the observed track hole, infield and six courts without assigning an unverified sport',()=>{
  const ss=GEO.urban.surfaces.filter(s=>s.sourceSiteId==='way/1372583933');
  const track=ss.find(s=>s.kind==='running-track'),field=ss.find(s=>s.kind==='infield');
  assert.ok(track&&field);assert.ok(track.polygons.some(p=>p.holes.length));
  const pairs=r=>{const out=[];for(let i=0;i<r.length;i+=2)out.push([r[i],r[i+1]]);return out};
  const geom=s=>s.polygons.map(p=>[p.outer,...p.holes].map(pairs));
  assert.ok(multiArea(geom(track))>1000);assert.ok(multiArea(geom(field))>1500);
  assert.ok(multiArea(clip.intersection(geom(track),geom(field)))<2,'red track must not cover the infield');
  const courts=ss.filter(s=>/^reviewed\/wuli\/court-\d+$/.test(s.id));assert.equal(courts.length,6);
  for(const s of ss){assert.equal(s.source,'ReviewedImagery');assert.equal(s.imageAcquired,'2021-01-29');
    assert.match(s.appearanceSource,/sport and lane count unconfirmed/);assert.equal(s.sport,undefined);}
  assert.equal(GEO.namedSites.find(s=>s.id==='way/1372583933').kind,'sports');
});

test('four mapped Nanhu footbridges offer narrow walking decks without allowing cars over lake water',()=>{
  assert.equal(PARK_FOOTBRIDGES.length,4);
  for(const b of PARK_FOOTBRIDGES){
    const a=b.points[0],c=b.points[1],x=(a.x+c.x)/2,z=(a.z+c.z)/2,L=Math.hypot(c.x-a.x,c.z-a.z);
    assert.equal(getParkFootbridgeHeight(x,z),.38);assert.equal(isOnBridge(x,z,'person'),true);
    assert.equal(isWater(x,z),true,'mapped bridge must span the reviewed channel');
    assert.equal(isOnBridge(x,z,'cyclist'),true);assert.equal(isOnBridge(x,z,'car'),false);
    const nx=-(c.z-a.z)/L,nz=(c.x-a.x)/L;
    assert.equal(getParkFootbridgeHeight(x+nx*(b.width/2+1),z+nz*(b.width/2+1)),null);
  }
});

test('reviewed Nanhu water retains islands and peninsulas in collision, park lawn and precise ground',()=>{
  const source=load('reviewed-water.json'),r=source.reference;
  assert.equal(r.imageAcquired,'2021-12-10');assert.equal(r.providerAccuracyMetres,5);
  const [x0,y0,x1,y1]=r.extent3857,[w,h]=r.imageSize;
  const at=(px,py)=>{const mx=x0+px/w*(x1-x0),my=y1-py/h*(y1-y0);
    const lon=mx/6378137*180/Math.PI,lat=(2*Math.atan(Math.exp(my/6378137))-Math.PI/2)*180/Math.PI;
    return [(lon-118.774)*111320*Math.cos(34.1285*Math.PI/180),-(lat-34.1285)*110574]};
  const inside=(ring,[x,z])=>{let yes=false;for(let i=0,j=ring.length-2;i<ring.length;j=i,i+=2)
    if((ring[i+1]>z)!==(ring[j+1]>z)&&x<(ring[j]-ring[i])*(z-ring[i+1])/(ring[j+1]-ring[i+1])+ring[i])yes=!yes;return yes};
  const covers=(polys,p)=>polys.some(r=>inside(r[0],p)&&!r.slice(1).some(h=>inside(h,p)));
  const land=GEO.water.groundPatches.flatMap(p=>p.land);
  const parks=GEO.parks.flatMap(p=>p.landPolygons);
  for(const pixel of [[400,500],[470,650],[705,360],[205,700]]){
    const p=at(...pixel);assert.equal(isWater(...p),true,`lake at ${pixel}`);
    assert.equal(covers(land,p),false,'no coarse land cap inside precise lake');
    assert.equal(covers(parks,p),false,'park lawn must leave water visible');
  }
  for(const pixel of [[290,625],[315,450],[570,450],[440,110]]){
    const p=at(...pixel);assert.equal(isWater(...p),false,`island/peninsula at ${pixel}`);
  }
  const island=at(290,625);assert.equal(covers(land,island),true,'island remains solid ground');
  assert.ok(source.polygons.some(p=>p.rings.length>1));
  for(const id of ['reviewed/nanhu/north-plaza','reviewed/nanhu/south-plaza'])
    assert.ok(GEO.urban.surfaces.some(s=>s.id===id&&s.source==='ReviewedImagery'&&s.imageAcquired==='2021-12-10'));
  assert.equal(LANDMARK_SITES['南湖公园'].preserveParkLandscape,true);
});
