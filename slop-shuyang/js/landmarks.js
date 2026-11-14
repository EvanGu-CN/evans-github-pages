import * as THREE from 'three/webgpu';
import { LANDMARK_SITES } from './city-config.js';
import { createBuildingMaterials } from './building-materials.js';
import { createBuildingFootprints } from './building-footprints.js';
import { GEO } from './shuyang-geodata.js';
import { buildPhotoLandmarks } from './photo-landmarks.js';
import { buildRtMartDistrict } from './rtmart-district.js';
import { buildCorePhotoBuildings } from './core-photo-buildings.js';
import { buildWorkersPalace } from './workers-palace.js';
import { buildHuachenHousing } from './huachen-housing.js';
import { buildCivicCampuses } from './civic-campuses.js';
import { buildMengxiCampus } from './mengxi-campus.js';
import { buildShiyanCampus } from './shiyan-campus.js';
import { buildWodeDistrict } from './wode-district.js';
import { buildWodeStreetscape } from './wode-streetscape.js';
import { buildBayiDistrict } from './bayi-district.js';
import { buildMizhongCampus } from './mizhong-campus.js';
import { buildMizhongPrecinct } from './mizhong-precinct.js';
import { buildCoreRetail } from './core-retail.js';
import { buildCoreCommercialFrontages } from './core-commercial-frontages.js';
import { buildHospitalPrecinct } from './hospital-precinct.js';
import { buildGovernmentServiceCenter } from './government-service-center.js';
import { buildTaizhouCorridor } from './taizhou-corridor.js';
import { buildParkFootbridges } from './park-bridges.js';
import { batchStaticGroupMeshes } from './city-grid.js';

// 沭阳城区代表地标的实景参考模型与来源步行桥。
// 坐标与保留区来自 city-config 的 LANDMARK_SITES；造型参考公开资料与街景体量，
// 属于识别性重建，不是测绘级复原。
//
// 中央城市广场：来源L形商业裙房 + 源轮廓定位的147.15 m公寓主塔
// 县政府：政务广场、主楼、中央塔、柱廊
// 文化中心：博物馆/美术馆/图书馆三馆 + 文化广场
// 体育中心：体育场、体育馆、全民健身中心（学院路与上海南路）
// 沭阳站：低矮绿玻璃站房、波浪檐口、铁路塔柱
// 虞姬生态园：湖岸建筑、平桥
// 南湖公园：来源岸线、岛屿、广场与四座地图步行桥、长廊
// 蓝天国际商贸城 / 万达广场：大型商业综合体
// 吴印咸故居：江淮民居院落
// 老服装厂城市休闲街区：平行红砖坡顶厂房
// 沭水之阳：新沂河大桥南端银色书法雕塑

const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

function materials() {
  const std = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.72, metalness: 0.05, ...o });
  return {
    white: std(0xe9e5da),
    offWhite: std(0xdcd7ca),
    stone: std(0xb8b2a4, { roughness: 0.85 }),
    darkStone: std(0x6d685e, { roughness: 0.8 }),
    concrete: std(0x9a978e, { roughness: 0.9 }),
    glass: std(0x2c4f63, { roughness: 0.16, metalness: 0.78 }),
    blueGlass: std(0x2f6f8f, { roughness: 0.18, metalness: 0.72 }),
    greenGlass: std(0x3f7a5f, { roughness: 0.2, metalness: 0.6 }),
    frame: std(0x8c949b, { roughness: 0.4, metalness: 0.6 }),
    red: std(0x9c3a30, { roughness: 0.65 }),
    brick: std(0xa14b36, { roughness: 0.88 }),
    tile: std(0x3f4a4d, { roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide }),
    gold: std(0xc39a4a, { roughness: 0.35, metalness: 0.7 }),
    bronze: std(0x7d6136, { roughness: 0.5, metalness: 0.55 }),
    wood: std(0x7a3f2f, { roughness: 0.8 }),
    grass: std(0x4e7245, { roughness: 0.95 }),
    track: std(0xa44b36, { roughness: 0.9 }),
    metal: std(0x5a6068, { roughness: 0.35, metalness: 0.7 }),
    roof: std(0x555a5e, { roughness: 0.75, metalness: 0.2 }),
    water: std(0x1d4a5c, { roughness: 0.15, metalness: 0.25 }),
    led: new THREE.MeshBasicNodeMaterial({ color: 0x0d1a24 })
  };
}

