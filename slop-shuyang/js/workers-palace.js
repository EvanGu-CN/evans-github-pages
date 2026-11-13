import * as THREE from 'three/webgpu';

// B0JG3A0FKP exterior: weathered red panels, recessed upper glazing and a
// columned ground floor. Source outline is approximate; 18 m is not surveyed.
export function buildWorkersPalace({ctxFor,box,cyl,M,sourceBody,sourceEdges,edgePanel}) {
  const c=ctxFor('沭阳县工人文化宫（新馆）');
  if(!c)return;
  c.g.userData.photoBasis='AMap B0JG3A0FKP named exterior; 2023-05-01 opening independently verified; heights and unseen facades approximate';
  const rust=new THREE.MeshStandardNodeMaterial({color:0x925239,roughness:.87,metalness:.17});
  const seam=new THREE.MeshStandardNodeMaterial({color:0xc08665,roughness:.9});
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#99573b';ctx.fillRect(0,0,128,128);
  for(let x=8;x<128;x+=16)for(let y=8;y<128;y+=16){
    ctx.fillStyle='#322d2a';ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fill();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const perforated=new THREE.MeshStandardNodeMaterial({map:texture,roughness:.87});
  sourceBody(c,rust,18);
  const edges=sourceEdges(c);
  const front=edges.reduce((a,b)=>b.nx<a.nx?b:a);
  for(const e of edges){
    const visible=e===front||e.nz>.45;
    if(visible){
      edgePanel(c,e,M.glass,.3,4.7,e.L-1,.55);
      for(let k=3;k<e.L-2;k+=7){
        const x=e.x+e.tx*(k-e.L/2)+e.nx*1.5,z=e.z+e.tz*(k-e.L/2)+e.nz*1.5;
        cyl(c,M.offWhite,x,.22,z,.42,.46,4.9,12);
      }
      edgePanel(c,e,M.glass,6.9,2.8,e.L*.53,.55);
      edgePanel(c,e,M.glass,11.2,5.3,e.L*.77,.55);
      // Projected surrounds make the upper glass read as recessed, as in the
      // photograph. Their exact dimensions remain a photo proportion estimate.
      edgePanel(c,e,rust,10.1,1.15,e.L,1.9);
      edgePanel(c,e,rust,16.55,1.45,e.L,1.9);
      for(const t of [-.443,.443]){
        const end={...e,x:e.x+e.tx*(e.L*t),z:e.z+e.tz*(e.L*t)};
        edgePanel(c,end,rust,11.2,5.35,e.L*.115,1.9);
      }
      for(let k=-.34*e.L;k<e.L*.35;k+=3.6){
        const edge={...e,x:e.x+e.tx*k,z:e.z+e.tz*k};
        edgePanel(c,edge,M.frame,11.2,5.3,.09,.92);
      }
      edgePanel(c,e,M.frame,13.5,.09,e.L*.77,.92);
      edgePanel(c,e,M.frame,11.25,.08,e.L*.77,1.45);
      edgePanel(c,e,M.frame,12.05,.06,e.L*.77,1.45);
    }
    // Panel seams are subordinate to the broad rust-coloured planes.
    for(let k=2;k<e.L;k+=3.5){
      const edge={...e,x:e.x+e.tx*(k-e.L/2),z:e.z+e.tz*(k-e.L/2)};
      for(const [y,h] of visible?[[5.05,1.65],[9.75,1.4],[16.7,1.3]]:[[5,13]])
        edgePanel(c,edge,seam,y,h,.035,2.2);
    }
  }
  const inset={...front,x:front.x+front.tx*front.L*.32,z:front.z+front.tz*front.L*.32};
  edgePanel(c,inset,perforated,6.9,2.8,front.L*.21,.9);
  // Roof array is located from the observed satellite rectangle, not the POI.
  const p=c.s.roofPanel;
  if(p){
    const ry=-Math.atan2(p.tz,p.tx);
    box(c,M.roof,p.x-c.s.x,18.25,p.z-c.s.z,p.w+.6,.35,p.d+.6,{ry,collide:false});
    for(let i=0;i<6;i++){
      const t=(i-2.5)*p.w/6;
      box(c,M.blueGlass,p.x-c.s.x+p.tx*t,18.62,p.z-c.s.z+p.tz*t,p.w/6-.16,.12,p.d,{ry,collide:false});
    }
  }
}
