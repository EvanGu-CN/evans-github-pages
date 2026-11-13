import * as THREE from 'three/webgpu';
import { GEO } from './shuyang-geodata.js';

// Footprints are mapped; tower dimensions and roof heights are photo estimates.
// Sports orientation follows the north-arrow plan published by 沭阳发布 in 2026.
const CIVIC_LAYOUT = {
  government: {x:2335,z:1748,rotation:-Math.atan2(30,76.5),towerWidth:82,towerDepth:36,height:64},
  stadium: {x:-489.25,z:4722.5,pitchWidth:68,pitchLength:105,innerX:63,innerZ:100,outerX:111,outerZ:116},
  gym: {sourceId:'way/496856000',x:-705,z:4578.5,width:98,depth:89},
  pool: {sourceId:'4b78a3d2-c2c3-4e55-b5c5-af47da2fbfb1',height:10.5}
};

function buildCivicCampuses({ctxFor,box,cyl,sign,M,sourceBody,sourceEdges,edgePanel,colliders}) {
  const mesh=(c,geometry,material,name)=>{
    const m=new THREE.Mesh(geometry,material);m.name=name||'';m.castShadow=m.receiveShadow=true;c.g.add(m);return m;
  };
  const polygon=(c,points,holes=[],height=1,base=.22,material=M.concrete,name='')=>{
    const path=(points,Ctor)=>{const p=new Ctor();p.moveTo(points[0].x,-points[0].z);for(const q of points.slice(1))p.lineTo(q.x,-q.z);p.closePath();return p};
    const shape=path(points,THREE.Shape);shape.holes=holes.map(h=>path(h,THREE.Path));
    const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});geo.rotateX(-Math.PI/2);
    const m=mesh(c,geo,material,name);m.position.y=base;return m;
  };
  const collider=(c,outer,holes,minY,maxY)=>{
    const world=r=>r.map(p=>({x:p.x+c.s.x,z:p.z+c.s.z}));
    const p=world(outer);colliders.push({minX:Math.min(...p.map(q=>q.x)),maxX:Math.max(...p.map(q=>q.x)),
      minZ:Math.min(...p.map(q=>q.z)),maxZ:Math.max(...p.map(q=>q.z)),minY,maxY,
      polygon:{outer:p,holes:holes.map(world)}});
  };
  const placedBox=(c,mat,x,y,z,w,h,d,ry=0,solid=true)=>{
    const m=box(c,mat,x,y,z,w,h,d,{ry,collide:false});
    if(solid){const cs=Math.cos(ry),sn=Math.sin(ry);
      collider(c,[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([u,v])=>({x:x+cs*u+sn*v,z:z-sn*u+cs*v})),[],y,y+h)}
    return m;
  };
  const hipRoof=(c,x,z,w,d,eave,rise,ry=0)=>{
    const topW=w*.62,topD=d*.55;
    const p=[-w/2,0,-d/2,w/2,0,-d/2,w/2,0,d/2,-w/2,0,d/2,
      -topW/2,rise,-topD/2,topW/2,rise,-topD/2,topW/2,rise,topD/2,-topW/2,rise,topD/2];
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    geo.setIndex([0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0,4,7,6,4,6,5]);geo.computeVertexNormals();
    const roof=mesh(c,geo,M.frame,'缓四坡金属屋顶');roof.position.set(x,eave,z);roof.rotation.y=ry;
    placedBox(c,M.offWhite,x,eave-.5,z,w,1,d,ry,false);
    // Seams follow the actual slope, rather than a half-cylinder sports roof.
    for(let u=-w/2+4;u<w/2;u+=6){
      const t=u/(w/2),v=Math.max(-1,Math.min(1,t));
      const a=new THREE.Vector3(u,0,-d/2),b=new THREE.Vector3(v*topW/2,rise,-topD/2);
      const points=[a,b,new THREE.Vector3(v*topW/2,rise,topD/2),new THREE.Vector3(u,0,d/2)];
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicNodeMaterial({color:0x737e86}));
      line.position.copy(roof.position);line.rotation.y=ry;c.g.add(line);
    }
  };
  const source=(c,id,mat,h)=>{const cc={...c,s:{...c.s,sourceId:id}};sourceBody(cc,mat,h);return cc};
  const gov=ctxFor('沭阳县政府');
  if(gov){
    gov.g.userData.photoBasis='2024 aerial + two mapped roofs; tower and roof heights estimated';
    const g=CIVIC_LAYOUT.government,ry=g.rotation,cs=Math.cos(ry),sn=Math.sin(ry);
    const local=(u,v)=>({x:g.x-gov.s.x+cs*u+sn*v,z:g.z-gov.s.z-sn*u+cs*v});
    const b=(mat,u,y,v,w,h,d,solid=false)=>{const p=local(u,v);return placedBox(gov,mat,p.x,y,p.z,w,h,d,ry,solid)};
    const wings=source(gov,'way/1372583964',M.offWhite,12.3);
    for(const e of sourceEdges(wings))if(e.L>10){
      for(let y=2;y<12;y+=3.5)edgePanel(gov,e,M.glass,y,2.1,e.L-2);
      for(let k=3;k<e.L;k+=6)placedBox(gov,M.offWhite,e.x+e.tx*(k-e.L/2)+e.nx*.8,.5,e.z+e.tz*(k-e.L/2)+e.nz*.8,.65,11.8,.5,e.ry,false);
    }
    b(M.offWhite,0,.3,0,82,64,36,true);
    for(const side of [-1,1]){
      b(M.glass,0,3,side*18.2,71,56,.4);
      for(let u=-34;u<=34;u+=4.55)b(M.white,u,3,side*18.6,.65,56,.4);
      for(let y=6;y<62;y+=3.4)b(M.white,0,y,side*18.6,72,.5,.5);
    }
    for(const u of [-39,39])b(M.darkStone,u,.3,0,3.5,64,36.4);
    b(M.offWhite,0,63,0,84,1.3,38);b(M.concrete,0,64.3,-3,27,2.3,12);
    for(const u of [-11,11])b(M.stone,u,.3,22,2.4,9.8,9,true);
    b(M.stone,0,10.1,22,24.4,1.5,9);
    const entry=local(0,27);sign(gov,'沭阳县人民政府',entry.x,10.7,entry.z,21,1.8,ry,'#b6aea0','#473b2b');
    for(let i=0;i<4;i++)b(M.stone,0,.23+i*.12,29+i*1.3,30+i*2,.2,1.4);
    const pole=local(0,61);cyl(gov,M.metal,pole.x,.3,pole.z,.15,.2,22,8);
    const flag=mesh(gov,new THREE.PlaneGeometry(5.4,3.4),new THREE.MeshStandardNodeMaterial({color:0xc02c28,side:THREE.DoubleSide}));
    flag.position.set(pole.x+2.7,20,pole.z);flag.rotation.y=ry;
    const west=source(gov,'way/1372583963',M.offWhite,13.5);
    const wx=2145.75-gov.s.x,wz=1691-gov.s.z;
    hipRoof(gov,wx,wz,140,85,14,5.5,ry+Math.PI/2);
    for(const e of sourceEdges(west))if(e.L>30){
      edgePanel(gov,e,M.glass,1,11.5,e.L-3);
      for(let k=3;k<e.L;k+=5)placedBox(gov,M.white,e.x+e.tx*(k-e.L/2)+e.nx*1.1,.3,e.z+e.tz*(k-e.L/2)+e.nz*1.1,1.1,13,.9,e.ry,false);
    }
  }
  const sports=ctxFor('沭阳体育中心');
  if(!sports)return;
  sports.g.userData.photoBasis='2026 Shuyang official aerial and north-arrow plan; roof heights approximate';
  const gym=source(sports,CIVIC_LAYOUT.gym.sourceId,M.offWhite,12.6);
  const gg=CIVIC_LAYOUT.gym;
  hipRoof(sports,gg.x-sports.s.x,gg.z-sports.s.z,gg.width,gg.depth,13,6.3);
  for(const e of sourceEdges(gym))if(e.L>15){
    edgePanel(sports,e,M.glass,1,9.5,e.L-2);
    for(let k=3;k<e.L;k+=5)placedBox(sports,M.offWhite,e.x+e.tx*(k-e.L/2)+e.nx*.8,.3,e.z+e.tz*(k-e.L/2)+e.nz*.8,.7,12,.5,e.ry,false);
    edgePanel(sports,e,M.white,10.5,1.1,e.L+1,.9);
  }
  sign(sports,'沭阳体育馆',gg.x-sports.s.x,11,4623-sports.s.z,28,2.4,0,'#c7c8c1','#434c52');
  const pool=source(sports,CIVIC_LAYOUT.pool.sourceId,M.darkStone,CIVIC_LAYOUT.pool.height);
  for(const e of sourceEdges(pool))if(e.L>10){
    edgePanel(sports,e,M.blueGlass,.5,8.8,e.L-.8);
    edgePanel(sports,e,M.roof,10,.8,e.L+1,.8);
    for(let k=2;k<e.L;k+=4)placedBox(sports,M.frame,e.x+e.tx*(k-e.L/2)+e.nx*.8,.5,e.z+e.tz*(k-e.L/2)+e.nz*.8,.18,9,.3,e.ry,false);
  }
  const poolFront=sourceEdges(pool).filter(e=>e.L>30).sort((a,b)=>b.nz-a.nz)[0];
  sign(sports,'游泳馆',poolFront.x+poolFront.nx,8,poolFront.z+poolFront.nz,18,2.2,poolFront.facing,'#425560','#edf3f5');
  const st=CIVIC_LAYOUT.stadium,cx=st.x-sports.s.x,cz=st.z-sports.s.z;
  placedBox(sports,M.grass,cx,.28,cz,st.pitchWidth,.1,st.pitchLength,0,false);
  const oval=r=>{
    const points=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI;points.push({x:cx+Math.cos(a)*r,z:cz+42+Math.sin(a)*r})}
    for(let i=0;i<=32;i++){const a=Math.PI+i/32*Math.PI;points.push({x:cx+Math.cos(a)*r,z:cz-42+Math.sin(a)*r})}return points;
  };
  polygon(sports,oval(47.8),[oval(37.8)],.08,.3,M.track,'南北向田径跑道');
  const lineMat=new THREE.LineBasicNodeMaterial({color:0xf5eee5});
  const fieldLine=(points,closed=false)=>{const p=points.map(([x,z])=>new THREE.Vector3(cx+x,.51,cz+z));if(closed)p.push(p[0]);const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),lineMat);sports.g.add(l)};
  fieldLine([[-34,-52.5],[34,-52.5],[34,52.5],[-34,52.5]],true);fieldLine([[-34,0],[34,0]]);
  fieldLine(Array.from({length:65},(_,i)=>[Math.cos(i/64*Math.PI*2)*9.15,Math.sin(i/64*Math.PI*2)*9.15]));
  for(const side of [-1,1]){fieldLine([[-20.16,side*52.5],[-20.16,side*36],[20.16,side*36],[20.16,side*52.5]]);
    for(const x of [-3.66,3.66])cyl(sports,M.white,cx+x,.5,cz+side*52.5,.06,.06,2.44,6);
    placedBox(sports,M.white,cx,2.9,cz+side*52.5,7.44,.12,.12,0,false);
  }
  for(let lane=1;lane<=8;lane++){const p=oval(37.8+lane*1.22).map(q=>new THREE.Vector3(q.x,.49,q.z));p.push(p[0]);sports.g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),lineMat))}
  const sector=(innerX,innerZ,outerX,outerZ,a0,a1)=>{
    const p=[];for(let i=0;i<=32;i++){const a=a0+(a1-a0)*i/32;p.push({x:cx+Math.cos(a)*outerX,z:cz+Math.sin(a)*outerZ})}
    for(let i=32;i>=0;i--){const a=a0+(a1-a0)*i/32;p.push({x:cx+Math.cos(a)*innerX,z:cz+Math.sin(a)*innerZ})}return p;
  };
  const roofMat=new THREE.MeshStandardNodeMaterial({color:0xb5bfc4,metalness:.5,roughness:.45,side:THREE.DoubleSide});
  for(const [a0,a1] of [[-1.24,1.24],[Math.PI-1.24,Math.PI+1.24]]){
    // Separate east/west stands retain wide north/south entrances and the field.
    const outline=sector(63,100,111,116,a0,a1);polygon(sports,outline,[],3.5,3,M.concrete,'开敞看台走廊');collider(sports,outline,[],3,18);
    for(let step=0;step<12;step++){
      const t=step/12,n=(step+1)/12;
      polygon(sports,sector(63+48*t,100+16*t,63+48*n,100+16*n,a0,a1),[],1,6.5+step*.85,step%3===0?M.offWhite:M.red,'阶梯看台');
    }
    const positions=[];
    for(let i=0;i<16;i++){
      const a=a0+(a1-a0)*i/16,b=a0+(a1-a0)*(i+1)/16,m=(a+b)/2;
      const p=(rx,rz,t,y)=>[cx+Math.cos(t)*rx,y,cz+Math.sin(t)*rz];
      const A=p(69,101,a,23),B=p(114,118,a,21.7),C=p(115,119,m,26),D=p(114,118,b,21.7),E=p(69,101,b,23);
      positions.push(...A,...B,...C,...A,...C,...E,...E,...C,...D);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();mesh(sports,geo,roofMat,'东西看台三角折板屋盖');
    for(let i=0;i<=16;i++){
      const a=a0+(a1-a0)*i/16,x=cx+Math.cos(a)*106,z=cz+Math.sin(a)*112;
      cyl(sports,M.white,x,.3,z,.35,.4,8,8,true);
      for(const side of [-1,1]){
        const t=a+side*.035,start=new THREE.Vector3(x,6,z),end=new THREE.Vector3(cx+Math.cos(t)*114,22,cz+Math.sin(t)*118),v=end.clone().sub(start);
        const beam=mesh(sports,new THREE.CylinderGeometry(.2,.27,v.length(),6),M.white,'V形屋架');beam.position.copy(start).add(end).multiplyScalar(.5);beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());
      }
    }
  }
  sign(sports,'沭阳体育中心',cx,6.5,cz+116,32,3,0,'#a4a69f','#34434a');
}

export {buildCivicCampuses,CIVIC_LAYOUT};
