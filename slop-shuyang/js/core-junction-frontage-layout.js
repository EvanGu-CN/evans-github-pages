import {CORE_JUNCTION_FRONTAGE as F} from './core-junction-frontage-data.js';
import {polygonContains,polygonBoxOverlaps} from './building-collision.js';
const points=r=>Array.from({length:r.length/2},(_,i)=>({x:r[i*2],z:r[i*2+1]}));
const CORE_FRONTAGE_POLYGONS=F.surfaces.flatMap(s=>s.polygons.map(p=>({outer:points(p.outer),holes:p.holes.map(points)})));
function coreFrontageAt(x,z,pad=0){
  const b=F.extent;if(x<b[0]-pad||x>b[2]+pad||z<b[1]-pad||z>b[3]+pad)return false;
  return CORE_FRONTAGE_POLYGONS.some(p=>pad?polygonBoxOverlaps(p,x,z,pad,pad):polygonContains(p,x,z));
}
const coreFrontageHeightAt=(x,z)=>coreFrontageAt(x,z)?F.height:null;
export {CORE_FRONTAGE_POLYGONS,coreFrontageAt,coreFrontageHeightAt};
