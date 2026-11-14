import * as clipping from './vendor/polygon-clipping.js';

// The existing roof tag/height is an estimate, not a surveyed ridge. A single
// long-axis gable is clipped to the exact source (including notches and holes).
// Each resulting polygon lies on one plane, so triangulation cannot flatten
// the ridge or stretch a roof across a courtyard.
function gableRoofPlan(polygon,height,roofHeight){
  if(!(height>0&&roofHeight>0)||polygon.outer.length<3)return null;
  const p=polygon.outer;let best=null;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],L=Math.hypot(b.x-a.x,b.z-a.z);
    if(L<1e-6)continue;
    let ux=(b.x-a.x)/L,uz=(b.z-a.z)/L;
    const bounds=(ux,uz)=>{
      const u=p.map(q=>q.x*ux+q.z*uz),v=p.map(q=>-q.x*uz+q.z*ux);
      return {u0:Math.min(...u),u1:Math.max(...u),v0:Math.min(...v),v1:Math.max(...v)};
    };
    let r=bounds(ux,uz);
    if(r.u1-r.u0<r.v1-r.v0){[ux,uz]=[-uz,ux];r=bounds(ux,uz);}
    const area=(r.u1-r.u0)*(r.v1-r.v0);
    if(area>1e-6&&(!best||area<best.area-1e-5))best={ux,uz,...r,area};
  }
  if(!best||best.v1-best.v0<1e-5)return null;
  const {ux,uz,u0,u1,v0,v1}=best,ridgeV=(v0+v1)/2,halfDepth=(v1-v0)/2;
  const rise=Math.min(roofHeight,height*.25),top=height+.22,eaveHeight=top-rise;
  const at=(u,v)=>[ux*u-uz*v,uz*u+ux*v];
  const source=[polygon.outer,...(polygon.holes||[])].map(r=>r.map(q=>[q.x,q.z]));
  const faces=[];
  for(const [lo,hi] of [[v0-1,ridgeV],[ridgeV,v1+1]]){
    const region=[[at(u0-1,lo),at(u1+1,lo),at(u1+1,hi),at(u0-1,hi)]];
    for(const poly of clipping.default.intersection(source,region)){
      const rings=poly.map(r=>r.slice(0,-1).map(([x,z])=>({x,z})));
      if(rings[0].length>=3)faces.push({outer:rings[0],holes:rings.slice(1)});
    }
  }
  return {axis:[ux,uz],ridgeV,halfDepth,rise,eaveHeight,faces,
    across:(x,z)=>-x*uz+z*ux-ridgeV,
    heightAt:(x,z)=>top-rise*Math.min(1,Math.abs(-x*uz+z*ux-ridgeV)/halfDepth)};
}

export {gableRoofPlan};
