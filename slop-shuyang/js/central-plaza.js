import * as THREE from 'three/webgpu';
import {CENTRAL_PLAZA as C,centralEdges,centralFacePoint,centralTowerWindows,centralEntranceEdge} from './central-plaza-layout.js';
import {createCulturalPanelMaterial} from './tsl-materials.js';

function buildCentralPlaza({ctxFor,box,sign,sourceBody,sourceEdges,edgePanel}){
  const c=ctxFor('中央城市广场');if(!c)return;
  const group=new THREE.Group();group.name='中央商场·实拍校准';c.g.add(group);const ctx={...c,g:group};
  const std=(color,extra={})=>new THREE.MeshStandardNodeMaterial({color,roughness:.78,...extra});
  const stone=std(0xcac6ba),white=std(0xdeddd3),bronze=createCulturalPanelMaterial(0xaaa092,1.0,.22),dark=std(0x39413f);
  const glass=[0x526363,0x586969,0x445959].map(color=>std(color,{roughness:.28,metalness:.3})),steel=std(0x9b9e96,{roughness:.4,metalness:.65});
  const buckets=new Map(),stats={towerWindows:0,refugeWindows:0,faces:0};
  function tri(a,b,d,mat,uv){if(!buckets.has(mat))buckets.set(mat,{positions:[],uv:[]});const q=buckets.get(mat);for(const [i,p] of [a,b,d].entries()){q.positions.push(p.x-c.s.x,p.y,p.z-c.s.z);q.uv.push(...uv[i]);}}
  function panel(e,u0,u1,y0,y1,mat,offset=.04){
    const a=centralFacePoint(e,u0,y0,offset),b=centralFacePoint(e,u1,y0,offset),d=centralFacePoint(e,u0,y1,offset),f=centralFacePoint(e,u1,y1,offset),w=e.L*(u1-u0),h=y1-y0;
    // Orient each facade outwards, including the source ring's reversed edges.
    const cross=(b.z-a.z)*(d.y-a.y),crossZ=-(b.x-a.x)*(d.y-a.y),out=cross*e.nx+crossZ*e.nz>0;
    if(out){tri(a,d,b,mat,[[0,0],[0,h],[w,0]]);tri(b,d,f,mat,[[w,0],[0,h],[w,h]]);}else{tri(a,b,d,mat,[[0,0],[w,0],[0,h]]);tri(b,f,d,mat,[[w,0],[w,h],[0,h]]);}stats.faces++;
  }
  sourceBody(ctx,stone,C.podiumHeight);
  const tower={...ctx,s:{...c.s,sourceId:C.towerId}};sourceBody(tower,white,C.towerHeight);
  const edges=centralEdges(C.towerId),windows=centralTowerWindows();
  for(const w of windows){const e=edges[w.edge];panel(e,w.u0,w.u1,w.bottom,w.top,w.refuge?dark:glass[w.tone]);stats.towerWindows++;if(w.refuge)stats.refugeWindows++;
    // Pale central mullion makes the paired tall panes visible in the photos.
    const u=(w.u0+w.u1)/2;panel(e,u-.035/e.L,u+.035/e.L,w.bottom,w.top,white,.065);
  }
  for(const e of edges){
    const count=Math.max(2,Math.round(e.L/2.75));
    for(let i=1;i<count;i++){const u=i/count;panel(e,u-.17/e.L,u+.17/e.L,C.base,C.base+C.towerHeight,bronze,.07);}
    for(const floor of C.refugeFloors){const y=C.base+(floor-1)*C.towerHeight/C.levels;panel(e,0,1,y,y+.32,white,.08);}
    panel(e,0,1,C.base+C.towerHeight-.5,C.base+C.towerHeight,white,.07);
  }
  // Keep the remainder of the seven-storey podium explicitly generic. The
  // close photograph only supports a limited entrance segment, not every bay.
  for(const e of centralEdges(C.podiumId)){
    if(e.L<8)continue;
    for(let floor=0;floor<7;floor++){const y=C.base+floor*3.6;panel(e,.01,.99,y+.55,Math.min(y+3.25,C.podiumHeight),glass[0],.035);}
    panel(e,0,1,25.0,26.9,stone,.06);
  }
  const e=centralEntranceEdge(),u=.5,half=Math.min(22,e.L*.36),at=(along,y,offset)=>centralFacePoint(e,u+along/e.L,y,offset);
  const put=(mat,p,y,w,h,d,ry=-Math.atan2(e.tz,e.tx))=>box(ctx,mat,p.x-c.s.x,y,p.z-c.s.z,w,h,d,{ry,collide:false});
  const local=p=>({x:p.x-c.s.x,y:p.y,z:p.z-c.s.z});
  const signAt=(text,along,y,w,h,fg)=>{const p=at(along,y,.72);sign(ctx,text,p.x-c.s.x,y,p.z-c.s.z,w,h,e.facing,'rgba(0,0,0,0)',fg,{border:false,fontSize:88,aspect:Math.max(1,w/h),cutout:true});};
  panel(e,u-half/e.L,u+half/e.L,.3,13.4,glass[1],.12);
  for(let x=-half;x<=half;x+=2.5){const p=at(x,0,.2);put(steel,p,.3,.075,13.1,.13);}
  for(const y of [4.1,8.6,13.4]){const p=at(0,y,.24);put(white,p,y,half*2,.18,.24);}
  // A shallow glass-door line and canopy stay at the facade; they do not add
  // the previous unverified 10 m deep closed entrance hall outside the source.
  for(let x=-9;x<=9;x+=3){const p=at(x,0,.4);put(white,p,.3,.09,3.35,.16);}
  put(white,at(0,4.25,1.1),4.25,half*2,.3,2.6);
  for(const side of [-1,1]){
    const a=local(at(side*(half-2),4.6,.45)),b=local(at(side*(half-5),13.2,.45)),v=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),L=v.length();
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,L,6),steel);m.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());m.castShadow=true;group.add(m);
  }
  // The entry photo shows a circled door number and a hollow white rectangle;
  // its partly obscured red circle is advertising, not a permanent red roundel.
  const square=at(-10,7.4,.5);for(const x of [-2.4,2.4])put(white,{x:square.x+e.tx*x,z:square.z+e.tz*x},6, .6,5.2,.55);
  for(const y of [6,10.6])put(white,square,y,5.4,.6,.55);
  signAt('中央商场',-10,5.45,11,1.2,'#d9d6c6');signAt('①',half-3,8,2,2,'#d2d0c2');
  // Neutral fascia only: temporary launch slogans, QR codes and tenants from
  // the 2025 event are not represented as current permanent architecture.
  put(white,at(0,13.6,.45),13.6,half*2+1,.5,.7);
  const screen=at(0,15,.42);put(dark,screen,14.1,half*2,2.6,.22);signAt('中央商场',0,15.4,18,1.4,'#ddd5c4');
  for(const [material,q] of buckets){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(q.positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(q.uv,2));g.computeVertexNormals();g.computeBoundingSphere();
    const m=new THREE.Mesh(g,material);m.name='中央商场·'+(glass.includes(material)?'窗面':'框架与面板');m.castShadow=m.receiveShadow=true;group.add(m);
  }
  group.userData.review={...C,stats,entranceFace:{a:e.a,b:e.b,normal:[e.nx,e.nz],placement:'north side inferred from address and source geometry; exact door location unmeasured'}};
  return {group,stats};
}
export {buildCentralPlaza};
