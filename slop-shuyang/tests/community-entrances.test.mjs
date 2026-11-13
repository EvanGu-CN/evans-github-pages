import assert from 'node:assert/strict';
import test from 'node:test';
import {COMMUNITY_DETAILS as details} from '../js/community-data.js';
import {GEO} from '../js/shuyang-geodata.js';

test('every mapped community has an explicit photo and access review state',()=>{
  assert.equal(details.communities.length,GEO.neighborhoods.length);
  assert.deepEqual(details.communities.map(c=>c.id).sort(),GEO.neighborhoods.map(n=>n.id).sort());
  for(const c of details.communities){
    const n=GEO.neighborhoods.find(n=>n.id===c.id);
    assert.equal(c.name,n.name);assert.equal(c.buildingCount,n.buildings.length);
    assert.ok(['reviewed','not-yet-reviewed'].includes(c.photoStatus));
  }
});

test('photo-guided gate placements remain on a mapped community boundary and vehicle access',()=>{
  const gates=details.communities.filter(c=>c.gate);assert.ok(gates.length>=2);
  for(const c of gates){
    const p=c.gate,n=GEO.neighborhoods.find(n=>n.id===c.id);
    assert.ok(c.photo.image.startsWith('https://'));assert.equal(c.photo.date,'未注明');
    assert.ok(p.roadId&&['service','living_street'].includes(p.accessKind));
    assert.ok(p.width>=4);assert.ok(Number.isFinite(p.heading));
    let distance=Infinity;
    for(const polygon of n.polygons){const r=polygon.outer;
      for(let i=0;i<r.length;i+=2){const j=(i+2)%r.length,dx=r[j]-r[i],dz=r[j+1]-r[i+1];
        const t=Math.max(0,Math.min(1,((p.x-r[i])*dx+(p.z-r[i+1])*dz)/(dx*dx+dz*dz)));
        distance=Math.min(distance,Math.hypot(p.x-r[i]-t*dx,p.z-r[i+1]-t*dz));
      }
    }
    assert.ok(distance<.3,c.name+' uses a boundary crossing');
    assert.match(c.photo.placementNote,/近似/,'photo association is not misrepresented as surveyed');
  }
});

test('unlocated reviewed entrances are retained as references without invented world gates',()=>{
  for(const name of ['凤凰国际城','城市枫林西区','宁浦·冠城']){
    const c=details.communities.find(c=>c.name===name);
    assert.equal(c.photoStatus,'reviewed');assert.ok(c.photo);assert.equal(c.gate,undefined);
  }
});

test('map photo candidates retain their review state and known mismatched images are excluded',()=>{
  assert.equal(details.communities.filter(c=>c.mapContext?.queryStatus==='complete').length,141);
  assert.equal(details.audit.withMapPhotoCandidates,127);
  const wrong='https://store.is.autonavi.com/showpic/1ed9aa0c3862a6cb5816029ddbdcbf4c';
  for(const c of details.communities){
    for(const m of c.mapContext?.matches||[]){
      assert.ok(m.distanceOutsideBoundaryM<=80);assert.ok(m.poiId&&m.coordinateNote.includes('不是实测入口'));
      for(const p of m.photos){assert.notEqual(p.image,wrong);assert.ok(['unreviewed','reviewed-reference'].includes(p.reviewStatus));
        if(p.reviewStatus==='unreviewed')assert.match(p.caption,/尚未逐张核对/)}
    }
    if(c.photoStatus==='not-yet-reviewed')assert.equal(c.gate,undefined,'unreviewed API images never create a gate');
  }
});

test('new named entrance photos preserve unknown dates and mapped access constraints',()=>{
  for(const name of ['紫藤花园','东方明珠城']){const c=details.communities.find(c=>c.name===name);
    assert.ok(c.gate);assert.equal(c.photo.date,'未注明');assert.ok(c.gate.streetDistance<40);
    assert.equal(c.photoStatus,'reviewed');assert.ok(c.photo.caption.length>20)}
});
