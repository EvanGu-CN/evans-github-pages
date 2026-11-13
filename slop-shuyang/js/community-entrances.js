import * as THREE from 'three/webgpu';
import {COMMUNITY_DETAILS} from './community-data.js';

function buildCommunityEntrances(scene){
  const root=new THREE.Group();root.name='ShuyangCommunityEntrances';const colliders=[];
  const material=(color,o={})=>new THREE.MeshStandardNodeMaterial({color,roughness:.78,...o});
  const M={stone:material(0xd1cab9),pale:material(0xe4dbd1),red:material(0x8f4038),metal:material(0x343d3c,{metalness:.5,roughness:.4}),glass:material(0x80a5ac,{metalness:.4,roughness:.2}),green:material(0x597548)};
  function box(g,gate,mat,x,y,z,w,h,d,collide=true){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y+h/2,z);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);
    if(collide){
      const cs=Math.cos(gate.heading),sn=Math.sin(gate.heading),outer=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([dx,dz])=>({x:gate.x+(x+dx)*cs+(z+dz)*sn,z:gate.z-(x+dx)*sn+(z+dz)*cs}));
      const xs=outer.map(p=>p.x),zs=outer.map(p=>p.z);
      colliders.push({minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs),minY:y,maxY:y+h,polygon:{outer,holes:[]},communityEntrance:true});
    }return mesh;
  }
  function name(g,text,x,y,z,w,color){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
    ctx.fillStyle=color;ctx.font='700 76px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,69,490);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicNodeMaterial({map:texture,transparent:true,depthWrite:false}));mesh.position.set(x,y,z);g.add(mesh);
  }
  for(const record of COMMUNITY_DETAILS.communities){
    if(!record.gate)continue;
    const gate=record.gate,g=new THREE.Group();g.name='小区入口·'+record.name;g.position.set(gate.x,0,gate.z);g.rotation.y=gate.heading;
    g.userData={photo:record.photo,placementNote:record.photo.placementNote};root.add(g);
    const gap=Math.max(8,gate.width+2);
    if(record.photo.model==='east'){
      // Red square piers, pale beam and open, sloping metal ribs from the photograph.
      for(const x of [-gap/2-1.1,gap/2+1.1])box(g,gate,M.red,x,.2,0,1.6,6,2);
      box(g,gate,M.stone,0,6.2,0,gap+4.2,.8,2.6);
      for(let x=-gap/2-1;x<=gap/2+1;x+=1.1){const rib=box(g,gate,M.metal,x,7,0,.14,.22,3.5,false);rib.rotation.x=-.28;}
      for(const z of [-1.5,1.5])box(g,gate,M.metal,0,7.1,z,gap+3,.14,.14,false);
      name(g,'东方名都',0,6.6,1.34,6.4,'#ad4437');
    }else if(record.photo.model==='parisStone'){
      // Only the confirmed name-wall style. Do not splice separate gate photos
      // into an invented arch or assert they depict the same physical entrance.
      const x=-gap/2-6.5;
      box(g,gate,M.stone,x,.2,0,10,2,.8);
      box(g,gate,M.stone,x,.1,0,10.8,.22,1.5,false);
      box(g,gate,M.green,x,.2,1.15,10.5,.55,.65,false);
      name(g,'巴黎新城',x,1.35,.43,7.8,'#a13c34');
    }else if(record.photo.model==='zitengCurve'){
      // The named curved beam is corroborated by a second public photograph.
      // Dimensions/column count are not surveyed; only the visible central bay
      // is reconstructed, without inventing the neighbouring shops or a city gate.
      for(const x of [-gap/2-1,gap/2+1]){
        const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.7,.75,5.9,12),M.red);
        pillar.position.set(x,3.15,0);pillar.castShadow=pillar.receiveShadow=true;g.add(pillar);
        box(g,gate,M.red,x,.2,0,1.45,5.9,1.45,true).visible=false;
        for(let y=1;y<6;y+=1)box(g,gate,M.pale,x,y,.735,1.25,.035,.03,false);
      }
      const w=gap+8,positions=[],indices=[];
      for(let i=0;i<=20;i++){
        const x=-w/2+w*i/20,curve=.55*(2*x/w)**2;
        positions.push(x,6.1+curve,-1.1,x,7+curve,-1.1,x,6.1+curve,1.1,x,7+curve,1.1);
        if(i<20){const a=i*4,b=a+4;indices.push(a,b,a+1,a+1,b,b+1,a+2,a+3,b+2,a+3,b+3,b+2,a+1,b+1,a+3,a+3,b+1,b+3,a,b,a+2,a+2,b,b+2)}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
      const beam=new THREE.Mesh(geo,M.pale);beam.castShadow=beam.receiveShadow=true;g.add(beam);
      box(g,gate,M.pale,0,6.1,0,w,1.45,2.2,true).visible=false;
      for(let i=0;i<20;i++){const x=-w/2+w*(i+.5)/20,curve=.55*(2*x/w)**2;
        for(const y of [6.14,6.94])box(g,gate,M.red,x,y+curve,1.13,w/20+.03,.09,.09,false)}
      name(g,'紫藤花园',0,6.6,1.16,6.3,'#aa884c');
    }else if(record.photo.model==='mingzhuStone'){
      // A side name-stone is verified; the photograph does not prove an arch.
      const x=-gap/2-5.4;
      const rockGeo=new THREE.DodecahedronGeometry(1,1),vertices=rockGeo.getAttribute('position');
      for(let i=0;i<vertices.count;i++){
        const u=vertices.getX(i),v=vertices.getY(i),q=vertices.getZ(i);
        const rough=1+.07*Math.sin(u*9+v*4)+.045*Math.cos(q*8-v*6);
        vertices.setXYZ(i,(u+.12*v)*rough,Math.max(-.72,v*(.92+.11*u)),q*rough);
      }
      vertices.needsUpdate=true;rockGeo.computeVertexNormals();
      const stone=new THREE.Mesh(rockGeo,M.stone);
      stone.scale.set(5.2,1.65,1.35);stone.position.set(x,1.42,0);stone.castShadow=stone.receiveShadow=true;g.add(stone);
      box(g,gate,M.stone,x,.2,0,9.4,2.8,2.4,true).visible=false;
      name(g,'东方明珠城',x,1.9,1.37,7.3,'#a63c32');
      for(let k=0;k<18;k++)box(g,gate,M.metal,x-4.3-k*.4,.3,-.7,.065,1.6,.065,false);
      box(g,gate,M.metal,x-7.5,1.7,-.7,7,.08,.08,false);
    }
  }
  root.userData.audit=COMMUNITY_DETAILS.audit;scene.add(root);return {group:root,colliders};
}
export {buildCommunityEntrances};
