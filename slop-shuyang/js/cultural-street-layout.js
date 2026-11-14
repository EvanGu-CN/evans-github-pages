import {CULTURAL_STREETS} from './cultural-streets-data.js';
import clipping from './vendor/polygon-clipping.js';
const points=r=>Array.from({length:r.length/2},(_,i)=>[r[i*2],r[i*2+1]]);
const STREET_MASK=clipping.union(...CULTURAL_STREETS.surfaces.flatMap(s=>s.polygons.map(p=>[points(p.outer),...p.holes.map(points)])));
const inside=(r,x,z)=>{let yes=false;for(let i=0,j=r.length-2;i<r.length;j=i,i+=2)if((r[i+1]>z)!==(r[j+1]>z)&&x<(r[j]-r[i])*(z-r[i+1])/(r[j+1]-r[i+1])+r[i])yes=!yes;return yes;};
const polygons=CULTURAL_STREETS.surfaces.flatMap(s=>s.polygons);
function culturalStreetAt(x,z,pad=0){
  const b=CULTURAL_STREETS.extent;if(x<b[0]-pad||x>b[2]+pad||z<b[1]-pad||z>b[3]+pad)return false;
  for(const p of polygons){
    if(inside(p.outer,x,z)&&!p.holes.some(h=>inside(h,x,z)))return true;
    if(pad>0)for(const r of [p.outer,...p.holes])for(let i=0,j=r.length-2;i<r.length;j=i,i+=2){
      const dx=r[i]-r[j],dz=r[i+1]-r[j+1],t=Math.max(0,Math.min(1,((x-r[j])*dx+(z-r[j+1])*dz)/(dx*dx+dz*dz||1)));
      if(Math.hypot(x-r[j]-t*dx,z-r[j+1]-t*dz)<pad)return true;
    }
  }return false;
}
function collectCulturalStreetTrees(existing=[],blockedAt=null){
  const chosen=[];
  for(const p of CULTURAL_STREETS.treeSites){
    if(blockedAt?.(p.x,p.z,.8))continue;
    if([...existing,...chosen].some(q=>Math.hypot(p.x-q.x,p.z-q.z)<5))continue;
    chosen.push(p);
  }return chosen;
}
export {STREET_MASK,culturalStreetAt,collectCulturalStreetTrees};
