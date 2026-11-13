import * as THREE from 'three/webgpu';
import {PARK_FOOTBRIDGES} from './city-config.js';

function buildParkFootbridges(root,colliders){
  const group=new THREE.Group();group.name='MappedNanhuFootbridges';root.add(group);
  const deck=new THREE.MeshStandardNodeMaterial({color:0xaaa99e,roughness:.88});
  const rail=new THREE.MeshStandardNodeMaterial({color:0xd5d1c5,roughness:.8});
  const box=(mat,x,y,z,w,h,d,angle=0,solid=false)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y+h/2,z);m.rotation.y=angle;m.castShadow=m.receiveShadow=true;group.add(m);
    if(solid){const cs=Math.cos(angle),sn=Math.sin(angle),outer=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([u,v])=>({x:x+u*cs+v*sn,z:z-u*sn+v*cs}));
      colliders.push({minX:Math.min(...outer.map(p=>p.x)),maxX:Math.max(...outer.map(p=>p.x)),minZ:Math.min(...outer.map(p=>p.z)),maxZ:Math.max(...outer.map(p=>p.z)),minY:y,maxY:y+h,polygon:{outer,holes:[]},parkFootbridge:true})}
    return m;
  };
  for(const b of PARK_FOOTBRIDGES){
    for(let i=1;i<b.points.length;i++){
      const a=b.points[i-1],c=b.points[i],dx=c.x-a.x,dz=c.z-a.z,L=Math.hypot(dx,dz);if(L<.1)continue;
      const x=(a.x+c.x)/2,z=(a.z+c.z)/2,angle=-Math.atan2(dz,dx),nx=-dz/L,nz=dx/L;
      box(deck,x,b.deckHeight-.14,z,L+.08,.14,b.width,angle);
      for(const side of [-1,1]){
        box(rail,x+nx*b.width/2*side,b.deckHeight+.78,z+nz*b.width/2*side,L,.2,.1,angle,true);
        const count=Math.max(1,Math.round(L/2.5));
        for(let j=0;j<=count;j++)box(rail,a.x+dx*j/count+nx*b.width/2*side,b.deckHeight,a.z+dz*j/count+nz*b.width/2*side,.13,.95,.13,0,true);
      }
    }
  }
  group.userData={source:'bridge-tagged OSM park paths',count:PARK_FOOTBRIDGES.length,appearanceNote:'Deck height and plain rail details are display estimates, not surveyed design.'};
  return group;
}
export {buildParkFootbridges};
