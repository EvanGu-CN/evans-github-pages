import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {gableRoofPlan} from '../js/pitched-roofs.js';

const root=new URL('../',import.meta.url);
const bytes=readFileSync(new URL('tools/data/shuyang/buildings-enriched.json.gz',root));
const buildings=JSON.parse(gunzipSync(bytes)).buildings;
const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p.x*q.z-q.x*p.z;},0)/2);
const polyArea=p=>area(p.outer)-(p.holes||[]).reduce((s,r)=>s+area(r),0);
const records=[];
buildings.forEach((b,index)=>{
  if(b.roofShape!=='gabled')return;
  const polygons=b.polygons.map(p=>({outer:p.outer.map(([x,z])=>({x,z})),holes:(p.holes||[]).map(r=>r.map(([x,z])=>({x,z})))}));
  const plans=polygons.map(p=>gableRoofPlan(p,b.height,b.roofHeight));
  const sourceArea=polygons.reduce((s,p)=>s+polyArea(p),0),roofArea=plans.reduce((s,p)=>s+p.faces.reduce((a,f)=>a+polyArea(f),0),0);
  if(Math.abs(sourceArea-roofArea)>.001)throw Error('Gable coverage mismatch: '+b.id);
  records.push({index,id:b.id,height:b.height,roofShape:b.roofShape,roofHeight:b.roofHeight,
    sourceAreaM2:sourceArea,projectedRoofAreaM2:roofArea,planePolygons:plans.reduce((s,p)=>s+p.faces.length,0),
    eaveHeights:plans.map(p=>p.eaveHeight),axes:plans.map(p=>p.axis),
    status:'source-estimate-rendered; ridge orientation and roof form not individually photo-verified'});
});
const output={sourceBuildings:buildings.length,gabledSources:records.length,planePolygons:records.reduce((s,r)=>s+r.planePolygons,0),
  sourceDigest:createHash('sha256').update(bytes).digest('hex'),
  limits:'Geometry rendering audit only. Existing gabled tags, roof heights, tile scale and inferred long-axis ridge are display estimates; this is not a completed photo reconstruction of these buildings.',records};
writeFileSync(new URL('docs/refinement/roof-coverage.json',root),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({...output,records:undefined},null,2));
