import * as THREE from 'three/webgpu';

// Exact source footprints, photo-guided typology. Heights are display estimates.
function buildMengxiCampus({ctxFor,box,cyl,sign,M,sourceBody,sourceEdges,edgePanel,colliders}){
  const c=ctxFor('江苏省沭阳梦溪中学');if(!c)return;
  c.g.userData.photoBasis='AMap B0FFIJI7DY: white/grey teaching wings and stone name wall with steel canopy; capture date unknown';
  for(const id of c.s.teachingSourceIds){
    const cc={...c,s:{...c.s,sourceId:id}},start=colliders.length;
    sourceBody(cc,M.white,c.s.bodyHeight);
    for(const collider of colliders.slice(start))collider.maxY=c.s.teachingHeight+.22;
    for(const e of sourceEdges(cc)){
      if(e.L<8)continue;
      // Six visible floor bands on the reference typology; no invented wing numbers.
      for(let floor=0;floor<6;floor++){
        edgePanel(c,e,M.darkStone,.5+floor*3.3,.38,e.L,.18);
        for(let u=-e.L/2+2;u<e.L/2-1;u+=3.5){
          box(c,M.glass,e.x+e.tx*u+e.nx*.21,1.25+floor*3.3,e.z+e.tz*u+e.nz*.21,2.2,1.7,.22,{ry:e.ry,collide:false});
        }
      }
      edgePanel(c,e,M.white,19.85,.28,e.L,.12);
      edgePanel(c,e,M.white,21.3,.3,e.L,.12);
      for(let u=-e.L/2+.3;u<e.L/2;u+=4.5)
        box(c,M.white,e.x+e.tx*u,20.1,e.z+e.tz*u,.3,1.2,.3,{ry:e.ry,collide:false});
    }
  }
  const f=c.s.front,L=Math.hypot(f.x,f.z),fx=f.x/L,fz=f.z/L,tx=fz,tz=-fx,ry=Math.atan2(fx,fz);
  const at=(u,v)=>({x:tx*u+fx*v,z:tz*u+fz*v});
  const b=(mat,u,y,v,w,h,d,solid=false)=>{const p=at(u,v);return box(c,mat,p.x,y,p.z,w,h,d,{ry,collide:solid})};
  // West name wall and east cantilever canopy leave the central approach open.
  b(M.stone,-20,.22,0,28,2.65,1,true);
  const title=at(-20,.56);sign(c,'江苏省沭阳梦溪中学',title.x,1.75,title.z,25,1.1,ry,'#b8b2a4','#9c2727');
  b(M.white,17,6.7,-2,29,.45,12);
  for(const u of [4,30]){
    b(M.white,u,.22,-6,1.05,6.5,1.05,true);
    b(M.frame,u,5.7,-2,.25,.8,11.5);
  }
  for(let u=3;u<=31;u+=3.5)b(M.frame,u,6.05,-2,.18,.65,11.5);
  b(M.frame,17,5.9,3.8,29,.16,.18);
  b(M.white,35,.22,-3,6,3,6,true);
  const police=at(35,.12);sign(c,'警务室',police.x,2.5,police.z,4.8,.8,ry,'#254c78','#ffffff');
  for(const u of [-31,-23,-15,-7]){
    const p=at(u,3);const sphere=new THREE.Mesh(new THREE.SphereGeometry(.45,10,8),M.stone);
    sphere.position.set(p.x,.67,p.z);sphere.castShadow=true;c.g.add(sphere);
  }
}
export {buildMengxiCampus};
