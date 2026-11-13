import assert from 'node:assert/strict';
import test from 'node:test';
import {preserveBuildingCoverage} from '../js/building-coverage.js';
const rect=(x0,z0,x1,z1)=>({outer:[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}],holes:[]});
const building=(polygons)=>({minX:0,minZ:0,maxX:100,maxZ:100,cx:50,cz:50,height:18,polygons});
const collider=(minX,minZ,maxX,maxZ,polygon)=>({minX,minZ,maxX,maxZ,minY:0,maxY:12,polygon});

test('touching a small landmark wing preserves the rest of a real source building',()=>{
  const b=building([rect(0,0,100,100)]);
  const {rendered,audit}=preserveBuildingCoverage([b],new Set(),[collider(0,0,10,100)]);
  assert.equal(rendered.length,1);
  assert.equal(rendered[0].sourceRecord,b);
  assert.equal(rendered[0].minX,10);
  assert.equal(audit.clipped[0].retainedAreaM2,9000);
  assert.equal(audit.replacedByLandmarks,0);
  assert.equal(b.minX,0,'source data is not mutated');
});

test('rotated or concave colliders use their polygon instead of deleting the full bounding box',()=>{
  const b=building([rect(0,0,100,100)]);
  const p={outer:[{x:0,z:0},{x:100,z:0},{x:0,z:100}],holes:[]};
  const {audit,rendered}=preserveBuildingCoverage([b],new Set(),[collider(0,0,100,100,p)]);
  assert.equal(rendered.length,1);
  assert.equal(audit.clipped[0].retainedAreaM2,5000);
});

test('courtyard holes remain open, while fully replaced buildings are counted explicitly',()=>{
  const p=rect(0,0,100,100);p.holes=[rect(20,20,80,80).outer];
  const b=building([p]);
  const untouched=preserveBuildingCoverage([b],new Set(),[collider(30,30,50,50)]);
  assert.equal(untouched.rendered[0],b);
  const replaced=preserveBuildingCoverage([b],new Set([b]),[]);
  assert.equal(replaced.rendered.length,0);
  assert.deepEqual(replaced.audit.explicitReplacements,[0]);
  assert.equal(replaced.audit.source,replaced.audit.rendered+replaced.audit.replacedByLandmarks);
});

test('source-footprint bodies do not erase neighbouring records and low paving is not a building cutter',()=>{
  const b=building([rect(0,0,100,100)]);
  for(const c of [{...collider(0,0,50,50),sourceFootprint:true},{...collider(0,0,50,50),maxY:.4}]){
    const {rendered}=preserveBuildingCoverage([b],new Set(),[c]);
    assert.equal(rendered[0],b);
  }
});
