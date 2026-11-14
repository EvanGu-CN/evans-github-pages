import * as THREE from 'three/webgpu';
import { GEO } from './shuyang-geodata.js';
import { BUILDING_PHOTO_REFERENCES } from './building-photo-references.js';

// Matched with labelled aerial/street photographs and a GCJ-02 satellite review.
// Original source footprints/heights remain in the data; the tower's separate
// display-height estimate is applied by buildings.js, not written into the gzip.
function buildHospitalPrecinct({root, M, box, cyl, sign, sourceEdges, edgePanel}) {
  const review=BUILDING_PHOTO_REFERENCES.find(r=>r.id==='tcmHospital');
  if(!review)return;
  const std=(color,extra={})=>new THREE.MeshStandardNodeMaterial({color,roughness:.75,...extra});
  const white=std(0xd5dcd9),pale=std(0xb7c9c8),glass=std(0x7fadb4,{roughness:.28,metalness:.35});
  const window=std(0x365c66,{roughness:.2,metalness:.45}),frame=std(0x7d9291,{roughness:.45,metalness:.5});
  const towerGlass=std(0x8faab0,{roughness:.3,metalness:.25});
  const litWindow=std(0x9caeaa,{emissive:0x8c9b85,emissiveIntensity:.35,roughness:.4});
  const dark=std(0x273b40),tile=std(0xabaea5,{roughness:.94}),joint=std(0x8c948d);
  const teal=std(0x398a82,{roughness:.4}),glow=std(0xc7d7ce,{emissive:0x96b6ac,emissiveIntensity:.32});
  const contexts=[];
  const records=[{...review,role:'tower'},...review.associatedSources];
  const ctx=record=>{
    const b=GEO.mapBuildings.find(b=>b.id===record.sourceId);
    if(!b)throw new Error('Missing hospital source: '+record.sourceId);
    const xs=b.o.filter((_,i)=>i%2===0),zs=b.o.filter((_,i)=>i%2===1);
    const g=new THREE.Group();g.name='医院·'+record.role;
    const s={sourceId:b.id,x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2};
    g.position.set(s.x,0,s.z);root.add(g);
    g.userData.photoReview={reviewId:review.id,sourceId:b.id,sourceBuildingIndex:record.sourceBuildingIndex,
      originalHeight:b.h,displayHeight:record.displayHeight||b.h,totalHeightEstimate:record.totalHeightEstimate||b.h,
      role:record.role,captureDate:null};
    const c={s,g,b,record};contexts.push(c);return c;
  };
  const put=(c,e,mat,u,y,v,w,h,d)=>{
    const x=e.x+e.tx*u+e.nx*v,z=e.z+e.tz*u+e.nz*v;
    return box(c,mat,x,y,z,w,h,d,{ry:e.ry,collide:false});
  };
  const panel=(c,e,mat,u,y,w,h,v=.48)=>put(c,e,mat,u,y,v,w,h,.18);
  const strut=(c,mat,a,b,r=.055)=>{
    const delta=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),L=delta.length();
    if(L<.01)return;
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,L,6),mat);
    mesh.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());c.g.add(mesh);
  };
  const at=(e,u,y,v)=>[e.x+e.tx*u+e.nx*v,y,e.z+e.tz*u+e.nz*v];

  const tower=ctx(records[0]),edges=sourceEdges(tower),H=review.displayHeight;
  const south=edges.reduce((a,b)=>b.nz>a.nz?b:a),west=edges.reduce((a,b)=>b.nx<a.nx?b:a);
  // The photographed south and west faces receive metre-sized physical bands.
  for(const e of [south,west]){
    edgePanel(tower,e,towerGlass,.3,H-.5,e.L-.3,.35);
    for(let floor=0;floor<review.displayLevels;floor++){
      panel(tower,e,white,0,floor*3.6+.3,e.L,.95,.58);
      panel(tower,e,frame,0,floor*3.6+2.9,e.L,.13,.66);
    }
    for(let u=-e.L/2+2;u<e.L/2-1;u+=3.6)panel(tower,e,frame,u,.45,.13,H-.7,.66);
    // Sparse, low-output room lights keep the hospital legible at night. This
    // is a display pattern, not a claim about occupied rooms in the photos.
    for(let floor=1;floor<18;floor++)for(let col=0,u=-e.L/2+3;u<e.L/2-2;col++,u+=3.6){
      if((floor*7+col*3)%11<3)panel(tower,e,litWindow,u,floor*3.6+1.45,2.35,1.4,.74);
    }
  }
  for(const ratio of [-.46,-.18,.18,.46])panel(tower,south,white,south.L*ratio,.25,Math.abs(ratio)<.2?4:3.3,H-.25,.86);
  panel(tower,south,glass,0,H-2.7,south.L,2.7,.88);
  const roofTitle=at(south,0,H-1.35,1.02);
  sign(tower,review.name,roofTitle[0],roofTitle[1],roofTitle[2],36,2.2,south.facing,'#7fadb4','#a33d35',{aspect:10,fontSize:84,border:false});
  const titleU=west.L/2-3.1;
  panel(tower,west,white,titleU,.24,5.6,H-.24,.82);
  const title=at(west,titleU,37,1.0);
  sign(tower,review.name,title[0],title[1],title[2],3.3,28,west.facing,'#d5dcd9','#a33d35',{vertical:true,fontSize:86,border:false});
  put(tower,west,M.red,titleU,57.8,1.02,2.7,.7,.16);
  put(tower,west,M.red,titleU,56.8,1.02,.7,2.7,.16);

  // Low glass barrel crown inferred from the visible roof profile; its outline
  // stays inside the existing rectangular source footprint. Top is ~71 m.
  const halfLength=south.L/2-2,radius=6.5,rise=review.totalHeightEstimate-H;
  const positions=[],indices=[];
  for(let i=0;i<=18;i++){
    const theta=-Math.PI/2+i*Math.PI/18,v=radius*Math.sin(theta),y=H+rise*Math.cos(theta);
    for(const u of [-halfLength,halfLength])positions.push(south.tx*u+south.nx*v,y,south.tz*u+south.nz*v);
    if(i<18){const j=i*2;indices.push(j,j+1,j+3,j,j+3,j+2);}
  }
  const roofGeometry=new THREE.BufferGeometry();roofGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  roofGeometry.setIndex(indices);roofGeometry.computeVertexNormals();
  const roof=new THREE.Mesh(roofGeometry,new THREE.MeshStandardNodeMaterial({color:0x467e88,roughness:.28,metalness:.5,side:THREE.DoubleSide}));
  tower.g.add(roof);
  for(let u=-halfLength;u<=halfLength+.01;u+=halfLength/4){
    for(let i=0;i<18;i++){
      const t0=-Math.PI/2+i*Math.PI/18,t1=t0+Math.PI/18;
      strut(tower,frame,at({...south,x:0,z:0},u,H+rise*Math.cos(t0),radius*Math.sin(t0)),
        at({...south,x:0,z:0},u,H+rise*Math.cos(t1),radius*Math.sin(t1)));
    }
  }
  for(const v of [-5,-2.5,0,2.5,5]){
    const y=H+rise*Math.sqrt(1-v*v/(radius*radius));
    strut(tower,frame,at({...south,x:0,z:0},-halfLength,y,v),at({...south,x:0,z:0},halfLength,y,v));
  }

  let podium=null,front=null;
  for(const record of records.slice(1)){
    const c=ctx(record),E=sourceEdges(c),floor=c.b.h/6;
    const faces=record.role==='west-podium'?E.filter(e=>e.nx<-.85&&e.L>70):E.filter(e=>e.L>12&&(e.nx<-.7||e.nz<-.7));
    for(const e of faces){
      edgePanel(c,e,glass,.35,c.b.h-.55,e.L-.2,.3);
      panel(c,e,dark,0,.4,e.L-.6,3.3,.5);
      for(let row=1;row<6;row++)panel(c,e,pale,0,row*floor,e.L,.18,.58);
      for(let u=-e.L/2+1.5;u<e.L/2-1;u+=3.25){
        panel(c,e,frame,u,.4,.1,c.b.h-.7,.58);
        for(let row=1;row<6;row++){
          if((Math.round(u)+row*3)%7===0)panel(c,e,window,u,row*floor+.8,1.2,1.9,.65);
        }
      }
    }
    if(record.role==='west-podium'){
      podium=c;front=faces.reduce((a,b)=>b.L>a.L?b:a);
      // Dark entry recess is an exterior representation, not a new passage in
      // the source collision polygon or a claim about a surveyed doorway.
      panel(c,front,dark,0,.25,15,8.3,1.0);
      for(const u of [-9.1,9.1])put(c,front,white,u,.25,.95,3.4,10.6,1.4);
      put(c,front,white,0,8.6,.95,21.7,2.25,1.4);
      const p=at(front,0,9.65,1.72);
      sign(c,review.name,p[0],p[1],p[2],18,1.6,front.facing,'#d5dcd9','#983d34',{aspect:8,fontSize:80,border:false});
      for(let i=0;i<3;i++)put(c,front,tile,0,.24+i*.09,2.4-i*.7,24+i*1.2,.09,.75);
      for(const u of [-34,-19,22,35]){
        put(c,front,pale,u,c.b.h+.22,-5,3.3,1.5,2.3);
        put(c,front,frame,u,c.b.h+1.72,-5,3.4,.12,2.4);
      }
    }
  }
  if(podium&&front){
    const c=podium,e=front;
    put(c,e,tile,0,.245,6.4,e.L-15,.035,10.8);
    for(let u=-e.L/2+8;u<e.L/2-7;u+=2)put(c,e,joint,u,.285,6.4,.035,.015,10.7);
    // The green shelter visible in the street photograph; positions, bay count
    // and widths are approximate. Do not fabricate route numbers or adverts.
    for(let u=14;u<=42;u+=4){
      const p=at(e,u,.28,10.1);cyl(c,teal,p[0],p[1],p[2],.07,.09,2.5,8);
      if(u<42)put(c,e,glass,u+2,.55,9.8,3.7,1.55,.08);
    }
    for(const [v,y] of [[9.6,2.72],[10.45,2.9],[11.3,2.72]]){
      put(c,e,teal,28,y,v,29,.12,.9);
    }
    put(c,e,glow,28,2.45,9.75,28,.18,.14);
    for(const u of [22,30,38])put(c,e,M.metal,u,.7,10.0,2.6,.13,.48);
    c.g.userData.streetReview={street:'上海中路',captureDate:null,estimated:true,shelter:'photo-guided; no route or tenant claims'};
  }
  return {contexts};
}

export {buildHospitalPrecinct};
