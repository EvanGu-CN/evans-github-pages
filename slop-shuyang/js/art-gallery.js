import * as THREE from 'three/webgpu';
import {ART_GALLERY,ART_GALLERY_PARTS,ART_GALLERY_LINKS,ART_GALLERY_BRIDGE,
  galleryWorld,galleryRedWorld,galleryShaftRing,galleryDisplayFootprints,galleryPondPolygons,galleryPavingPolygons} from './art-gallery-layout.js';
import {createGalleryBrickMaterial,createGalleryConcreteMaterial} from './tsl-materials.js';

function buildArtGallery({ctxFor,box,sign,M,colliders}){
  const c=ctxFor('沭阳文化中心');if(!c)return;
  const group=new THREE.Group();group.name='沭阳美术馆·实景体块';c.g.add(group);
  const ctx={...c,g:group},H=ART_GALLERY.redHeight,base=.3;
  const std=(color,extra={})=>new THREE.MeshStandardNodeMaterial({color,roughness:.8,...extra});
  const brick=createGalleryBrickMaterial(H),concrete=createGalleryConcreteMaterial(),ink=std(0x30393d),redRoof=std(0x9b6656),roof=std(0xd1d0c4);
  const pool=std(0x3e5b61,{roughness:.13,metalness:.45}),glass=std(0x34525c,{roughness:.2,metalness:.38}),frame=std(0x65777c,{roughness:.45,metalness:.5});
  const ponds=galleryPondPolygons();
  const stats={halls:ART_GALLERY_PARTS.filter(p=>!p.base).length+1,links:ART_GALLERY_LINKS.length,vertices:0,colliders:0,ponds:ponds.length};
  function mesh(positions,uvs,index,material,name){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));if(index)g.setIndex(index);g.computeVertexNormals();g.computeBoundingSphere();
    const m=new THREE.Mesh(g,material);m.name=name;m.castShadow=m.receiveShadow=true;group.add(m);stats.vertices+=positions.length/3;return m;
  }
  const local=(p,y)=>[p.x-c.s.x,y,p.z-c.s.z];
  function flat(outer,holes,y,mat,name){
    const rings=[outer,...holes].map((r,i)=>{const q=r.map(p=>new THREE.Vector2(p.x,p.z));if(THREE.ShapeUtils.isClockWise(q)!==(i===0))q.reverse();return q;});
    const points=rings.flat(),positions=[],uvs=[],ix=[];
    for(const p of points){positions.push(...local({x:p.x,z:p.y},y));uvs.push(p.x,p.y);}
    for(const t of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))){const [a,b,d]=t.map(i=>points[i]);
      ix.push(...((b.y-a.y)*(d.x-a.x)-(b.x-a.x)*(d.y-a.y)>0?t:[t[0],t[2],t[1]]));}
    return mesh(positions,uvs,ix,mat,name);
  }
  function collision(outer,holes,y0,y1){
    colliders.push({minX:Math.min(...outer.map(p=>p.x)),maxX:Math.max(...outer.map(p=>p.x)),minZ:Math.min(...outer.map(p=>p.z)),maxZ:Math.max(...outer.map(p=>p.z)),
      minY:y0,maxY:y1,polygon:{outer,holes},artGallery:true});stats.colliders++;
  }
  function walls(outer,y0,y1,mat,name){
    const positions=[],uvs=[],ix=[];let signed=0;outer.forEach((p,i)=>{const q=outer[(i+1)%outer.length];signed+=p.x*q.z-q.x*p.z;});
    for(let i=0;i<outer.length;i++){
      const a=outer[i],b=outer[(i+1)%outer.length],L=Math.hypot(b.x-a.x,b.z-a.z),k=positions.length/3;
      for(const [p,y] of [[a,y0],[b,y0],[a,y1],[b,y1]])positions.push(...local(p,y));uvs.push(0,y0,L,y0,0,y1,L,y1);
      ix.push(...(signed>0?[k,k+2,k+1,k+1,k+2,k+3]:[k,k+1,k+2,k+1,k+3,k+2]));
    }
    return mesh(positions,uvs,ix,mat,name);
  }
  const perimeterAt=y=>{
    const out=[];for(let side=0;side<4;side++)for(let i=0;i<40;i++){
      const t=i/40;out.push(side===0?galleryRedWorld(33.5*t,0,y):side===1?galleryRedWorld(33.5,34*t,y):side===2?galleryRedWorld(33.5*(1-t),34,y):galleryRedWorld(0,34*(1-t),y));
    }return out;
  };
  // Each facade is sampled in metres. The east glazing is an actual arched
  // opening in this shell, with the curved upper cut continuing into the roof.
  for(let side=0;side<4;side++){
    const N=56,J=38,positions=[],uvs=[],ix=[],L=side%2?34:33.5;
    for(let i=0;i<=N;i++){
      const t=i/N,along=L*t,arch=side===1?Math.sqrt(Math.max(0,7.4*7.4-(along-17)*(along-17))):0;
      for(let j=0;j<=J;j++){
        const y=base+arch+(H-base-arch)*j/J;
        const p=side===0?galleryRedWorld(along,0,y):side===1?galleryRedWorld(33.5,along,y):side===2?galleryRedWorld(33.5-along,34,y):galleryRedWorld(0,34-along,y);
        positions.push(...local(p,y));uvs.push(along,y);
      }
    }
    for(let i=0;i<N;i++)for(let j=0;j<J;j++){const a=i*(J+1)+j,b=(i+1)*(J+1)+j;ix.push(a,a+1,b,b,a+1,b+1);}
    mesh(positions,uvs,ix,brick,'美术馆·红砖曲面-'+side);
  }
  flat(perimeterAt(H),[galleryShaftRing(H)],H,redRoof,'美术馆·红厅屋面');
  const shaftPos=[],shaftUv=[],shaftIx=[];
  for(let j=0;j<=18;j++){
    const y=base+(H-base)*j/18,ring=galleryShaftRing(y);
    for(let i=0;i<=ring.length;i++){shaftPos.push(...local(ring[i%ring.length],y));shaftUv.push(i/ring.length*45,y);}
  }
  for(let j=0;j<18;j++)for(let i=0;i<64;i++){const a=j*65+i,b=a+65;shaftIx.push(a,a+1,b,a+1,b+1,b);}
  const shaft=mesh(shaftPos,shaftUv,shaftIx,glass,'美术馆·通高采光井');shaft.material.side=THREE.DoubleSide;
  const framePos=[],frameUv=[],frameIx=[];
  for(let i=0;i<64;i+=4)for(let j=0;j<10;j++){
    const ys=[base+(H-base)*j/10,base+(H-base)*(j+1)/10],k=framePos.length/3;
    for(const y of ys){
      const r=galleryShaftRing(y),p=r[i],a=r[(i+63)%64],b=r[(i+1)%64],L=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/L*.055,dz=(b.z-a.z)/L*.055;
      for(const sign of [-1,1]){framePos.push(...local({x:p.x+sign*dx,z:p.z+sign*dz},y));frameUv.push(sign*.055,y);}
    }
    frameIx.push(k,k+1,k+2,k+1,k+3,k+2);
  }
  mesh(framePos,frameUv,frameIx,frame,'美术馆·采光井竖框').material.side=THREE.DoubleSide;
  for(let y=4;y<H;y+=4)walls(galleryShaftRing(y),y-.055,y+.055,frame,'美术馆·采光井横框').material.side=THREE.DoubleSide;
  const topRing=galleryShaftRing(H),innerRing=galleryShaftRing(H-.65);
  flat(topRing,[innerRing],H+.04,roof,'美术馆·采光井压顶');
  for(let y=base;y<H;y+=2.5)collision(perimeterAt(y),[galleryShaftRing(y)],y,Math.min(H,y+2.5));
  // Arched curtain wall and metre-spaced mullions below its true curved edge.
  const arch=[],archY=[];for(let i=0;i<=40;i++){const v=9.6+i/40*14.8;arch.push(galleryRedWorld(33.5-.08,v,base));archY.push(base+Math.sqrt(Math.max(0,7.4*7.4-(v-17)*(v-17))));}
  const ap=[],au=[],ai=[];
  arch.forEach((p,i)=>{ap.push(...local(p,base),...local(p,archY[i]));au.push(i*.37,base,i*.37,archY[i]);if(i)ai.push((i-1)*2,(i-1)*2+1,i*2,i*2,(i-1)*2+1,i*2+1);});
  const archMesh=mesh(ap,au,ai,glass,'美术馆·拱形玻璃');archMesh.material.side=THREE.DoubleSide;
  const putWorld=(mat,p,y,w,h,d,ry=0)=>box(ctx,mat,p.x-c.s.x,y,p.z-c.s.z,w,h,d,{ry,collide:false});
  const tangent=galleryWorld([289,419]),t2=galleryWorld([478,419]),ry=-Math.atan2(t2.z-tangent.z,t2.x-tangent.x);
  for(let v=10.5;v<=23.5;v+=1.45){const p=galleryRedWorld(33.5+.02,v,base),h=Math.sqrt(Math.max(0,7.4*7.4-(v-17)*(v-17)));putWorld(frame,p,base,.09,h,.11,ry);}
  // All other hall boundaries follow the fitted site plan, with open courts.
  for(const p of ART_GALLERY_PARTS){
    const outer=p.plan.map(galleryWorld),bottom=base+(p.base||0),top=bottom+p.height,mat=p.kind==='ink'?ink:concrete;
    walls(outer,bottom,top,mat,'美术馆·'+p.id);flat(outer,[],top,p.kind==='ink'?ink:roof,'美术馆·屋顶-'+p.id);collision(outer,[],bottom,top);
    if(p.kind==='white')for(let i=0;i<outer.length;i++){
      const a=outer[i],b=outer[(i+1)%outer.length],length=Math.hypot(b.x-a.x,b.z-a.z),angle=-Math.atan2(b.z-a.z,b.x-a.x);
      putWorld(roof,{x:(a.x+b.x)/2,z:(a.z+b.z)/2},top-.08,length,.36,.22,angle);
      if(p.ribbon){putWorld(glass,{x:(a.x+b.x)/2,z:(a.z+b.z)/2},bottom+9.0,length-.7,1.45,.13,angle);}
    }
    if(p.garden){
      const center=galleryWorld([442,684]);putWorld(M.stone,center,top+.03,15,.04,12,ry);
      for(const point of [[390,635],[491,637],[394,726],[492,726]]){const q=galleryWorld(point);putWorld(M.offWhite,q,top,.95,.55,.95,ry);putWorld(M.grass,q,top+.55,.8,.05,.8,ry);}
    }
  }
  for(const [i,p] of ART_GALLERY_LINKS.entries()){
    const outer=p.map(galleryWorld),top=base+6.6;walls(outer,base,top,glass,'美术馆·连廊-'+i);flat(outer,[],top,roof,'美术馆·连廊屋顶-'+i);collision(outer,[],base,top);
    for(let k=0;k<outer.length;k++){
      const a=outer[k],b=outer[(k+1)%outer.length],L=Math.hypot(b.x-a.x,b.z-a.z),angle=-Math.atan2(b.z-a.z,b.x-a.x);
      for(let d=0;d<=L;d+=1.5)putWorld(frame,{x:a.x+(b.x-a.x)*d/L,z:a.z+(b.z-a.z)*d/L},base,.065,6.6,.09,angle);
      putWorld(frame,{x:(a.x+b.x)/2,z:(a.z+b.z)/2},3.4,L,.09,.1,angle);
    }
  }
  const paving=galleryPavingPolygons(),pale=std(0xbebcb2),darkPaving=std(0x858e8e);
  for(const p of paving.base)flat(p.outer,p.holes,.09,pale,'美术馆·院区铺装');
  for(const p of paving.bands)flat(p.outer,p.holes,.095,darkPaving,'美术馆·波纹铺装');
  for(const p of ponds)flat(p.outer,p.holes,.265,pool,'美术馆·入口水面');
  flat(ART_GALLERY_BRIDGE.map(galleryWorld),[],.34,M.stone,'美术馆·入口平桥');
  for(const [point,text,vertical] of [[[549,524],'沭阳美术馆',false],[[599,566],'沭阳美术馆',true]]){
    const p=galleryWorld(point),angle=vertical?ry+Math.PI/2:ry+Math.PI;
    sign(ctx,text,p.x-c.s.x,vertical?7.8:7.6,p.z-c.s.z,vertical?1.05:10,vertical?6.5:1.3,angle,'#e2e1d8','#42382d',{vertical,border:false,fontSize:76});
  }
  group.userData.artGallery={...ART_GALLERY,stats,sourceBodyReplaced:true,collision:'2.5m conservative layers around the tapered shaft'};
  return{group,stats,footprints:galleryDisplayFootprints()};
}
export {buildArtGallery};
