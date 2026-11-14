import * as THREE from 'three/webgpu';
import { buildJiushengPrecinct } from './jiusheng-precinct.js';

// Named, positioned source buildings with independently checked exterior photos.
// Storey-derived heights are explicitly approximate in the reference gallery.
function buildCorePhotoBuildings({ctxFor,box,cyl,sign,M,sourceBody,sourceEdges,edgePanel}) {
  const stone=new THREE.MeshStandardNodeMaterial({color:0xc1bcb1,roughness:.8});
  const brown=new THREE.MeshStandardNodeMaterial({color:0x554039,roughness:.75});
  const c=ctxFor('万豪商务大厦');
  if(c){
    c.g.userData.photoBasis='JD bankruptcy exterior; 24±1 visible storeys; height is a photo estimate';
    sourceBody(c,stone,15.8);
    const edges=sourceEdges(c),north=edges.reduce((a,b)=>b.nz<a.nz?b:a);
    for(const e of edges){
      edgePanel(c,e,M.glass,.5,14.5,e.L-1);
      for(let y=4;y<16;y+=3.8)edgePanel(c,e,stone,y,.55,e.L,.8);
      for(let k=2;k<e.L;k+=7.5)box(c,stone,e.x+e.tx*(k-e.L/2)+e.nx*.9,.3,e.z+e.tz*(k-e.L/2)+e.nz*.9,.8,15.5,.5,{ry:e.ry,collide:false});
    }
    // The tower is narrower than the surveyed podium; the exact tower roofprint
    // is not mapped. Keep it inside the podium and mark its dimensions estimated.
    box(c,stone,0,15.8,4,41,68,34,{residential:true,levels:20,ry:north.ry});
    box(c,stone,0,83.8,4,34,3,29,{residential:true,levels:1,ry:north.ry});
    box(c,stone,0,86.8,4,25,3.2,24,{residential:true,levels:1,ry:north.ry});
    for(const side of [-1,1])box(c,M.darkStone,0,16,4+side*17.2,1.4,68,.4,{collide:false});
    sign(c,'苏州银行',north.x+north.nx*1.1,2.8,north.z+north.nz*1.1,25,2.2,north.facing,'#eeeae0','#326b51');
  }
  const j=ctxFor('久盛百货');
  if(j){
    j.g.userData.photoBasis='2019 Shuyang official west-square photos, not the neighbouring yellow east building';
    sourceBody(j,M.offWhite,16);
    const edges=sourceEdges(j);
    edges.forEach((e,i)=>{
      edgePanel(j,e,M.glass,.3,4,e.L-1);
      edgePanel(j,e,brown,4.5,10.7,e.L);
      for(let y=5;y<15.5;y+=.65)edgePanel(j,e,M.darkStone,y,.13,e.L,.85);
      edgePanel(j,e,M.white,15.3,.8,e.L+1,1);
      edgePanel(j,e,M.white,4.1,.6,e.L+1,1);
      if(i===2||i===3){
        const t=i===2?e.L/2-7:-e.L/2+7;
        const corner={...e,x:e.x+e.tx*t,z:e.z+e.tz*t};
        edgePanel(j,corner,M.blueGlass,.3,15.8,14,1.05);
        for(let k=-6;k<=6;k+=3)box(j,M.frame,corner.x+e.tx*k+e.nx*1.4,.4,corner.z+e.tz*k+e.nz*1.4,.18,15.6,.3,{ry:e.ry,collide:false});
        for(let y=3;y<16;y+=3)edgePanel(j,corner,M.frame,y,.18,14,1.4);
      }
    });
    const south=edges.reduce((a,b)=>b.nz>a.nz?b:a);
    sign(j,'久盛百货',south.x+south.nx*1.2,14.2,south.z+south.nz*1.2,18,1.3,south.facing,'#e5e1d7','#793e36');
    buildJiushengPrecinct({c:j,box,cyl,M,sourceEdges,edgePanel});
  }
}
export {buildCorePhotoBuildings};
