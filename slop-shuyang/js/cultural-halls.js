import * as THREE from 'three/webgpu';
import {CULTURAL_HALLS,CULTURAL_IMAGERY,ARCHIVES_ROOF,archivesRoofFootprint,hallPoint,hallEdge,hallFacePoint,hallSiteSurfaces} from './cultural-hall-layout.js';
import {createCulturalPanelMaterial} from './tsl-materials.js';

function buildCulturalHalls({ctxFor,box,sign,M,colliders}){
  const c=ctxFor('沭阳文化中心');if(!c)return;
  const group=new THREE.Group();group.name='图书馆与博物馆·实景体块';c.g.add(group);const ctx={...c,g:group};
  const std=(color,extra={})=>new THREE.MeshStandardNodeMaterial({color,roughness:.8,side:THREE.DoubleSide,shadowSide:THREE.BackSide,...extra});
  const white=createCulturalPanelMaterial(0xe3e0d5,1.2,3.4,true),stone=createCulturalPanelMaterial(0xb9b1a1,1.5,.85);
  white.side=stone.side=THREE.DoubleSide;
  // Back-face shadow casting avoids self-shadow stripes on the deliberately
  // double-sided roof/panel meshes; only these two-hall materials are affected.
  white.shadowSide=stone.shadowSide=THREE.BackSide;
  const glass=std(0x31505b,{roughness:.18,metalness:.48}),frame=std(0x68797c,{metalness:.55,roughness:.4}),roof=std(0xb7b8af),dark=std(0x292e31),paving=std(0xb7b2a5);
  for(const [name,mat] of Object.entries({white,stone,glass,frame,roof,dark,paving})){mat.name='文化两馆·'+name;mat.userData.culturalHallSurface=true;}
  const stats={halls:2,surfaceVertices:0,colliders:0,greens:0};
  const local=p=>[p.x-c.s.x,p.y,p.z-c.s.z];
  const at=(p,y)=>({...p,y});
  function mesh(vertices,uvs,mat,name){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flatMap(local),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs.flat(),2));g.computeVertexNormals();g.computeBoundingSphere();
    const m=new THREE.Mesh(g,mat);m.name=name;m.castShadow=m.receiveShadow=true;group.add(m);stats.surfaceVertices+=vertices.length;return m;
  }
  function quad(a,b,d,e,mat,name,width=1,height=1){return mesh([a,b,d,b,e,d],[[0,0],[width,0],[0,height],[width,0],[width,height],[0,height]],mat,name);}
  function flat(outer,holes,y,mat,name){
    const rings=[outer,...holes].map((r,i)=>{const q=r.map(p=>new THREE.Vector2(p.x,p.z));if(THREE.ShapeUtils.isClockWise(q)!==(i===0))q.reverse();return q;}),ps=rings.flat(),vertices=[],uvs=[];
    for(const tri of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))){
      const [a,b,d]=tri.map(i=>ps[i]);const ids=(b.y-a.y)*(d.x-a.x)-(b.x-a.x)*(d.y-a.y)>0?tri:[tri[0],tri[2],tri[1]];
      for(const i of ids){const p=ps[i];vertices.push({x:p.x,y,z:p.y});uvs.push([p.x,p.y]);}
    }return mesh(vertices,uvs,mat,name);
  }
  function walls(outer,y0,y1,mat,name,skipSide=-1){
    for(let i=0;i<outer.length;i++){if(i===skipSide)continue;const a=outer[i],b=outer[(i+1)%outer.length],L=Math.hypot(b.x-a.x,b.z-a.z);
      mesh([at(a,y0),at(a,y1),at(b,y0),at(a,y1),at(b,y1),at(b,y0)],[[0,y0],[0,y1],[L,y0],[0,y1],[L,y1],[L,y0]],mat,name);}
  }
  function collider(outer,y0,y1){colliders.push({minX:Math.min(...outer.map(p=>p.x)),maxX:Math.max(...outer.map(p=>p.x)),minZ:Math.min(...outer.map(p=>p.z)),maxZ:Math.max(...outer.map(p=>p.z)),minY:y0,maxY:y1,polygon:{outer,holes:[]},culturalHall:true});stats.colliders++;}
  function panel(h,side,u0,u1,y0,y1,mat,offset=.04,name='立面板'){
    const a=hallFacePoint(h,side,u0,offset),b=hallFacePoint(h,side,u1,offset),L=hallEdge(h,side).L*(u1-u0);
    return quad(at(a,y0),at(b,y0),at(a,y1),at(b,y1),mat,h.name+'·'+name,L,y1-y0);
  }
  const put=(mat,p,y,w,height,d,angle=0)=>box(ctx,mat,p.x-c.s.x,y,p.z-c.s.z,w,height,d,{ry:angle,collide:false});
  function beam(a,b,r=.055,mat=frame){
    const delta=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),L=delta.length();if(L<1e-6)return;
    const g=new THREE.CylinderGeometry(r,r,L,5),m=new THREE.Mesh(g,mat);m.position.set((a.x+b.x)/2-c.s.x,(a.y+b.y)/2,(a.z+b.z)/2-c.s.z);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());m.castShadow=true;group.add(m);
  }
  function ribbon(h,side,u0,u1,y0,y1,offset=.08){
    panel(h,side,u0,u1,y0,y1,glass,offset,'玻璃窗带');const e=hallEdge(h,side),count=Math.ceil((u1-u0)*e.L/1.5);
    for(let i=0;i<=count;i++){const p=hallFacePoint(h,side,u0+(u1-u0)*i/count,offset+.04);put(frame,p,y0,.06,y1-y0,.08,e.angle);}
    for(const y of [y0,y1]){const p=hallFacePoint(h,side,(u0+u1)/2,offset+.04);put(frame,p,y,(u1-u0)*e.L,.08,.09,e.angle);}
  }
  for(const h of CULTURAL_HALLS){
    const sites=hallSiteSurfaces(h);stats.greens+=sites.greens.length;
    for(const p of sites.paving)flat(p.outer,p.holes,.08,paving,h.name+'·前场铺装');
    for(const p of sites.greens)flat(p.outer,p.holes,.10,M.grass,h.name+'·来源地块内绿地');
    collider(h.outer,.3,h.displayMaxHeight);
    if(h.id==='library'){
      walls(h.outer,.3,18,white,'图书馆·侧背面',3);
      flat(h.outer,[h.skylight],18,roof,'图书馆·环形屋面');
      walls(h.outer,18,18.3,white,'图书馆·女儿墙');
      // Main west facade: the built photograph shows two recessed glass cuts,
      // an offset high ribbon, an inset central window and a glazed entry.
      ribbon(h,'west',0,1,.3,13.1,-.55);
      const patches=[[0,1,13.1,18],[0,.27,8.2,13.1],[0,.27,3,7],[.33,.66,7.5,11.4],[.33,.43,3,7.5],[.57,.66,3,7.5],[.43,.57,3,5.7],[.77,1,3,11.4],[.94,1,11.4,13.1]];
      for(const [u0,u1,y0,y1] of patches){
        panel(h,'west',u0,u1,y0,y1,white,0,'不对称白色墙板');
        // Visible jamb depth is modeled, rather than painting glass over a wall.
        for(const u of [u0,u1]){const a=hallFacePoint(h,'west',u,0),b=hallFacePoint(h,'west',u,-.55);quad(at(a,y0),at(a,y1),at(b,y0),at(b,y1),white,'图书馆·窗洞侧壁',y1-y0,.55);}
      }
      panel(h,'west',.57,.79,.3,2.9,dark,.08,'主入口阴影');
      ribbon(h,'west',.60,.75,.3,2.65,.1);
      for(const side of ['north','south'])ribbon(h,side,.04,.96,6.8,8.0);
      const e=hallEdge(h,'west'),title=hallFacePoint(h,'west',.966,.12);
      sign(ctx,h.name,title.x-c.s.x,10.4,title.z-c.s.z,1.3,11.4,e.facing,'#e1ded4','#4b4233',{vertical:true,border:false,fontSize:78});
      // The central feature is raised glazing over an interior hall, not an
      // open ground courtyard. The solid building collider is retained here.
      walls(h.skylight,16.3,17.8,glass,'图书馆·采光顶侧玻璃');
      const [nw,ne,se,sw]=h.skylight,n={x:(nw.x+ne.x)/2,z:(nw.z+ne.z)/2},s={x:(sw.x+se.x)/2,z:(sw.z+se.z)/2};
      quad(at(nw,17.8),at(sw,17.8),at(n,18.9),at(s,18.9),glass,'图书馆·采光顶西坡',42,12);
      quad(at(n,18.9),at(s,18.9),at(ne,17.8),at(se,17.8),glass,'图书馆·采光顶东坡',42,12);
      for(let i=0;i<=20;i++){const t=i/20,a={x:nw.x+(sw.x-nw.x)*t,z:nw.z+(sw.z-nw.z)*t},b={x:ne.x+(se.x-ne.x)*t,z:ne.z+(se.z-ne.z)*t},mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};beam(at(a,17.84),at(mid,18.94));beam(at(mid,18.94),at(b,17.84));}
      for(const [u,y] of [[0,17.84],[.5,18.94],[1,17.84]])beam(at({x:nw.x+(ne.x-nw.x)*u,z:nw.z+(ne.z-nw.z)*u},y),at({x:sw.x+(se.x-sw.x)*u,z:sw.z+(se.z-sw.z)*u},y));
      for(const [u,v] of [[.12,.15],[.85,.16],[.14,.83],[.83,.84]])put(dark,hallPoint(h,u,v),18.05,3,.6,2.1,e.angle);
    }else{
      walls(h.outer,.3,h.height,stone,'博物馆·石材主体');
      const profile=h.roofProfile;
      for(let i=0;i<profile.length-1;i++){
        const [u0,y0]=profile[i],[u1,y1]=profile[i+1],a=hallPoint(h,u0,0),b=hallPoint(h,u0,1),d=hallPoint(h,u1,0),e=hallPoint(h,u1,1);
        quad(at(a,y0),at(b,y0),at(d,y1),at(e,y1),stone,'博物馆·折面屋顶',65,14);
        for(const v of [0,1]){const a=hallPoint(h,u0,v),b=hallPoint(h,u1,v);quad(at(a,11.7),at(b,11.7),at(a,y0),at(b,y1),stone,'博物馆·闭合山墙',14,4);}
      }
      for(const side of ['west','east','north'])ribbon(h,side,.06,.94,3.0,6.3,.07);
      ribbon(h,'south',.12,.74,.3,9.3,.12);
      const portal=[[.06,.3],[.1,13.8],[.69,15.3],[.81,10.3],[.76,.3],[.65,.3],[.70,8.2],[.65,11],[.21,9.8],[.16,.3]],e=hallEdge(h,'south');
      const contour=portal.map(([u,y])=>new THREE.Vector2(u*e.L,y)),tri=THREE.ShapeUtils.triangulateShape(contour,[]);
      for(const depth of [.3,2.8]){const ps=[],uv=[];for(const t of tri)for(const i of t){const [u,y]=portal[i],p=hallFacePoint(h,'south',u,depth);ps.push(at(p,y));uv.push([u*e.L,y]);}mesh(ps,uv,stone,'博物馆·折角门框');}
      for(let i=0;i<portal.length;i++){const a=portal[i],b=portal[(i+1)%portal.length];quad(at(hallFacePoint(h,'south',a[0],.3),a[1]),at(hallFacePoint(h,'south',b[0],.3),b[1]),at(hallFacePoint(h,'south',a[0],2.8),a[1]),at(hallFacePoint(h,'south',b[0],2.8),b[1]),stone,'博物馆·门框进深',Math.hypot((b[0]-a[0])*e.L,b[1]-a[1]),2.5);}
      for(const [u0,u1] of [[.06,.16],[.65,.76]])collider([hallFacePoint(h,'south',u0,.3),hallFacePoint(h,'south',u1,.3),hallFacePoint(h,'south',u1,2.8),hallFacePoint(h,'south',u0,2.8)],.3,h.displayMaxHeight);
      const title=hallFacePoint(h,'south',.40,2.84);sign(ctx,h.name,title.x-c.s.x,12.25,title.z-c.s.z,22,1.6,e.facing,'#b7ad99','#e3cc84',{border:false,fontSize:76});
      const d=h.dome,m=new THREE.Mesh(new THREE.SphereGeometry(d.radius,28,14,0,Math.PI*2,0,Math.PI/2),M.blueGlass);m.name='博物馆·南侧蓝色半球';m.position.set(d.x-c.s.x,d.base,d.z-c.s.z);m.castShadow=m.receiveShadow=true;group.add(m);
      collider(Array.from({length:32},(_,i)=>({x:d.x+d.radius*Math.cos(i/32*Math.PI*2),z:d.z+d.radius*Math.sin(i/32*Math.PI*2)})),d.base,d.base+d.radius);
    }
  }
  // Keep the newly appended source building's generic civic body and its own
  // collision. Only the satellite-visible roof receives authored additions.
  const a=ARCHIVES_ROOF,outer=archivesRoofFootprint(),ag=new THREE.Group();ag.name='档案馆位置推定·影像屋顶细节';group.add(ag);
  const aCtx={...c,g:ag},top=a.heightEstimate+.22,center={x:outer.reduce((s,p)=>s+p.x,0)/outer.length,z:outer.reduce((s,p)=>s+p.z,0)/outer.length};
  const onRoof=(p,mat,y,w,height,depth,angle)=>box(aCtx,mat,p.x-c.s.x,y,p.z-c.s.z,w,height,depth,{ry:angle,collide:false});
  const trim=(ring,mat,y,height,depth,inset=0)=>ring.forEach((p,i)=>{const q=ring[(i+1)%ring.length],L=Math.hypot(q.x-p.x,q.z-p.z),mid={x:(p.x+q.x)/2,z:(p.z+q.z)/2},dx=center.x-mid.x,dz=center.z-mid.z,D=Math.hypot(dx,dz);
    onRoof({x:mid.x+dx/D*inset,z:mid.z+dz/D*inset},mat,y,L,height,depth,-Math.atan2(q.z-p.z,q.x-p.x));});
  ag.add(flat(a.glazing,[],top+.035,glass,'档案馆位置推定·矩形采光面'));
  trim(a.glazing,frame,top+.045,.065,.09);
  for(let i=1;i<14;i++){const t=i/14,p={x:a.glazing[0].x+(a.glazing[3].x-a.glazing[0].x)*t,z:a.glazing[0].z+(a.glazing[3].z-a.glazing[0].z)*t},q={x:a.glazing[1].x+(a.glazing[2].x-a.glazing[1].x)*t,z:a.glazing[1].z+(a.glazing[2].z-a.glazing[1].z)*t};
    onRoof({x:(p.x+q.x)/2,z:(p.z+q.z)/2},frame,top+.045,Math.hypot(q.x-p.x,q.z-p.z),.05,.07,-Math.atan2(q.z-p.z,q.x-p.x));}
  trim(outer,stone,top,.35,.3,.25);
  ag.add(flat(a.roofWell,[],top+.02,dark,'档案馆位置推定·屋面暗色区'));trim(a.roofWell,roof,top,.32,.38);
  // A roof-only reserve must not subtract the source building in the ground
  // coverage pass. sourceFootprint explicitly keeps that body and its index.
  colliders.push({minX:Math.min(...outer.map(p=>p.x)),maxX:Math.max(...outer.map(p=>p.x)),minZ:Math.min(...outer.map(p=>p.z)),maxZ:Math.max(...outer.map(p=>p.z)),minY:top,maxY:a.displayMaxHeight,polygon:{outer,holes:[]},sourceFootprint:true,archivesRoof:true});
  ag.userData.archivesRoof={...a,bodyRetained:true};
  group.userData.culturalHalls={sourceIds:CULTURAL_HALLS.map(h=>h.sourceId),imagery:CULTURAL_IMAGERY,stats,limits:CULTURAL_HALLS.map(h=>h.limits),archivesRoof:a.sourceId};
  return{group,stats};
}
export {buildCulturalHalls};
