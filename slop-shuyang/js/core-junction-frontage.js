import * as THREE from 'three/webgpu';
import {CORE_JUNCTION_FRONTAGE as F} from './core-junction-frontage-data.js';
import {createCulturalPanelMaterial} from './tsl-materials.js';
function buildCoreJunctionFrontage(root){
  const group=new THREE.Group();group.name='人民路商圈·东北角沿街铺装';
  const materials={blue:createCulturalPanelMaterial(0x286680,.45,.3),red:createCulturalPanelMaterial(0xa84833,.45,.3),joint:new THREE.MeshStandardNodeMaterial({color:0xbcb5a2,roughness:.95})};
  const counts={};
  for(const s of F.surfaces){
    const positions=[],uv=[];
    for(const p of s.polygons){
      const rings=[p.outer,...p.holes].map((r,i)=>{const ps=[];for(let j=0;j<r.length;j+=2)ps.push(new THREE.Vector2(r[j],r[j+1]));if(THREE.ShapeUtils.isClockWise(ps)!==(i===0))ps.reverse();return ps;}),ps=rings.flat();
      for(const tri of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))){let [a,b,c]=tri.map(i=>ps[i]);if((b.y-a.y)*(c.x-a.x)-(b.x-a.x)*(c.y-a.y)<0)[b,c]=[c,b];for(const q of [a,b,c]){positions.push(q.x,F.height,q.y);uv.push(q.x,q.y);}}
    }
    if(!positions.length)continue;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();
    const m=new THREE.Mesh(g,materials[s.kind]);m.name='东北角铺装·'+s.kind;m.receiveShadow=true;group.add(m);counts[s.kind]={polygons:s.polygons.length,vertices:positions.length/3};
  }
  group.userData.review={id:F.reviewId,sourceWayIds:F.sourceWayIds,counts,audit:F.audit,limits:F.limits};root.add(group);return group;
}
export {buildCoreJunctionFrontage};
