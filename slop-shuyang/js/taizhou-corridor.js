import * as THREE from 'three/webgpu';
import {TAIZHOU_CORRIDOR} from './taizhou-corridor-data.js';
import {createParkLawnMaterial,createModernRoadSurfaceMaterial} from './tsl-materials.js';

// Ground-level standard-section detail. It adds no building replacement or
// motor-traffic route. Existing road paint and traffic use the widened GEO.
function buildTaizhouCorridor(root){
  const group=new THREE.Group();group.name='台州路·景观断面';
  const colors={'side-green':0x557847,landscape:0x68874c,cycleway:0x535b5c,walkway:0xaa7a76,
    curb:0xc3c3b8,'cycle-curb':0xb9bdb2,'outer-curb':0xb9bdb2};
  const counts={};
  for(const surface of TAIZHOU_CORRIDOR.surfaces){
    const positions=[],normals=[],uvs=[];
    const curb=surface.kind.includes('curb'),y=curb ? .35 : surface.kind==='walkway' ? .265 : .245;
    const vertex=(p,h,n)=>{positions.push(p.x,h,p.y);normals.push(...n);uvs.push(p.x*.4,p.y*.4);};
    for(const p of surface.polygons){
      const rings=[p.outer,...p.holes].map((r,i)=>{
        const ps=[];for(let j=0;j<r.length;j+=2)ps.push(new THREE.Vector2(r[j],r[j+1]));
        if(THREE.ShapeUtils.isClockWise(ps)!==(i===0))ps.reverse();return ps;
      }),points=rings.flat();
      for(const tri of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))){
        let [a,b,c]=tri.map(i=>points[i]);
        if((b.y-a.y)*(c.x-a.x)-(b.x-a.x)*(c.y-a.y)<0)[b,c]=[c,b];
        for(const q of [a,b,c])vertex(q,y,[0,1,0]);
      }
      if(curb)for(const ring of rings)for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],L=Math.hypot(b.x-a.x,b.y-a.y);
        if(L<.001)continue;const n=[-(b.y-a.y)/L,0,(b.x-a.x)/L];
        for(const [p,h] of [[a,.22],[b,.22],[a,y],[a,y],[b,.22],[b,y]])vertex(p,h,n);
      }
    }
    if(!positions.length)continue;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeBoundingSphere();
    const material=['side-green','landscape'].includes(surface.kind)?createParkLawnMaterial(false):
      surface.kind==='cycleway'?createModernRoadSurfaceMaterial():new THREE.MeshStandardNodeMaterial({color:colors[surface.kind],roughness:.86});
    const mesh=new THREE.Mesh(g,material);mesh.name='台州路·'+surface.kind;mesh.receiveShadow=true;mesh.castShadow=curb;group.add(mesh);
    counts[surface.kind]={polygons:surface.polygons.length,vertices:positions.length/3};
  }
  group.userData.review={id:TAIZHOU_CORRIDOR.reviewId,captureDate:null,areaByKind:TAIZHOU_CORRIDOR.areaByKind,counts};
  root.add(group);return{group,counts};
}
export {buildTaizhouCorridor};
