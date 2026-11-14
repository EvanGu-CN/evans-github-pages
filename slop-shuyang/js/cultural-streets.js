import * as THREE from 'three/webgpu';
import {CULTURAL_STREETS} from './cultural-streets-data.js';
import {createCulturalPanelMaterial,createParkLawnMaterial} from './tsl-materials.js';

function buildCulturalStreets(root){
  const group=new THREE.Group();group.name='文化片区·已核对沿街界面';
  const paving=createCulturalPanelMaterial(0x98726a,.3,.15),green=createParkLawnMaterial(false),curb=new THREE.MeshStandardNodeMaterial({color:0xbcb9ab,roughness:.9});
  const materials={walkway:paving,green,curb},counts={};
  for(const s of CULTURAL_STREETS.surfaces){
    const positions=[],uvs=[],y=s.kind==='curb'?.29:s.kind==='green'?.245:.255;
    const frontage=CULTURAL_STREETS.frontages.find(f=>f.road===s.road),axis=frontage.axis;
    const vertex=(p,height)=>{positions.push(p.x,height,p.y);const x=p.x-axis[0],z=p.y-axis[1];uvs.push(x*axis[2]+z*axis[3],-x*axis[3]+z*axis[2]);};
    for(const p of s.polygons){
      const rings=[p.outer,...p.holes].map((r,i)=>{const ps=[];for(let j=0;j<r.length;j+=2)ps.push(new THREE.Vector2(r[j],r[j+1]));if(THREE.ShapeUtils.isClockWise(ps)!==(i===0))ps.reverse();return ps;}),ps=rings.flat();
      for(const tri of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))){let [a,b,c]=tri.map(i=>ps[i]);if((b.y-a.y)*(c.x-a.x)-(b.x-a.x)*(c.y-a.y)<0)[b,c]=[c,b];for(const q of [a,b,c])vertex(q,y);}
      if(s.kind==='curb')for(const r of rings)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];for(const [p,h] of [[a,.22],[b,.22],[a,y],[a,y],[b,.22],[b,y]])vertex(p,h);}
    }
    if(!positions.length)continue;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,materials[s.kind]);mesh.name=s.road+'·'+s.kind;mesh.receiveShadow=true;mesh.castShadow=s.kind==='curb';group.add(mesh);counts[s.road+'·'+s.kind]={polygons:s.polygons.length,vertices:positions.length/3};
  }
  group.userData.review={id:CULTURAL_STREETS.reviewId,frontages:CULTURAL_STREETS.frontages,captureDate:null,limits:CULTURAL_STREETS.limits,counts};root.add(group);return{group,counts};
}
export {buildCulturalStreets};
