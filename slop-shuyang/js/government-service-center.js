import * as THREE from 'three/webgpu';
import {GEO} from './shuyang-geodata.js';
import {BUILDING_PHOTO_REFERENCES} from './building-photo-references.js';

// Approximate garden edges traced against the GCJ-02 satellite layer after
// converting source WGS84 coordinates. Retrieval 2026-11-15, capture day unknown.
const SERVICE_CENTER_FORECOURT=BUILDING_PHOTO_REFERENCES.find(r=>r.id==='governmentService').forecourt;

// Front elevation only. The south-facing recess and short eastern return are
// mapped; their appearance is inferred from the named 2022 opening photograph.
// Keep the ordinary body, original height, source roof and collision boundary.
function buildGovernmentServiceCenter({root,M,box,sign,sourceEdges}){
  const review=BUILDING_PHOTO_REFERENCES.find(r=>r.id==='governmentService');
  const b=GEO.mapBuildings.find(b=>b.id===review?.sourceId);
  if(!b)throw new Error('Missing government service centre source');
  const xs=b.o.filter((_,i)=>i%2===0),zs=b.o.filter((_,i)=>i%2===1);
  const s={sourceId:b.id,x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2};
  const g=new THREE.Group();g.name='公共建筑·政务服务中心';g.position.set(s.x,0,s.z);root.add(g);
  const c={s,g},edges=sourceEdges(c),front=edges[0],titleFace=edges[2],H=b.h;
  if(front.nz<.9||titleFace.nz<.9)throw new Error('Service centre frontage source orientation drift');
  const std=(color,extra={})=>new THREE.MeshStandardNodeMaterial({color,roughness:.78,...extra});
  const stone=std(0xcacbc3),joint=std(0x969f9d),glass=std(0x42899e,{roughness:.24,metalness:.36});
  const darkGlass=std(0x245663,{roughness:.22,metalness:.42}),metal=std(0xb1babe,{roughness:.4,metalness:.55});
  const glow=std(0x8faeb1,{emissive:0x6a8c83,emissiveIntensity:.22,roughness:.35});
  const counts={panels:0,fins:0,signs:0};
  const put=(e,mat,u,y,v,w,h,d=.16)=>{
    counts.panels++;
    return box(c,mat,e.x+e.tx*u+e.nx*v,y,e.z+e.tz*u+e.nz*v,w,h,d,{ry:e.ry,collide:false});
  };
  const label=(e,text,u,y,v,w,h,bg,fg,opts={})=>{
    counts.signs++;
    return sign(c,text,e.x+e.tx*u+e.nx*v,y,e.z+e.tz*u+e.nz*v,w,h,e.facing,bg,fg,opts);
  };
  const L=front.L,left=-L/2,right=L/2;
  put(front,glass,0,.3,.38,L-.35,H-.5);
  // Glass panel joints are construction modules, not a declaration of floors.
  for(let u=left+1.8;u<right-1;u+=1.85)put(front,metal,u,.35,.54,.075,H-.7);
  for(let y=1.45;y<H-.5;y+=1.5)put(front,metal,0,y,.55,L-.45,.065);
  for(const u of [left+1.35,left+14.8,right-3.9])put(front,stone,u,.25,.73,1.7,H-.25,.35);
  put(front,stone,0,H-2.45,.74,L,2.15,.38);
  put(front,darkGlass,2.2,H-4.5,.78,23.8,1.9);
  // Narrow stone blades shade the left glazed bay. Their spacing is estimated.
  for(let u=left+3;u<left+13;u+=1.48){put(front,stone,u,4.3,1.05,.28,H-6.8,1.0);counts.fins++;}
  // The photograph has a broad recessed central glazed entrance and a dark base.
  put(front,darkGlass,2.2,.3,.83,23.8,4.0);
  for(const u of [-5.2,-1.5,2.2,5.9,9.6]){
    put(front,metal,u,.35,1.0,.12,3.45,.12);
    put(front,metal,u+1.7,1.75,1.03,.05,.7,.07);
  }
  put(front,metal,2.2,3.9,.94,24.0,.16,.5);
  put(front,M.darkStone,2.2,4.13,1.0,24.2,.25,1.65);
  // Sparse display lighting behind the curtain wall, kept below its top frame.
  for(let row=1;row<7;row++)for(let col=0;col<9;col++)if((row*5+col*3)%13<2){
    put(front,glow,-9.0+col*2.2,4.5+row*2.1,.59,1.55,.62);
  }
  // The short right-hand slab carries the vertical title seen in the photo.
  put(titleFace,stone,0,.25,.52,titleFace.L-.2,H-.25,.3);
  for(let y=1;y<H-.4;y+=1.5)put(titleFace,joint,0,y,.71,titleFace.L-.3,.035,.02);
  for(const u of [-2.6,2.6])put(titleFace,joint,u,.3,.72,.03,H-.6,.02);
  label(titleFace,review.name,0,14.9,.79,1.25,17,'#cacbc3','#a73d3c',{vertical:true,fontSize:80,border:false});
  for(let u=-2.6;u<=2.6;u+=1.3)put(titleFace,metal,u,.25,.77,.12,3.2,.12);
  put(titleFace,darkGlass,0,.25,.74,titleFace.L-.5,3.0);
  const positions=[],normals=[];
  for(const p of SERVICE_CENTER_FORECOURT)for(let i=1;i<p.length-1;i++){
    // These two traced polygons are convex; reverse the X/Z fan for upward Y.
    for(const q of [p[0],p[i+1],p[i]]){positions.push(q[0]-s.x,.245,q[1]-s.z);normals.push(0,1,0);}
  }
  const ground=new THREE.BufferGeometry();
  ground.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  ground.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));ground.computeBoundingSphere();
  const lawn=new THREE.Mesh(ground,std(0x657948,{roughness:.96}));lawn.name='政务中心·前场绿地';lawn.receiveShadow=true;g.add(lawn);
  g.userData.photoReview={id:review.id,sourceId:b.id,sourceBuildingIndex:review.sourceBuildingIndex,
    retainedHeight:H,captureDate:null,modeledFaces:review.modeledFaces,
    orientation:'inferred from mapped southern recess and 2022 named photograph; not surveyed',counts};
  return{group:g,counts};
}
export {buildGovernmentServiceCenter,SERVICE_CENTER_FORECOURT};
