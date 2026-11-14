// Shared by the renderer and the offline vector curb-island builder. Keeping
// the same capped miter prevents a road bend from cutting into its sidewalk.
function roadRibbonEdges(points,width){
  const left=[],right=[],half=width/2;
  for(let i=0;i<points.length;i++){
    const p=points[i],prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    let dx=next.x-prev.x,dz=next.z-prev.z,L=Math.hypot(dx,dz)||1;
    let nx=-dz/L,nz=dx/L;
    if(i>0&&i<points.length-1){
      let ax=p.x-prev.x,az=p.z-prev.z,bx=next.x-p.x,bz=next.z-p.z;
      const la=Math.hypot(ax,az)||1,lb=Math.hypot(bx,bz)||1;ax/=la;az/=la;bx/=lb;bz/=lb;
      let mx=-az-bz,mz=ax+bx;L=Math.hypot(mx,mz)||1;mx/=L;mz/=L;
      const scale=Math.min(3,1/Math.max(.35,mx*(-az)+mz*ax));nx=mx*scale;nz=mz*scale;
    }
    left.push({x:p.x+nx*half,z:p.z+nz*half});right.push({x:p.x-nx*half,z:p.z-nz*half});
  }
  return{left,right};
}
function roadRibbonTriangles(points,width){
  const {left,right}=roadRibbonEdges(points,width),out=[];
  for(let i=0;i+1<points.length;i++)out.push([left[i],left[i+1],right[i]],[left[i+1],right[i+1],right[i]]);
  return out;
}
export {roadRibbonEdges,roadRibbonTriangles};
