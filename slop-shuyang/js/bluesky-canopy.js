import * as THREE from 'three/webgpu';
import {BLUESKY_CANOPY as C,blueskyFront,blueskyCanopyPlan,blueskyWorld,blueskyPosts} from './bluesky-canopy-layout.js';
function buildBlueskyCanopy({c,cyl,sign,colliders}){
  const group=new THREE.Group();group.name='蓝天商贸城·实拍镂空门架';c.g.add(group);const ctx={...c,g:group},plan=blueskyCanopyPlan(),e=blueskyFront();
  const mat=new THREE.MeshStandardNodeMaterial({color:0xb9bdb5,roughness:.73}),silver=new THREE.MeshStandardNodeMaterial({color:0xbfc4c4,metalness:.72,roughness:.28});
  const rings=[plan.outer,...plan.holes].map((r,i)=>{const p=r.map(([x,z])=>new THREE.Vector2(x,z));if(THREE.ShapeUtils.isClockWise(p)!==(i===0))p.reverse();return p;}),ps=rings.flat(),positions=[];
  const vertex=(p,y)=>{const w=blueskyWorld(p.x,p.y,y);positions.push(w.x-c.s.x,w.y,w.z-c.s.z)};
  for(const tri of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))){let [a,b,d]=tri.map(i=>ps[i]);const wa=blueskyWorld(a.x,a.y),wb=blueskyWorld(b.x,b.y),wd=blueskyWorld(d.x,d.y);
    if((wb.z-wa.z)*(wd.x-wa.x)-(wb.x-wa.x)*(wd.z-wa.z)<0)[b,d]=[d,b];
    for(const q of [a,b,d])vertex(q,C.base+C.thickness);for(const q of [a,d,b])vertex(q,C.base);
  }
  for(const r of rings)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];for(const [p,y] of [[a,C.base],[b,C.base],[a,C.base+C.thickness],[a,C.base+C.thickness],[b,C.base],[b,C.base+C.thickness]])vertex(p,y);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,mat);mesh.name='蓝天门架·单层圆洞与条形天窗';mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  const posts=blueskyPosts();for(const p of posts)cyl(ctx,silver,p.x-c.s.x,.25,p.z-c.s.z,.45,.45,C.base-.25,10,true);
  [...'蓝天国际商贸城'].forEach((text,i)=>{const p=blueskyWorld((i-3)*20,C.halfDepth+.08,29.7);sign(ctx,text,p.x-c.s.x,p.y,p.z-c.s.z,8,4.6,e.facing,'rgba(0,0,0,0)','#bf85a2',{border:false,aspect:1,fontSize:110,cutout:true});});
  const toRing=r=>r.map(([u,v])=>{const p=blueskyWorld(u,v);return{x:p.x,z:p.z}}),outer=toRing(plan.outer),holes=plan.holes.map(toRing);
  colliders?.push({minX:Math.min(...outer.map(p=>p.x)),maxX:Math.max(...outer.map(p=>p.x)),minZ:Math.min(...outer.map(p=>p.z)),maxZ:Math.max(...outer.map(p=>p.z)),minY:C.base,maxY:C.base+C.thickness,polygon:{outer,holes},sourceFootprint:true,blueskyCanopy:true});
  group.userData.review={...C,holes:plan.holes.length,posts:posts.length,vertices:positions.length/3};return{group};
}
export {buildBlueskyCanopy};
