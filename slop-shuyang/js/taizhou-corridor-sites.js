import {TAIZHOU_CORRIDOR} from './taizhou-corridor-data.js';
import {GEO} from './shuyang-geodata.js';

const noPlant=TAIZHOU_CORRIDOR.surfaces.filter(s=>s.kind==='cycleway'||s.kind==='walkway'||s.kind.includes('curb')).flatMap(s=>s.polygons).map(p=>{
  const xs=p.outer.filter((_,i)=>i%2===0),zs=p.outer.filter((_,i)=>i%2===1);
  return{...p,bounds:[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)]};
});
const motorSegments=GEO.roadReviews.flatMap(r=>{
  const p=GEO.roads[r.index][6],result=[];
  for(let i=2;i<p.length;i+=2)result.push([p[i-2],p[i-1],p[i],p[i+1],r.width/2]);return result;
});
const distance=(x,z,a,b,c,d)=>{
  const dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a-t*dx,z-b-t*dz);
};
const inside=(r,x,z)=>{
  let yes=false;for(let i=0,j=r.length-2;i<r.length;j=i,i+=2)if((r[i+1]>z)!==(r[j+1]>z)&&x<(r[j]-r[i])*(z-r[i+1])/(r[j+1]-r[i+1])+r[i])yes=!yes;return yes;
};
function taizhouNoPlantAt(x,z,pad=.7){
  const e=TAIZHOU_CORRIDOR.extent;
  if(x<e[0]-pad||x>e[2]+pad||z<e[1]-pad||z>e[3]+pad)return false;
  if(motorSegments.some(s=>distance(x,z,...s.slice(0,4))<s[4]+pad))return true;
  for(const p of noPlant){
    const b=p.bounds;if(x<b[0]-pad||x>b[2]+pad||z<b[1]-pad||z>b[3]+pad)continue;
    if(inside(p.outer,x,z)&&!p.holes.some(h=>inside(h,x,z)))return true;
    for(const r of [p.outer,...p.holes])for(let i=0,j=r.length-2;i<r.length;j=i,i+=2){
      if(distance(x,z,r[j],r[j+1],r[i],r[i+1])<pad)return true;
    }
  }
  return false;
}

// Candidates already lie inside clipped green polygons. Avoid trunks near
// existing park/street trees and the runtime building collision pads as well.
function collectTaizhouTreeSites(existing=[],blockedAt=null){
  const chosen=[],grid=new Map(),cell=8,key=(x,z)=>`${Math.floor(x/cell)},${Math.floor(z/cell)}`;
  const insert=p=>{const k=key(p.x,p.z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);};
  existing.forEach(insert);
  for(const p of TAIZHOU_CORRIDOR.treeSites){
    if(blockedAt?.(p.x,p.z,1.35))continue;
    const ix=Math.floor(p.x/cell),iz=Math.floor(p.z/cell);let near=false;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      if((grid.get(`${ix+dx},${iz+dz}`)||[]).some(q=>Math.hypot(p.x-q.x,p.z-q.z)<6))near=true;
    }
    if(near)continue;chosen.push(p);insert(p);
  }
  return chosen;
}
export {collectTaizhouTreeSites,taizhouNoPlantAt};
