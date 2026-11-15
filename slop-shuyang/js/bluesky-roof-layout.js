import {BLUESKY_ROOF as R} from './bluesky-roof-data.js';
const points=r=>r.map(([x,z])=>({x,z}));
function blueskyRoofSurfaces(){
  return [{name:'蓝天楼顶·露台铺面',material:'paving',outer:points(R.terrace),holes:[...R.beds,R.darkPanel].map(points),y:R.roofBase},
    ...R.beds.map((r,i)=>({name:'蓝天楼顶·近似绿化区'+(i+1),material:'green',outer:points(r),holes:[],y:R.roofBase+.35})),
    {name:'蓝天楼顶·深色矩形区',material:'dark',outer:points(R.darkPanel),holes:[],y:R.roofBase+.015}];
}
function blueskyRoofPavilion(){
  const ring=points(R.pavilion),center={x:ring.reduce((s,p)=>s+p.x,0)/ring.length,y:R.pavilionTop,z:ring.reduce((s,p)=>s+p.z,0)/ring.length};
  const top=[],walls=[];
  for(let i=0;i<ring.length;i++){
    const a={...ring[i],y:R.pavilionRim},b={...ring[(i+1)%ring.length],y:R.pavilionRim};
    const crossY=(b.z-a.z)*(center.x-a.x)-(b.x-a.x)*(center.z-a.z);
    top.push(...(crossY>0?[a,b,center]:[b,a,center]));
    const lowA={...a,y:R.bodyTop},lowB={...b,y:R.bodyTop};
    // Reverse side triangles when the source trace is counterclockwise in x/z.
    walls.push(...(crossY>0?[lowA,lowB,a,lowB,b,a]:[lowA,a,lowB,lowB,a,b]));
  }
  return{ring,center,top,walls};
}
export {BLUESKY_ROOF} from './bluesky-roof-data.js';
export {blueskyRoofSurfaces,blueskyRoofPavilion};