function makeSignTexture(text, bg = '#10202b', fg = '#ffd36b', options = {}) {
  const c = document.createElement('canvas');
  c.width = options.vertical ? 128 : 128 * (options.aspect || 4);
  c.height = options.vertical ? 128 * text.length : 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  if (options.border !== false) ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
  ctx.fillStyle = fg;
  const size = options.fontSize || (text.length > 8 ? 40 : text.length > 6 ? 48 : 58);
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (options.vertical) [...text].forEach((char,i)=>ctx.fillText(char,64,i*128+68));
  else ctx.fillText(text, c.width / 2, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildLandmarks(scene) {
  const root = new THREE.Group();
  root.name = 'ShuyangLandmarks';
  const colliders = [];
  const M = materials();
  const facadeMaterials = createBuildingMaterials();

  const ctxFor = (name) => {
    const s = LANDMARK_SITES[name];
    if (!s) return null;
    const g = new THREE.Group();
    g.name = `地标·${name}`;
    g.position.set(s.x, 0, s.z);
    root.add(g);
    return { s, g, M };
  };

  const box = (c, mat, x, y, z, w, h, d, opts = {}) => {
    // Residential landmark towers use the same metre-sized windows as the source buildings.
    const mesh = opts.residential ? createBuildingFootprints(facadeMaterials[0], [{
      cx: 0, cz: 0, height: h, baseHeight: 0, levels: opts.levels || 0, seed: 337, tone: .5,
      polygons: [{ outer: [{x:-w/2,z:-d/2},{x:w/2,z:-d/2},{x:w/2,z:d/2},{x:-w/2,z:d/2}], holes: [] }]
    }]) : new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, opts.residential ? y - .22 : y + h / 2, z);
    mesh.rotation.y = opts.ry || 0;
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = true;
    c.g.add(mesh);
    if (opts.collide !== false) {
      const cs = Math.abs(Math.cos(opts.ry || 0)), sn = Math.abs(Math.sin(opts.ry || 0));
      const hw = (w * cs + d * sn) / 2, hd = (d * cs + w * sn) / 2;
      colliders.push({
        minX: c.s.x + x - hw, maxX: c.s.x + x + hw,
        minZ: c.s.z + z - hd, maxZ: c.s.z + z + hd,
        minY: 0, maxY: y + h, polygon: null
      });
    }
    return mesh;
  };
  const cyl = (c, mat, x, y, z, rt, rb, h, seg = 16, collide = false) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    c.g.add(mesh);
    if (collide) {
      colliders.push({ minX: c.s.x + x - rb, maxX: c.s.x + x + rb, minZ: c.s.z + z - rb, maxZ: c.s.z + z + rb, minY: 0, maxY: y + h, polygon: null });
    }
    return mesh;
  };
  const sign = (c, text, x, y, z, w, h, ry = 0, bg = '#10202b', fg = '#ffd36b', options = {}) => {
    const mat = new THREE.MeshBasicNodeMaterial({ map: makeSignTexture(text, bg, fg, options) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    c.g.add(mesh);
    return mesh;
  };
  const sourceBody = (c, material, height, opts={}) => {
    const records = (GEO.mapBuildings || []).filter(b => b.id === c.s.sourceId);
    if (!records.length) throw new Error(`缺少地标源轮廓：${c.s.sourceId}`);
    for (const b of records) {
      const ring = (flat, Ctor, local = true) => {
        const p = new Ctor();
        p.moveTo(flat[0] - c.s.x, -(flat[1] - c.s.z));
        for (let i=2;i<flat.length;i+=2) p.lineTo(flat[i]-c.s.x, -(flat[i+1]-c.s.z));
        p.closePath(); return p;
      };
      const shape = ring(b.o, THREE.Shape);
      shape.holes = (b.holes || []).map(h => ring(h, THREE.Path));
      const geometry = opts.residential?null:new THREE.ExtrudeGeometry(shape, {depth:height, bevelEnabled:false});
      if(geometry) geometry.rotateX(-Math.PI/2);
      const localPoints=flat=>Array.from({length:flat.length/2},(_,i)=>({x:flat[i*2]-c.s.x,z:flat[i*2+1]-c.s.z}));
      const mesh = opts.residential?createBuildingFootprints(facadeMaterials[0],[{height,baseHeight:0,cx:0,cz:0,levels:opts.levels||0,seed:337,tone:.5,
        polygons:[{outer:localPoints(b.o),holes:(b.holes||[]).map(localPoints)}]}]):new THREE.Mesh(geometry, material);
      mesh.position.y=opts.residential?0:.22;
      mesh.castShadow=mesh.receiveShadow=true;c.g.add(mesh);
      if(height<.3) continue; // A mapped plinth does not close an open courtyard.
      const toPoints = flat => Array.from({length:flat.length/2},(_,i)=>({x:flat[i*2],z:flat[i*2+1]}));
      const points=toPoints(b.o),xs=points.map(p=>p.x),zs=points.map(p=>p.z);
      colliders.push({minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs),
        minY:0,maxY:height+.22,polygon:{outer:points,holes:(b.holes||[]).map(toPoints)},sourceFootprint:true});
    }
  };
  const sourceEdges=c=>{
    const b=GEO.mapBuildings.find(b=>b.id===c.s.sourceId),n=b.o.length/2;
    let signedArea=0;for(let i=0;i<n;i++){const j=(i+1)%n;signedArea+=b.o[i*2]*b.o[j*2+1]-b.o[j*2]*b.o[i*2+1]}
    return Array.from({length:n},(_,i)=>{const j=(i+1)%n,dx=b.o[j*2]-b.o[i*2],dz=b.o[j*2+1]-b.o[i*2+1],L=Math.hypot(dx,dz);
      const x=(b.o[j*2]+b.o[i*2])/2-c.s.x,z=(b.o[j*2+1]+b.o[i*2+1])/2-c.s.z;
      const side=signedArea>0?1:-1,nx=side*dz/L,nz=-side*dx/L;
      return {x,z,L,nx,nz,tx:dx/L,tz:dz/L,ry:-Math.atan2(dz,dx),facing:Math.atan2(nx,nz)};
    });
  };
  const edgePanel=(c,e,mat,y,h,w=e.L,offset=.4)=>box(c,mat,e.x+e.nx*offset,y,e.z+e.nz*offset,w,h,.5,{ry:e.ry,collide:false});
  const gable = (c, mat, x, y, z, w, d, h, ry = 0) => {
    const hw = w / 2, hd = d / 2;
    const p = [
      -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
      -hw, h, 0, hw, h, 0
    ];
    const idx = [0, 1, 5, 0, 5, 4, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    c.g.add(mesh);
    // ridge
    box(c, mat, x, y + h - 0.15, z, w + 0.4, 0.3, 0.4, { collide: false, cast: false });
    return mesh;
  };
  const pyramidRoof = (c, mat, x, y, z, w, d, h) => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), mat);
    mesh.scale.set(w * 0.78, h, d * 0.78);
    mesh.rotation.y = Math.PI / 4;
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    c.g.add(mesh);
    return mesh;
  };
  const finial = (c, x, y, z) => {
    cyl(c, M.gold, x, y, z, 0.18, 0.18, 1.2, 8);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), M.gold);
    s.position.set(x, y + 1.45, z);
    c.g.add(s);
  };
  const tree = (c, x, z, scale = 1) => {
    cyl(c, M.wood, x, 0.22, z, 0.18 * scale, 0.26 * scale, 2.2 * scale, 6);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.9 * scale, 10, 8), M.grass);
    crown.position.set(x, 2.2 * scale + 1.5 * scale, z);
    crown.scale.y = 1.2;
    crown.castShadow = true;
    c.g.add(crown);
  };
  const pavilion = (c, x, z, baseW, levels = 3, baseY = 0.3) => {
    let w = baseW;
    let y = baseY;
    box(c, M.stone, x, y, z, w * 1.5, 0.5, w * 1.5, { collide: false });
    y += 0.5;
    for (let l = 0; l < levels; l++) {
      const colH = l === levels - 1 ? 2.8 : 3.2;
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
        cyl(c, M.red, x + dx * w * 0.42, y, z + dz * w * 0.42, 0.2, 0.22, colH, 8);
      }
      box(c, M.red, x, y + colH - 0.25, z, w * 0.95, 0.3, w * 0.95, { collide: false, cast: false });
      pyramidRoof(c, M.tile, x, y + colH, z, w * 1.35, w * 1.35, 1.5);
      y += colH + 1.3;
      w *= 0.76;
    }
    finial(c, x, y + 0.2, z);
    box(c, M.stone, x, baseY, z, w * 0.9, 0.2, w * 0.9, { collide: false });
  };
  const statue = (c, x, z, scale = 1) => {
    box(c, M.stone, x, 0.25, z, 4.4 * scale, 1.8 * scale, 4.4 * scale);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * scale, 1.0 * scale, 3.4 * scale, 10), M.bronze);
    body.position.set(x, 2.05 * scale + 1.7 * scale, z);
    body.castShadow = true;
    c.g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.48 * scale, 12, 10), M.bronze);
    head.position.set(x, 2.05 * scale + 3.6 * scale, z);
    head.castShadow = true;
    c.g.add(head);
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(1.1 * scale, 2.4 * scale, 10, 1, true), M.bronze);
    cloak.position.set(x + 0.4 * scale, 2.05 * scale + 2.1 * scale, z - 0.3 * scale);
    cloak.rotation.z = -0.18;
    cloak.castShadow = true;
    c.g.add(cloak);
    sign(c, '虞姬像', x, 2.2 * scale, z + 2.4 * scale, 4, 1, 0, '#241a12', '#e8c98a');
  };
  const archway = (c, x, z, text = '虞姬公园', ry = 0) => {
    const bays = [-7.5, -2.5, 2.5, 7.5];
    for (const bx of bays) {
      box(c, M.stone, x + bx, 0.22, z, 1.2, 0.8, 1.2, { collide: false });
      cyl(c, M.red, x + bx, 1.0, z, 0.38, 0.42, 7.6, 10);
    }
    box(c, M.red, x, 7.2, z, 18, 1.0, 1.4, { collide: false });
    box(c, M.gold, x, 8.2, z, 19.2, 0.35, 1.8, { collide: false });
    gable(c, M.tile, x, 8.6, z, 20, 4.2, 2.2);
    sign(c, text, x, 8.8, z + (ry ? -0.8 : 0.8), 6.4, 1.6, ry, '#2a1712', '#e8c98a');
  };
  const corridor = (c, x, z, length = 52, alongX = true) => {
    const n = Math.max(2, Math.round(length / 6));
    for (let i = 0; i <= n; i++) {
      const t = -length / 2 + (length * i) / n;
      cyl(c, M.red, x + (alongX ? t : 0), 0.22, z + (alongX ? 0 : t), 0.18, 0.2, 3.4, 8);
    }
    box(c, M.red, x, 3.5, z, alongX ? length : 1.2, 0.3, alongX ? 1.2 : length, { collide: false, cast: false });
    gable(c, M.tile, x, 3.7, z, alongX ? length + 2 : 4.2, alongX ? 4.2 : length + 2, 1.4, alongX ? 0 : Math.PI / 2);
  };
  const archBridge = (c, x, z, length = 56, width = 7) => {
    box(c, M.stone, x, 2.0, z, length, 0.9, width, { collide: false });
    const n = 9;
    for (let i = 0; i < n; i++) {
      const ax = x - length / 2 + (length / n) * (i + 0.5);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.42, 8, 14, Math.PI), M.stone);
      arch.position.set(ax, 2.0, z);
      arch.castShadow = true;
      c.g.add(arch);
    }
    for (const side of [-1, 1]) {
      box(c, M.stone, x, 2.9, z + side * (width / 2), length, 0.5, 0.35, { collide: false });
      for (let i = -6; i <= 6; i++) {
        cyl(c, M.stone, x + i * 4.2, 2.9, z + side * (width / 2), 0.13, 0.15, 1.2, 6);
      }
    }
    sign(c, '九孔桥', x, 2.2, z + width / 2 + 0.2, 4.4, 1, 0, '#1c2620', '#e8d6a8');
  };

  // ===================================================================================================================
  // 中央城市广场：147.15m 主塔 + 商业裙房 + 两栋住宅
  // ===================================================================================================================
  {
    const c = ctxFor('中央城市广场');
    if (c) {
      // 保留中央商场完整L形轮廓；主塔回到来源实测轮廓，而不是放在猜测的位置。
      sourceBody(c,M.offWhite,26.9);
      sourceBody({...c,s:{...c.s,sourceId:'way/1455053540'}},M.offWhite,147.15,{residential:true,levels:40});
      const edges=sourceEdges(c);
      for(const e of edges){
        if(e.L<8)continue;
        edgePanel(c,e,M.glass,1.3,20,e.L-.8);
        edgePanel(c,e,M.offWhite,22,4.7,e.L+.3,.7);
        for(let k=2;k<e.L;k+=10) box(c,M.frame,e.x+e.tx*(k-e.L/2)+e.nx*.8,.3,e.z+e.tz*(k-e.L/2)+e.nz*.8,.5,24,.6,{ry:e.ry,collide:false});
      }
      const front=edges.filter(e=>e.L>30).sort((a,b)=>b.nz-a.nz)[0];
      sign(c,'中央商场',front.x+front.nx,23.7,front.z+front.nz,32,4.6,front.facing,'#5c2323','#ead2a6');
      // 主塔实拍中的浅色墙柱与避难层暗带，尺寸仍按公开实高和照片比例。
      const towerEdges=sourceEdges({...c,s:{...c.s,sourceId:'way/1455053540'}});
      for(const e of towerEdges)for(const y of [49,101.5])edgePanel(c,e,M.darkStone,y,.8,e.L+.4,.35);
    }
  }

  // ===================================================================================================================
  // 沭阳文化中心：博物馆 / 美术馆 / 图书馆 + 文化广场
  // ===================================================================================================================
  {
    const c = ctxFor('沭阳文化中心');
    if (c) {
      // 三馆位置按来源轮廓保留；外观参考 UAD 实拍与2026图书馆航拍。
      box(c,M.stone,0,.03,0,250,.25,210,{collide:false,cast:false});
      for(const [sourceId,mat,height] of [['way/1321791112',M.stone,13.5],['way/1321791113',M.stone,.2],['way/1321791114',M.white,18]]) {
        sourceBody({...c,s:{...c.s,sourceId}},mat,height);
      }
      // 美术馆：红砖方块与屋顶椭圆采光井、周围黑白盒体。
      const sh=new THREE.Shape();sh.moveTo(-24,-22);sh.lineTo(24,-22);sh.lineTo(24,22);sh.lineTo(-24,22);sh.closePath();
      const hole=new THREE.Path();hole.absellipse(0,0,12,8,0,Math.PI*2,true);sh.holes.push(hole);
      const artGeo=new THREE.ExtrudeGeometry(sh,{depth:26.8,bevelEnabled:false});artGeo.rotateX(-Math.PI/2);
      const art=new THREE.Mesh(artGeo,M.brick);art.position.set(68,.3,-30);art.castShadow=art.receiveShadow=true;c.g.add(art);
      colliders.push({minX:c.s.x+44,maxX:c.s.x+92,minZ:c.s.z-52,maxZ:c.s.z-8,minY:0,maxY:27.1,
        polygon:{outer:[[44,-52],[92,-52],[92,-8],[44,-8]].map(([x,z])=>({x:c.s.x+x,z:c.s.z+z})),
          holes:[Array.from({length:32},(_,i)=>({x:c.s.x+68+12*Math.cos(i/32*Math.PI*2),z:c.s.z-30+8*Math.sin(i/32*Math.PI*2)}))]}});
      const rim=new THREE.Mesh(new THREE.TorusGeometry(10,.45,6,48),M.stone);rim.rotation.x=-Math.PI/2;rim.scale.y=.8;rim.position.set(68,27.3,-30);c.g.add(rim);
      for(const [x,z,w,d] of [[12,-64,35,28],[24,-4,35,25],[61,13,35,22]]) box(c,M.white,x,.3,z,w,11,d);
      box(c,M.darkStone,8,.3,-33,29,12,30);
      box(c,M.white,55,.3,-86,38,6.5,19);
      box(c,M.darkStone,59,.3,38,42,7.5,20);
      // 实拍中的黑白分散体块、院落和玻璃连廊，避免把整馆压成一块平顶板楼。
      for(const [x,z,w,d] of [[24,-24,12,13],[42,-64,18,7],[59,26,13,8]]) box(c,M.glass,x,.3,z,w,5.5,d);
      for(const [x,z,w] of [[12,-49.7,29],[24,8.7,29],[61,24.2,29]]) box(c,M.glass,x,1.3,z,w,5.5,.4,{collide:false});
      sign(c,'沭阳县美术馆',40,4,25,18,2.2,0,'#eeeae1','#272a2c');
      // 装饰跟随来源多边形外沿，避免窗带或入口埋在旋转楼体内。
      const records=GEO.mapBuildings.filter(b=>c.s.sourceBuildingIndices && ['way/1321791112','way/1321791113','way/1321791114'].includes(b.id));
      const edge=(b,i)=>{
        const n=b.o.length/2,j=(i+1)%n,ax=b.o[i*2],az=b.o[i*2+1],bx=b.o[j*2],bz=b.o[j*2+1];
        const dx=bx-ax,dz=bz-az,L=Math.hypot(dx,dz),x=(ax+bx)/2-c.s.x,z=(az+bz)/2-c.s.z;
        const cx=b.o.filter((_,k)=>k%2===0).reduce((a,v)=>a+v,0)/n-c.s.x;
        const cz=b.o.filter((_,k)=>k%2===1).reduce((a,v)=>a+v,0)/n-c.s.z;
        let nx=dz/L,nz=-dx/L;if((x-cx)*nx+(z-cz)*nz<0){nx=-nx;nz=-nz}
        return {x,z,L,dx:dx/L,dz:dz/L,nx,nz,ry:-Math.atan2(dz,dx)};
      };
      const strip=(e,mat,y,h,w=e.L,offset=.35)=>box(c,mat,e.x+e.nx*offset,y,e.z+e.nz*offset,w,h,.35,{ry:e.ry,collide:false});
      for(const b of records){
        for(let i=0;i<b.o.length/2;i++){
          const e=edge(b,i);
          if(b.id==='way/1321791114'){
            strip(e,M.darkStone,12,1.6,e.L-3);
            strip(e,M.glass,1,8.5,Math.min(30,e.L*.35),.55);
            for(let k=3;k<e.L;k+=6) box(c,M.offWhite,e.x+e.dx*(k-e.L/2)+e.nx*.55,.3,e.z+e.dz*(k-e.L/2)+e.nz*.55,.16,17,.3,{ry:e.ry,collide:false});
          }else if(b.id==='way/1321791112') strip(e,M.glass,3,4.6,e.L-10);
        }
        if(b.id==='way/1321791114'){
          const e=edge(b,1);for(const [i,ch] of [...'沭阳县图书馆'].entries()) sign(c,ch,e.x+e.nx*.8,16-i*2,e.z+e.nz*.8,2,1.8,Math.atan2(e.nx,e.nz),'#e9e6dc','#51452f');
        }
        if(b.id==='way/1321791112'){
          const roofProfile=[13.7,15.8,13.7,15.3,13.7],rp=[];
          const roofPoint=(u,v,y)=>{const a=[b.o[0]*(1-v)+b.o[2]*v,b.o[1]*(1-v)+b.o[3]*v];const d=[b.o[6]*(1-v)+b.o[4]*v,b.o[7]*(1-v)+b.o[5]*v];return [a[0]*(1-u)+d[0]*u-c.s.x,y,a[1]*(1-u)+d[1]*u-c.s.z]};
          for(let i=0;i<4;i++){const a=roofPoint(i/4,0,roofProfile[i]),b1=roofPoint((i+1)/4,0,roofProfile[i+1]),d=roofPoint(i/4,1,roofProfile[i]),e1=roofPoint((i+1)/4,1,roofProfile[i+1]);rp.push(...a,...b1,...d,...b1,...e1,...d)}
          const roofGeo=new THREE.BufferGeometry();roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));roofGeo.computeVertexNormals();
          const roofMesh=new THREE.Mesh(roofGeo,new THREE.MeshStandardNodeMaterial({color:0xb9b3a6,roughness:.8,side:THREE.DoubleSide}));roofMesh.castShadow=true;c.g.add(roofMesh);
          // 南侧短边入口：蓝玻璃、厚石材折角门框。
          const e=edge(b,3);strip(e,M.blueGlass,.3,10,42,.7);
          for(const t of [-24,24]) box(c,M.stone,e.x+e.dx*t+e.nx*1.5,.3,e.z+e.dz*t+e.nz*1.5,5,13,4,{ry:e.ry});
          box(c,M.stone,e.x+e.nx*1.5,11,e.z+e.nz*1.5,53,2.5,4,{ry:e.ry,collide:false});
          sign(c,'沭阳县博物馆',e.x+e.nx*3.6,10,e.z+e.nz*3.6,24,2.5,Math.atan2(e.nx,e.nz),'#afa790','#e9e0c8');
        }
      }
      const dome=new THREE.Mesh(new THREE.SphereGeometry(8,24,14,0,Math.PI*2,0,Math.PI/2),M.blueGlass);dome.position.set(-18,11.5,75);c.g.add(dome);
    }
  }

  // ===================================================================================================================
  // 沭阳站：实拍站房与来源轮廓的斜向长轴
  // ===================================================================================================================
  {
    const c = ctxFor('沭阳站');
    if (c) {
      const colliderStart=colliders.length;
      box(c, M.stone, 0, 0.03, 20, 220, 0.3, 110, { collide: false, cast: false });
      box(c,M.offWhite,0,.3,0,124,11.5,38);
      box(c,M.greenGlass,0,1.2,19.3,116,9.3,.5,{collide:false});
      for(let x=-54;x<=54;x+=9) box(c,M.offWhite,x,.3,19.8,.8,10.7,.6,{collide:false});
      for(let y=4;y<11;y+=3.3) box(c,M.frame,0,y,19.9,116,.18,.3,{collide:false});
      // 低起伏曲线檐口，左侧铁路徽标高柱；实拍中没有中央钟楼。
      for(let i=0;i<32;i++) {
        const x=-62+(i+.5)*124/32, y=11.8+Math.cos(x/24)*1.25;
        box(c,M.offWhite,x,y,19,4,1.4,5,{collide:false});
        box(c,M.red,x,y+1.1,21.5,4,.35,.35,{collide:false});
      }
      box(c,M.offWhite,-53,.3,15,9,25,8);
      for(const x of [-57.7,-48.3]) box(c,M.red,x,.3,19.2,.7,25,.5,{collide:false});
      sign(c,'铁路',-53,21.5,19.6,6,4.3,0,'#baaa81','#a0812e');
      sign(c,'沭阳站',0,9.5,20.4,28,4,0,'#285b4d','#e9c67c');
      // 站台雨棚
      for (const z of [-34, -50]) {
        box(c, M.roof, 0, 8.4, z, 130, 0.6, 10, { collide: false });
        for (let i = -5; i <= 5; i++) cyl(c, M.stone, i * 12, 0.3, z, 0.18, 0.22, 8, 6);
      }
      // 站前广场与出租车落客
      box(c, M.stone, 0, 0.05, 55, 160, 0.3, 34, { collide: false, cast: false });
      sign(c, '站前广场', 0, 3.2, 72, 10, 2.4, 0, '#10202b', '#ffd36b');
      for (let i = 0; i < 6; i++) tree(c, -60 + i * 24, 66, 0.85);
      // OSM way/995943344 为西北—东南长条，正面位于轨道东北侧。
      // 同步变换碰撞轮廓，避免只转动外观而留下旧矩形障碍。
      c.g.rotation.y=2.32;c.g.scale.set(.8,1,.69);
      const cs=Math.cos(2.32),sn=Math.sin(2.32);
      for(const collider of colliders.slice(colliderStart)){
        const corners=[[collider.minX,collider.minZ],[collider.maxX,collider.minZ],[collider.maxX,collider.maxZ],[collider.minX,collider.maxZ]].map(([x,z])=>{
          const lx=(x-c.s.x)*.8,lz=(z-c.s.z)*.69;return {x:c.s.x+cs*lx+sn*lz,z:c.s.z-sn*lx+cs*lz};
        });
        collider.minX=Math.min(...corners.map(p=>p.x));collider.maxX=Math.max(...corners.map(p=>p.x));
        collider.minZ=Math.min(...corners.map(p=>p.z));collider.maxZ=Math.max(...corners.map(p=>p.z));collider.polygon={outer:corners,holes:[]};
      }
    }
  }

  // ===================================================================================================================
  // 虞姬公园：牌坊 + 虞姬像 + 霸王阁 + 虞姬展览馆 + 长廊
  // ===================================================================================================================
  {
    const c=ctxFor('虞姬生态园');
    if(c) {
      // 迎宾大道生态园实拍是水湾、平桥与灰瓦水岸建筑，不套用城北公园的牌坊。
      box(c,M.stone,0,.04,50,82,.3,38,{collide:false});
      box(c,M.white,28,.25,-12,48,6,25);gable(c,M.tile,28,6.25,-12,54,31,3);
      box(c,M.glass,28,.5,1,36,4.6,.4,{collide:false});
      for(const x of [-25,2,42]) box(c,M.stone,x,.25,46,3.2,.35,48,{collide:false});
      for(let x=-105;x<=105;x+=30) tree(c,x,-66,1);
      sign(c,'虞姬生态园',0,2,71,22,2.5,0,'#5a6351','#e9e7cf');
    }
  }

  // 南湖公园使用经影像核对的水系、岛屿、广场与来源步行桥。
  // 未能定位的门楼、九孔桥、展览馆、雕像不再任意摆进湖心；实拍参考仍保留。

  // ===================================================================================================================
  // 蓝天国际商贸城
  // ===================================================================================================================
  {
    const c = ctxFor('蓝天国际商贸城');
    if (c) {
      // 原模型只覆盖来源商场约四成；现在保留整座倾斜四边形主体。
      sourceBody(c,M.concrete,25);
      const edges=sourceEdges(c);
      for(const e of edges){
        edgePanel(c,e,M.glass,1.5,20,e.L-2);
        for(let y=5;y<25;y+=4.7)edgePanel(c,e,M.frame,y,.3,e.L-2,.8);
        for(let k=3;k<e.L;k+=10)box(c,M.frame,e.x+e.tx*(k-e.L/2)+e.nx*.8,1.5,e.z+e.tz*(k-e.L/2)+e.nz*.8,.3,23,.4,{ry:e.ry,collide:false});
      }
      const front=edges.reduce((a,b)=>b.nz>a.nz?b:a);
      // 实拍宽门架中央开圆洞，跟随真实南侧外沿。
      const canopy=new THREE.Shape();canopy.moveTo(-104,-8);canopy.lineTo(104,-8);canopy.lineTo(104,8);canopy.lineTo(-104,8);canopy.closePath();
      const opening=new THREE.Path();opening.absarc(0,0,6.2,0,Math.PI*2,true);canopy.holes.push(opening);
      const cg=new THREE.ExtrudeGeometry(canopy,{depth:1.2,bevelEnabled:false});cg.rotateX(-Math.PI/2);
      const cm=new THREE.Mesh(cg,M.white);cm.rotation.y=front.ry;cm.position.set(front.x+front.nx*5,26.2,front.z+front.nz*5);cm.castShadow=true;c.g.add(cm);
      for(const k of [-90,-45,45,90])cyl(c,M.frame,front.x+front.tx*k+front.nx*5,.25,front.z+front.tz*k+front.nz*5,.45,.45,26,10);
      sign(c,'蓝天国际商贸城',front.x+front.nx*13.2,29,front.z+front.nz*13.2,64,5.5,front.facing,'#c8cdce','#c36c9c');
    }
  }

  // ===================================================================================================================
  // 万达广场：官方开业实拍中的弧顶玻璃入口、浅色商场与红色屋顶字
  // ===================================================================================================================
  {
    const c = ctxFor('万达广场');
    if (c) {
      sourceBody(c,M.offWhite,17);
      const edges=sourceEdges(c);
      for(const e of edges){
        edgePanel(c,e,M.glass,1,6,e.L-4);
        edgePanel(c,e,M.white,7.5,9.3,e.L-2);
        for(let k=4;k<e.L;k+=12)box(c,M.stone,e.x+e.tx*(k-e.L/2)+e.nx*.8,7.5,e.z+e.tz*(k-e.L/2)+e.nz*.8,.35,9.3,.4,{ry:e.ry,collide:false});
      }
      const front=edges.reduce((a,b)=>b.nz>a.nz?b:a);
      const entrance=new THREE.Group();entrance.position.set(front.x+front.nx*.9,.25,front.z+front.nz*.9);entrance.rotation.y=front.facing;c.g.add(entrance);
      const arch=new THREE.Shape();arch.moveTo(-19,0);arch.lineTo(19,0);arch.lineTo(19,11);arch.quadraticCurveTo(0,22,-19,11);arch.closePath();
      entrance.add(new THREE.Mesh(new THREE.ShapeGeometry(arch),M.glass));
      const crown=new THREE.CatmullRomCurve3(Array.from({length:17},(_,i)=>{const x=-19+i*38/16;return new THREE.Vector3(x,11+5*(1-(x/19)**2),.4)}));
      entrance.add(new THREE.Mesh(new THREE.TubeGeometry(crown,32,.5,6,false),M.white));
      for(let x=-15;x<=15;x+=5){const frame=new THREE.Mesh(new THREE.BoxGeometry(.25,12,.3),M.frame);frame.position.set(x,6,.4);entrance.add(frame)}
      sign(c,'万达广场',front.x-front.tx*50+front.nx,20,front.z-front.tz*50+front.nz,30,5.5,front.facing,'#dedbd2','#b8242d');
    }
  }

  // ===================================================================================================================
  // 吴印咸故居：江淮民居院落
  // ===================================================================================================================
  {
    const c = ctxFor('吴印咸故居');
    if (c) {
      box(c, M.stone, 0, 0.05, 0, 96, 0.3, 78, { collide: false, cast: false });
      for (const [x, z, w, d] of [[0, 38, 96, 2], [0, -38, 96, 2], [-47, 0, 2, 76], [47, 0, 2, 76]]) {
        box(c, M.concrete, x, 0.2, z, w, 2.2, d, { collide: false });
      }
      // 门屋
      box(c, M.concrete, 0, 0.2, 38, 14, 3.2, 6);
      box(c,M.wood,0,.3,41.1,4.5,2.8,.25,{collide:false});
      gable(c, M.tile, 0, 3.4, 38, 18, 9, 2.2);
      sign(c, '吴印咸故居', 0, 3.0, 41.2, 9, 2.4, 0, '#241a12', '#e8c98a');
      for(const x of [-5.3,5.3]){const lantern=new THREE.Mesh(new THREE.SphereGeometry(.65,12,8),M.red);lantern.position.set(x,3.5,41.8);c.g.add(lantern)}
      box(c,M.darkStone,14,.25,42,2,1.5,2);
      cyl(c,M.metal,14,1.75,42,.5,.9,1.3,12);
      const bustHead=new THREE.Mesh(new THREE.SphereGeometry(.6,12,10),M.metal);bustHead.position.set(14,3.5,42);c.g.add(bustHead);
      // 正房
      box(c, M.white, 0, 0.25, -12, 30, 5.4, 12);
      gable(c, M.tile, 0, 5.7, -12, 36, 17, 3.2);
      box(c, M.glass, 0, 0.6, -5.8, 20, 3.4, 0.4, { collide: false, cast: false });
      // 厢房
      for (const sx of [-1, 1]) {
        box(c, M.white, sx * 28, 0.25, 8, 10, 4.4, 18);
        gable(c, M.tile, sx * 28, 4.7, 8, 15, 22, 2.6, Math.PI / 2);
      }
      box(c, M.stone, 0, 0.05, 10, 34, 0.25, 28, { collide: false, cast: false });
      tree(c, -30, -22, 0.9);
      tree(c, 30, -22, 0.9);
    }
  }

  // ===================================================================================================================
  // 老服装厂城市休闲街区：平行低矮红砖厂房与坡顶采光带
  // ===================================================================================================================
  {
    const c = ctxFor('老服装厂城市休闲街区');
    if(c) {
      // 2026 航拍可见平行低矮厂房和双坡屋脊采光带，无依据的烟囱/水塔已移除。
      box(c,M.stone,0,.03,0,180,.25,132,{collide:false,cast:false});
      for(let z=-44;z<=44;z+=29) {
        box(c,M.brick,0,.25,z,150,5.8,20);
        gable(c,M.red,0,6.05,z,154,22,2.4);
        box(c,M.glass,0,8.2,z,114,.6,1.5,{collide:false});
        for(let x=-65;x<=65;x+=14) box(c,M.glass,x,1.6,z+10.15,7.6,2,.35,{collide:false});
      }
      sign(c,'老服装厂',0,4.6,54.3,28,3.2,0,'#422c25','#f1d2a3');
      for(let x=-75;x<=75;x+=30) tree(c,x,66,.9);
    }
  }

  // 银色竖向书法带：按作者作品图与高德近照重建识别轮廓，曲面细节仍属近似。
  {
    const c=ctxFor('沭水之阳');
    if(c) {
      const silver=new THREE.MeshStandardNodeMaterial({color:0xd4dce1,metalness:.96,roughness:.18});
      for(let i=0;i<3;i++) box(c,M.stone,0,.05+i*.35,0,14-i*2,.35,14-i*2,{collide:false});
      box(c,M.stone,0,1.1,0,7,6.3,7);
      sign(c,'沭水之阳',0,4.4,3.56,4.9,3.8,0,'#a03535','#d7c6aa');
      const stroke=(points,width=1.35)=>{
        const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
        const section=new THREE.Shape();section.moveTo(-width/2,-.22);section.lineTo(width/2,-.22);section.lineTo(width/2,.22);section.lineTo(-width/2,.22);section.closePath();
        const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(section,{steps:52,bevelEnabled:false,extrudePath:curve}),silver);
        mesh.castShadow=true;mesh.receiveShadow=true;c.g.add(mesh);
      };
      stroke([[-.7,7.5,0],[-1.5,9,.5],[1.3,11,-.4],[.3,14,.2],[-1.1,17,-.4],[.8,20,.2],[-.5,24,.1],[.8,29.5,0]],1.2);
      stroke([[-.3,8.2,0],[-3.2,8.3,.4],[-4.2,10.8,0],[-2.5,13.2,-.7],[1.8,12.6,-.4],[3.1,10.5,.5],[.1,8.4,.1]],1.5);
      stroke([[.3,14.2,.1],[2.8,15.5,.5],[3.5,18.6,-.4],[1.5,19.8,-.5],[-1.8,18.9,.4],[-1.6,16.2,.6],[.3,14.2,.1]],1.25);
      stroke([[-.2,21,.1],[-2.7,22.4,-.3],[-3,25,.3],[-1.1,26.7,.5],[2,25.4,-.6],[2.8,23.4,.2],[.4,21.3,.4]],1.25);
      stroke([[.3,26.2,.2],[-1.1,28.6,.1],[-.5,31.2,-.3],[.8,32.1,.3],[1.6,30.7,.5],[.8,28.6,-.5]],.95);
    }
  }

  buildPhotoLandmarks({ctxFor,box,cyl,sign,M,sourceBody});
  buildRtMartDistrict({ctxFor,box,sourceBody,sourceEdges});
  buildCorePhotoBuildings({ctxFor,box,cyl,sign,M,sourceBody,sourceEdges,edgePanel});
  buildWorkersPalace({ctxFor,box,cyl,M,sourceBody,sourceEdges,edgePanel});
  buildHuachenHousing({ctxFor,sourceBody,M,colliders,facadeMaterial:facadeMaterials[0]});
  buildCivicCampuses({ctxFor,box,cyl,sign,M,sourceBody,sourceEdges,edgePanel,colliders});
  buildMengxiCampus({ctxFor,box,cyl,sign,M,sourceBody,sourceEdges,edgePanel,colliders});
  buildShiyanCampus({ctxFor,box,cyl,sign,M,sourceBody,sourceEdges,edgePanel,colliders});
  buildCoreRetail({ctxFor,box,cyl,sign,M,sourceEdges,edgePanel});
  buildCoreCommercialFrontages({root,box,cyl,sign,M,sourceEdges,edgePanel});
  buildGovernmentServiceCenter({root,box,sign,M,sourceEdges});
  buildHospitalPrecinct({root,box,cyl,sign,M,sourceEdges,edgePanel});
  buildTaizhouCorridor(root);
  buildWodeDistrict(root);
  buildWodeStreetscape(root);
  buildBayiDistrict(root);
  buildMizhongCampus(root);
  buildMizhongPrecinct(root);
  buildParkFootbridges(root,colliders);
  for(const group of root.children) batchStaticGroupMeshes(group,new Set(facadeMaterials));
  scene.add(root);
  const yj = LANDMARK_SITES['虞姬生态园'];
  return {
    group: root,
    colliders,
    bryantParkLawn: {
      minX: yj.x - 55, maxX: yj.x + 55,
      minZ: yj.z - 40, maxZ: yj.z + 40,
      top: 0.24
    }
  };
}

export { buildLandmarks };
export const bryantParkLawn = (() => {
  const yj = LANDMARK_SITES['虞姬生态园'] || { x: 0, z: 0 };
  return { minX: yj.x - 55, maxX: yj.x + 55, minZ: yj.z - 40, maxZ: yj.z + 40, top: 0.24 };
})();
