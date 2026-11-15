import * as THREE from 'three/webgpu';
import {BLUESKY_ROOF as R,blueskyRoofSurfaces,blueskyRoofPavilion} from './bluesky-roof-layout.js';
import {createParkLawnMaterial} from './tsl-materials.js';

function buildBlueskyRoof({c,colliders}){
  const group=new THREE.Group();group.name='蓝天商贸城·影像楼顶细节';c.g.add(group);
  const std=(color,roughness=.85)=>new THREE.MeshStandardNodeMaterial({color,roughness});
  const mats={paving:std(0xbcb9ae),green:createParkLawnMaterial(true),dark:std(0x344b4c),roof:std(0xa8aaa1),wall:std(0xc7c8bf),frame:std(0xd1d3cb,.48)};
  for(const [key,mat] of Object.entries(mats)){mat.name='蓝天影像屋顶·'+key;mat.userData.blueskyRoof=true;}
  let vertices=0;
  function mesh(ps,mat,name){
    const positions=[],uv=[];for(const p of ps){positions.push(p.x-c.s.x,p.y,p.z-c.s.z);uv.push(p.x,p.z);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();
    const m=new THREE.Mesh(g,mat);m.name=name;m.castShadow=m.receiveShadow=true;group.add(m);vertices+=ps.length;return m;
  }
  function collision(outer,y0,y1){colliders?.push({minX:Math.min(...outer.map(p=>p.x)),maxX:Math.max(...outer.map(p=>p.x)),minZ:Math.min(...outer.map(p=>p.z)),maxZ:Math.max(...outer.map(p=>p.z)),minY:y0,maxY:y1,polygon:{outer,holes:[]},sourceFootprint:true,blueskyRoof:true});}
  for(const s of blueskyRoofSurfaces()){
    const rings=[s.outer,...s.holes].map((r,i)=>{const q=r.map(p=>new THREE.Vector2(p.x,p.z));if(THREE.ShapeUtils.isClockWise(q)!==(i===0))q.reverse();return q;});
    const ps=rings.flat(),triangles=[];
    for(const tri of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))){const [a,b,d]=tri.map(i=>ps[i]);for(const i of ((b.y-a.y)*(d.x-a.x)-(b.x-a.x)*(d.y-a.y)>0?tri:[tri[0],tri[2],tri[1]])){const p=ps[i];triangles.push({x:p.x,y:s.y,z:p.y});}}
    mesh(triangles,mats[s.material],s.name);
    if(s.material==='green'){
      const side=[],cy=s.outer.reduce((n,p,j)=>{const q=s.outer[(j+1)%s.outer.length];return n+p.x*q.z-q.x*p.z},0);
      for(let i=0;i<s.outer.length;i++){
        const a=s.outer[i],b=s.outer[(i+1)%s.outer.length],aa={...a,y:R.bodyTop},bb={...b,y:R.bodyTop},at={...a,y:s.y},bt={...b,y:s.y};
        side.push(...(cy<0?[aa,bb,at,bb,bt,at]:[aa,at,bb,bb,at,bt]));
      }
      mesh(side,mats.wall,s.name+'·边缘');collision(s.outer,R.bodyTop,s.y);
    }
  }
  const pavilion=blueskyRoofPavilion();mesh(pavilion.top,mats.roof,'蓝天楼顶·低多边形采光面');mesh(pavilion.walls,mats.wall,'蓝天楼顶·采光面侧边');
  const ribs=[];
  function beam(a,b,r=.11){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,L=Math.hypot(dx,dy,dz);if(L<1e-5)return;const g=new THREE.CylinderGeometry(r,r,L,5),m=new THREE.Mesh(g,mats.frame);m.position.set((a.x+b.x)/2-c.s.x,(a.y+b.y)/2,(a.z+b.z)/2-c.s.z);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx/L,dy/L,dz/L));m.castShadow=true;group.add(m);ribs.push(L);}
  for(let i=0;i<pavilion.ring.length;i++){const a={...pavilion.ring[i],y:R.pavilionRim+.04},b={...pavilion.ring[(i+1)%pavilion.ring.length],y:R.pavilionRim+.04};beam(a,b);beam(a,{...pavilion.center,y:R.pavilionTop+.04},.07);}
  collision(pavilion.ring,R.bodyTop,R.pavilionTop+.15);
  group.userData.review={sourceId:R.sourceId,sourceIndex:R.sourceIndex,sourceHeight:R.sourceHeight,bodyTop:R.bodyTop,featureTop:R.pavilionTop+.15,vertices,ribs:ribs.length,beds:R.beds.length,imagery:R.imagery,limits:R.limits};
  return group;
}
export {buildBlueskyRoof};
