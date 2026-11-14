import * as THREE from 'three/webgpu';
import { GEO } from './shuyang-geodata.js';

// 大润发（沭阳店，上海南路与苏州西路交汇处东南角）。
// 来源：OSM way/497798167 轮廓；2009-12-13 北立面历史照片（白灰+橙带旧外观）；
// 2024-12 高德地点评论照片（米色石材板、白底红字门头、红色“大润发入口”横带、彩色竖条板）；
// 2026-11-13 高德 zoom-18 卫星/标准图（北侧停车场、东端立体车库、西侧屋面停车层与螺旋坡道、
// 屋顶设备、南侧商铺雨棚、前场小吃棚与收货区）；高德 POI 标注（北门/西门/东北门/收货区、
// 苏宁易购/必胜客/蜜雪冰城/好必和大食堂/罗莱家纺/开心城堡儿童乐园/小淮娘鸭血粉丝）。
// 商场共 4.8 万平方米、一至二层营业（百度百科/大润发官网），主体高度沿用 CNBH 17 米。
// 造型是识别性重建：北翼下层层高、圆角半径、车库格栅范围、屋面停车层标高、螺旋坡道口、
// 屋顶设备数量、前场车位排数均为展示估计，不是测绘复原；东端立体车库只做立面表达。
function buildRtMartDistrict({ ctxFor, box, sourceBody, sourceEdges }) {
  const c = ctxFor('大润发');
  if (!c) return;
  const s = c.s;
  c.g.userData.photoBasis = 'OSM way/497798167; 2009-12-13 north facade; 2024-12 AMap POI photo (beige 2.0 facade); AMap z18 satellite/standard 2026-11-13; AMap POI labels (gates, tenants, receiving yard); heights approximate';
  c.g.userData.geometryNote = 'Rounded NW corner radius, wing depth, east parking-garage screen, west roof parking deck elevation, spiral ramp mouth and forecourt bay rows are display estimates; the source footprint is not replaced.';

  const std = (color, o = {}) => new THREE.MeshStandardNodeMaterial({
    color, roughness: 0.74, metalness: 0.04, ...o
  });
  const beige = std(0xd8cbb2);
  const beigeDark = std(0xc4b59c);
  const white = std(0xf1efe7);
  const red = std(0xb41f2b, { roughness: 0.62 });
  const glass = std(0x33474d, { metalness: 0.58, roughness: 0.16, side: THREE.DoubleSide });
  const glassLight = std(0x7f989a, { metalness: 0.45, roughness: 0.22 });
  const grey = std(0x8c9191, { roughness: 0.7, metalness: 0.16 });
  const greyDark = std(0x5f6769, { roughness: 0.82 });
  const roofMat = std(0xb9b9b1, { roughness: 0.9 });
  const lineMat = std(0xd7d3c4, { roughness: 0.9 });
  const green = std(0x2f7248, { roughness: 0.72 });
  const orange = std(0xc7643a, { roughness: 0.72 });
  const asphalt = std(0x3a3d3c, { roughness: 0.96 });
  const awningBlue = std(0x2c64a8, { roughness: 0.68 });
  const gold = std(0xc8a24a, { metalness: 0.55, roughness: 0.42 });
  const barrierWhite = std(0xe8e6df, { roughness: 0.6 });
  const barrierBlue = std(0x2f6fb5, { roughness: 0.6 });
  const yellowPaint = std(0xd8b13c, { roughness: 0.85 });
  const carBody = std(0xc9ccce, { metalness: 0.35, roughness: 0.42 });
  const carDark = std(0x2c3236, { metalness: 0.35, roughness: 0.42 });

  const add = (geometry, material, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    c.g.add(mesh);
    return mesh;
  };
  const instanced = (material, items, name) => {
    if (!items.length) return null;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    items.forEach((it, i) => {
      euler.set(0, it.ry || 0, 0);
      quat.setFromEuler(euler);
      pos.set(it.x, it.y, it.z);
      scale.set(it.w, it.h, it.d);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    c.g.add(mesh);
    return mesh;
  };
  const heading = -Math.atan2(18, 124);
  const ux = 124 / Math.hypot(124, 18), uz = 18 / Math.hypot(124, 18);
  const nx = -uz, nz = ux;
  const along = (u, n = 0) => ({ x: ux * u + nx * n, z: uz * u + nz * n });

  const edges = sourceEdges(c);
  const north = edges.reduce((a, b) => (b.nz < a.nz ? b : a));
  const south = edges.reduce((a, b) => (b.nz > a.nz ? b : a));
  const east = edges.reduce((a, b) => (b.nx > a.nx ? b : a));
  const west = edges.reduce((a, b) => (b.nx < a.nx ? b : a));

  // ---- Roof: the source body is the 17 m main store; cap it in pale grey. ----
  sourceBody(c, beige, 17.2);
  const bodyTop = 17.42;
  const b = (GEO.mapBuildings || []).find((r) => r.id === s.sourceId);
  const bOutline = b ? b.o : [];
  if (b) {
    const ring = (flat, Ctor) => {
      const path = new Ctor();
      path.moveTo(flat[0] - s.x, -(flat[1] - s.z));
      for (let i = 2; i < flat.length; i += 2) path.lineTo(flat[i] - s.x, -(flat[i + 1] - s.z));
      path.closePath();
      return path;
    };
    const shape = ring(b.o, THREE.Shape);
    shape.holes = (b.holes || []).map((h) => ring(h, THREE.Path));
    const cap = new THREE.ShapeGeometry(shape, 1);
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, bodyTop + 0.02, 0);
    add(cap, roofMat, '大润发·主楼屋面');
  }

  // Parapet rim around the source roof.
  for (const e of [north, east, west]) {
    box(c, white, e.x + e.nx * 0.28, bodyTop, e.z + e.nz * 0.28,
      e.L, 0.5, 0.55, { ry: e.ry, collide: false, cast: false });
  }

  // ---- North retail wing: a lower two-storey frontage in front of the taller
  // store wall. The source body is one extrusion, so the wing is a shallow
  // 0.9 m screen with its own cornice rather than a second roof volume. ----
  const wingHeight = 11.6;
  const wingAt = 2;
  const wingPoint = {
    x: north.x + north.tx * wingAt + north.nx * 0.35,
    z: north.z + north.tz * wingAt + north.nz * 0.35
  };
  box(c, beige, wingPoint.x, 0.22, wingPoint.z, 120, wingHeight, 0.55,
    { ry: north.ry, collide: false, cast: true });
  box(c, white, north.x + north.nx * 0.3, wingHeight - 0.75, north.z + north.nz * 0.3,
    120, 0.8, 1.5, { ry: north.ry, collide: false, cast: false });
  box(c, greyDark, north.x + north.nx * 0.66, wingHeight + 0.05, north.z + north.nz * 0.66,
    120, 0.14, 0.35, { ry: north.ry, collide: false, cast: false });

  const strip = (e, material, at, y, h, w, out = 0.2, d = 0.35) => box(c, material,
    e.x + e.tx * at + e.nx * out, y, e.z + e.tz * at + e.nz * out,
    w, h, d, { ry: e.ry, collide: false, cast: false });

  // Ground-floor shopfront glazing and piers, kept behind the source footprint line.
  strip(north, glass, 0, 0.4, 3.0, 116, 0.68, 0.3);
  const piers = [];
  for (let d = 6; d <= 108; d += 6.2) {
    const at = -north.L / 2 + d;
    const p = { x: north.x + north.tx * at + north.nx * 0.72, z: north.z + north.tz * at + north.nz * 0.72 };
    piers.push({ x: p.x, y: 1.95, z: p.z, w: 0.55, h: 3.5, d: 0.55, ry: north.ry });
  }
  instanced(beigeDark, piers, '大润发·北翼柱');
  // White fascia with a thin red line; the current facade no longer uses the
  // continuous orange band of the 2009 photograph.
  strip(north, white, 0, 3.55, 0.95, 116, 0.74, 0.5);
  strip(north, red, 0, 3.55, 0.16, 116, 1.02, 0.06);
  // Entrance canopy over the shopfronts.
  strip(north, white, 0, 4.55, 0.35, 116, 1.35, 1.7);
  // Narrow vertical windows under the parapet.
  const slits = [];
  for (let d = 8; d <= 106; d += 3.2) {
    const at = -north.L / 2 + d;
    const p = { x: north.x + north.tx * at + north.nx * 0.7, z: north.z + north.tz * at + north.nz * 0.7 };
    slits.push({ x: p.x, y: 8.5, z: p.z, w: 0.72, h: 1.85, d: 0.22, ry: north.ry });
  }
  instanced(glass, slits, '大润发·北翼条形窗');

  // Posters along the wing, as in both photographs.
  const poster = (at, material) => {
    const p = { x: north.x + north.tx * at + north.nx * 0.78, z: north.z + north.tz * at + north.nz * 0.78 };
    box(c, material, p.x, 6.2, p.z, 5.1, 3.4, 0.12,
      { ry: north.ry, collide: false, cast: false });
  };
  for (const [i, d] of [24, 44, 64, 84].entries()) poster(-north.L / 2 + d, [green, orange, red, green][i]);

  // "大润发 RT-Mart" letters on the white parapet near the east end.
  const logoAt = -north.L / 2 + 20;
  const logoP = { x: north.x + north.tx * logoAt + north.nx * 0.8, z: north.z + north.tz * logoAt + north.nz * 0.8 };
  wallText(c, '大润发 RT-Mart', logoP.x, 10.95, logoP.z, 18, 0.95, north.facing, '#b41f2b');

  // Rear store clerestory above the wing, plus a white cornice.
  strip(north, glass, 0, 13.9, 1.75, 104, 0.18, 0.28);
  strip(north, white, 0, 16.75, 0.5, 110, 0.26, 0.45);
  const rearPiers = [];
  for (let d = 8; d <= 104; d += 12) {
    const at = -north.L / 2 + d;
    const p = { x: north.x + north.tx * at + north.nx * 0.22, z: north.z + north.tz * at + north.nz * 0.22 };
    rearPiers.push({ x: p.x, y: 14.7, z: p.z, w: 0.5, h: 4.8, d: 0.45, ry: north.ry });
  }
  instanced(beigeDark, rearPiers, '大润发·主楼壁柱');

  // ---- Rounded north-west corner with the present beige entrance. ----
  // Fillet of the two source facade lines, radius 5 m (display estimate that
  // keeps the curved bay just outside the mapped chamfer).
  const center = { x: -53.2, z: -50.46 };
  const radius = 5.0;
  const arcFrom = -2.978, arcTo = -1.426;
  const arcMaterial = beige.clone();
  arcMaterial.side = THREE.DoubleSide;
  const arcGeometry = (r, y0, y1, seg = 24) => {
    const positions = [], indices = [];
    for (let i = 0; i <= seg; i++) {
      const a = arcFrom + (arcTo - arcFrom) * i / seg;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      positions.push(x, y0, z, x, y1, z);
      if (i < seg) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };
  add(arcGeometry(radius, 0.4, 14.4), arcMaterial, '大润发·西北圆角米色墙');
  const curtain = glass.clone();
  curtain.side = THREE.DoubleSide;
  add(arcGeometry(radius + 0.06, 0.4, 3.45), curtain, '大润发·西北圆角首层玻璃');
  const redArc = red.clone();
  redArc.side = THREE.DoubleSide;
  add(arcGeometry(radius + 0.14, 3.55, 4.45), redArc, '大润发·入口红色横带');
  const trimArc = white.clone();
  trimArc.side = THREE.DoubleSide;
  add(arcGeometry(radius + 0.12, 4.45, 4.8), trimArc, '大润发·入口白色檐口');
  add(arcGeometry(radius + 0.1, 13.9, 14.45), trimArc, '大润发·圆角顶部檐口');

  // Shallow stone-panel joints on the curved bay, following the 2024 photograph.
  const jointMat = beigeDark.clone();
  jointMat.side = THREE.DoubleSide;
  for (let y = 5.2; y < 13.7; y += 1.1) {
    add(arcGeometry(radius + 0.012, y, y + 0.04), jointMat, '大润发·圆角石材横缝');
  }

  const arcPoint = (a, r = radius) => ({ x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r });
  const tangentRy = (a) => -(a + Math.PI / 2);
  const faceRy = (a) => Math.PI / 2 - a;
  const midA = (arcFrom + arcTo) / 2;
  const arcBandText = (text, a0, a1, y0, y1, r, bg, fg) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = fg;
    ctx.font = '700 96px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 136);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const positions = [], uvs = [], indices = [], seg = 24;
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * i / seg;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      positions.push(x, y0, z, x, y1, z);
      uvs.push(i / seg, 0, i / seg, 1);
      if (i < seg) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    add(g, new THREE.MeshBasicNodeMaterial({
      map: texture, side: THREE.DoubleSide
    }), '大润发·入口横带文字·大润发入口');
  };

  // Vertical mullions in the glazed ground floor.
  const mullions = [];
  for (let i = 0; i <= 12; i++) {
    const a = arcFrom + (arcTo - arcFrom) * i / 12;
    const p = arcPoint(a, radius + 0.1);
    mullions.push({ x: p.x, y: 1.95, z: p.z, w: 0.12, h: 3.1, d: 0.14, ry: tangentRy(a) });
  }
  instanced(white, mullions, '大润发·圆角玻璃竖梃');
  const stoneJoints = [];
  for (let i = 0; i <= 8; i++) {
    const a = arcFrom + (arcTo - arcFrom) * i / 8;
    const p = arcPoint(a, radius + 0.012);
    stoneJoints.push({ x: p.x, y: 9.2, z: p.z, w: 0.045, h: 9.2, d: 0.06, ry: tangentRy(a) });
  }
  instanced(beigeDark, stoneJoints, '大润发·圆角石材竖缝');

  // Three pairs of doors centred on the corner.
  for (const da of [-0.4, 0, 0.4]) {
    const a = midA + da;
    const p = arcPoint(a, radius + 0.14);
    box(c, glassLight, p.x, 0.4, p.z, 1.7, 2.95, 0.12,
      { ry: tangentRy(a), collide: false, cast: false });
    const q = arcPoint(a, radius + 0.16);
    box(c, greyDark, q.x, 0.4, q.z, 0.1, 2.95, 0.16,
      { ry: tangentRy(a), collide: false, cast: false });
  }

  // White signboard with red "大润发" and "RT-Mart", standing just proud of the curve.
  const signP = arcPoint(midA, radius + 0.5);
  const textP = arcPoint(midA, radius + 0.54);
  wallText(c, '', signP.x, 7.7, signP.z, 4.0, 3.0, faceRy(midA), '#b41f2b', '#f4f2ea');
  wallText(c, '大润发', textP.x, 8.25, textP.z, 3.0, 1.1, faceRy(midA), '#b41f2b');
  wallText(c, 'RT-Mart', textP.x, 7.05, textP.z, 2.4, 0.55, faceRy(midA), '#b41f2b');
  // Red entrance strip with white arrows/text, curved with the wall.
  arcBandText('↑ 大润发入口 ↑', midA - 0.55, midA + 0.55, 3.62, 4.38, radius + 0.16, '#b41f2b', '#ffffff');

  // Two promotion panels flanking the entrance, matching the photographed pair.
  for (const [da, colour, text] of [[-0.59, green, '新鲜'], [0.59, red, '便宜']]) {
    const a = midA + da;
    const p = arcPoint(a, radius + 0.3);
    box(c, colour, p.x, 6.6, p.z, 1.8, 3.8, 0.12,
      { ry: faceRy(a), collide: false, cast: false });
    const q = arcPoint(a, radius + 0.38);
    wallText(c, text, q.x, 6.5, q.z, 1.0, 0.7, faceRy(a), '#ffffff');
  }

  // Colour-striped fin at the west end of the entrance bay: the stacked orange,
  // yellow and red bands on the left edge of the 2024-12 photograph.
  const finBase = arcPoint(arcFrom + 0.1, radius + 0.28);
  const finRy = tangentRy(arcFrom + 0.1);
  for (const [i, colour] of [orange, yellowPaint, red, beigeDark].entries()) {
    box(c, colour, finBase.x, 8.6 - i * 1.35, finBase.z, 0.55, 1.15, 2.6,
      { ry: finRy, collide: false, cast: false });
  }

  // ---- East end: multi-storey car park screen and vehicle entrance. ----
  const eastEnd = east.L / 2;
  const screenCenter = eastEnd - 16;
  const screenMat = grey;
  strip(east, screenMat, screenCenter, 3.0, 12.8, 30, 0.22, 0.35);
  const slats = [];
  for (let i = 0; i < 23; i++) {
    const p = {
      x: east.x + east.tx * screenCenter + east.nx * 0.42,
      z: east.z + east.tz * screenCenter + east.nz * 0.42
    };
    slats.push({ x: p.x, y: 3.3 + i * 0.54, z: p.z, w: 29.4, h: 0.13, d: 0.28, ry: east.ry });
  }
  instanced(greyDark, slats, '大润发·立体车库格栅');
  // The garage wraps the north-east corner; show the same grey screen on the
  // north facade so the east end does not read as blank mall wall.
  strip(north, grey, -north.L / 2 + 4.8, 3.0, 12.8, 9.6, 0.9, 0.35);
  instanced(greyDark, Array.from({ length: 23 }, (_, i) => {
    const p = { x: north.x + north.tx * (-north.L / 2 + 4.8) + north.nx * 0.44,
      z: north.z + north.tz * (-north.L / 2 + 4.8) + north.nz * 0.44 };
    return { x: p.x, y: 3.3 + i * 0.54, z: p.z, w: 9.2, h: 0.13, d: 0.28, ry: north.ry };
  }), '大润发·北端车库格栅');
  for (const [at, w] of [[eastEnd - 1.2, 0.6], [eastEnd - 30.8, 0.6]]) {
    const p = { x: east.x + east.tx * at + east.nx * 0.36, z: east.z + east.tz * at + east.nz * 0.36 };
    box(c, white, p.x, 2.6, p.z, w, 12.2, 0.6, { ry: east.ry, collide: false, cast: false });
  }
  // Dark vehicle opening and the red "汽车入口" fascia from the photographed garage.
  strip(east, greyDark, eastEnd - 9, 0.4, 2.55, 9, 0.3, 0.3);
  strip(east, red, eastEnd - 9, 2.95, 0.85, 8.6, 0.4, 0.18);
  const carSignP = {
    x: east.x + east.tx * (eastEnd - 9) + east.nx * 0.55,
    z: east.z + east.tz * (eastEnd - 9) + east.nz * 0.55
  };
  wallText(c, 'P  汽车入口', carSignP.x, 3.37, carSignP.z, 7.4, 0.68, east.facing, '#ffffff');

  // Guard booth and barrier at the garage mouth (visual only; not a collider).
  const boothP = {
    x: east.x + east.tx * (eastEnd - 9) + east.nx * 3.6,
    z: east.z + east.tz * (eastEnd - 9) + east.nz * 3.6
  };
  box(c, white, boothP.x, 0.22, boothP.z, 2.0, 2.7, 2.0,
    { ry: east.ry, collide: false });
  box(c, glass, boothP.x + east.nx * 1.01, 1.2, boothP.z + east.nz * 1.01, 1.5, 1.3, 0.08,
    { ry: east.ry, collide: false, cast: false });
  const armP = {
    x: east.x + east.tx * (eastEnd - 9) + east.nx * 1.5,
    z: east.z + east.tz * (eastEnd - 9) + east.nz * 1.5
  };
  box(c, red, armP.x, 1.0, armP.z, 4.6, 0.14, 0.14,
    { ry: east.ry + Math.PI / 2, collide: false, cast: false });

  // Vertical white sign tower with red "立体停车场" lettering on the garage
  // corner, as photographed from the east drive (AMap B0H64UJ5QP).
  const towerP = {
    x: east.x + east.tx * (eastEnd - 2) + east.nx * 1.2,
    z: east.z + east.tz * (eastEnd - 2) + east.nz * 1.2
  };
  box(c, white, towerP.x, 2.2, towerP.z, 1.15, 15.6, 1.15,
    { ry: east.ry, collide: false });
  for (let i = 0; i < 5; i++) {
    const p = {
      x: towerP.x + east.nx * 0.62,
      z: towerP.z + east.nz * 0.62
    };
    wallText(c, '立体停车场'[i], p.x, 13.2 - i * 2.15, p.z, 1.05, 1.5, east.facing, '#b41f2b');
  }

  // Blue-white water-filled barriers and yellow approach lines along the drive
  // in front of the car entrance (2026-11 street photographs).
  const barriers = [];
  for (let i = 0; i < 14; i++) {
    const at = eastEnd - 16 + i * 1.45;
    for (const side of [-1, 1]) {
      const p = {
        x: east.x + east.tx * at + east.nx * (2.1 + side * 0.0),
        z: east.z + east.tz * at + east.nz * (2.1 + side * 0.0)
      };
      barriers.push({
        x: p.x + east.nx * side * 2.4, y: 0.22, z: p.z + east.nz * side * 2.4,
        w: 1.35, h: 0.78, d: 0.42, ry: east.ry
      });
    }
  }
  instanced(barrierWhite, barriers, '大润发·车库水马');
  const barrierBlueTops = barriers.filter((_, i) => i % 2 === 0).map((b) => ({
    x: b.x, y: 0.78, z: b.z, w: b.w * 0.92, h: 0.2, d: b.d * 0.92, ry: b.ry
  }));
  instanced(barrierBlue, barrierBlueTops, '大润发·车库水马蓝顶');
  for (const side of [-1, 1]) {
    const p = {
      x: east.x + east.tx * (eastEnd - 12) + east.nx * side * 4.6,
      z: east.z + east.tz * (eastEnd - 12) + east.nz * side * 4.6
    };
    box(c, yellowPaint, p.x, 0.232, p.z, 16, 0.016, 0.16,
      { ry: east.ry, collide: false, cast: false });
  }

  // ---- West frontage on Shanghai South Rd: ground-floor shops under the
  // parking-podium louvres. AMap labels place 肯德基 / 蜜雪冰城 / 好必和大食堂 and
  // the 西门 gate along this side; tenant signs follow those labels (map labels,
  // not photographed signs) and the bay positions are approximate. ----
  strip(west, glass, -6, 0.4, 3.2, 62, 0.62, 0.3);
  const westShops = [
    [-30, '肯德基', red],
    [-12, '蜜雪冰城', awningBlue],
    [32, '好必和大食堂', orange]
  ];
  for (const [at, label, colour] of westShops) {
    const p = { x: west.x + west.tx * at + west.nx * 0.72, z: west.z + west.tz * at + west.nz * 0.72 };
    box(c, white, p.x, 3.85, p.z, 8.4, 1.35, 0.5, { ry: west.ry, collide: false, cast: false });
    box(c, colour, p.x, 3.85, p.z + west.nz * 0.32, 8.0, 1.05, 0.1,
      { ry: west.ry, collide: false, cast: false });
    const q = { x: west.x + west.tx * at + west.nx * 0.86, z: west.z + west.tz * at + west.nz * 0.86 };
    wallText(c, label, q.x, 3.85, q.z, 6.6, 0.85, west.facing, '#ffffff');
  }
  // 西门 opening: piers and a sliding gate bay at the middle of the west side.
  for (const at of [0.5, 5.5]) {
    const p = { x: west.x + west.tx * at + west.nx * 0.8, z: west.z + west.tz * at + west.nz * 0.8 };
    box(c, beigeDark, p.x, 0.22, p.z, 1.05, 3.6, 1.05, { ry: west.ry, collide: false });
  }
  {
    const p = { x: west.x + west.tx * 3 + west.nx * 0.85, z: west.z + west.tz * 3 + west.nz * 0.85 };
    wallText(c, '西门', p.x, 4.15, p.z, 2.6, 0.75, west.facing, '#8a6b3f');
    box(c, grey, p.x - west.nx * 0.1, 0.22, p.z - west.nz * 0.1, 3.4, 1.15, 0.12,
      { ry: west.ry, collide: false, cast: false });
  }
  // Parking-podium louvres above the shopfronts (screen type from the garage
  // photographs reused on this face as a display assumption).
  for (const at of [-west.L / 2 + 18, 2, 22]) {
    strip(west, grey, at, 6.4, 4.6, 12, 0.25, 0.35);
    instanced(greyDark, Array.from({ length: 8 }, (_, i) => {
      const p = { x: west.x + west.tx * at + west.nx * 0.4, z: west.z + west.tz * at + west.nz * 0.4 };
      return { x: p.x, y: 6.7 + i * 0.56, z: p.z, w: 11.4, h: 0.12, d: 0.24, ry: west.ry };
    }), '大润发·西侧百叶');
  }
  strip(west, white, -6, 11.35, 0.55, 74, 0.55, 1.1);

  // ---- Roof equipment, visible from the helicopter and neighbouring blocks.
  // Units stay over the east membrane roof; the west half is the parking deck. ----
  const roofUnits = [];
  for (const [u, n] of [[-20, -10], [-18, -16], [-2, -12], [14, -18], [28, -8], [-14, 10], [6, 14], [26, 12]]) {
    const p = along(u, n);
    roofUnits.push({ x: p.x, y: bodyTop + 0.75, z: p.z, w: 4.4, h: 1.5, d: 2.5, ry: heading });
  }
  instanced(grey, roofUnits, '大润发·屋顶空调机组');
  for (const [u, n] of [[-18, 20], [16, 20]]) {
    const p = along(u, n);
    box(c, glass, p.x, bodyTop + 0.12, p.z, 18, 0.22, 2.2,
      { ry: heading, collide: false, cast: false });
  }

  // ---- West roof parking deck and spiral ramp mouth. The zoom-18 satellite
  // shows dark asphalt with painted bays and parked cars over the western half
  // of the footprint, plus a circular ramp ring at the north-west corner. The
  // deck elevation follows the source extrusion and the ramp mouth is not
  // surveyed — both are display estimates. ----
  {
    const XMAX = -26;
    const pts = [];
    for (let i = 0; i < bOutline.length; i += 2) {
      pts.push([bOutline[i] - s.x, -(bOutline[i + 1] - s.z)]);
    }
    const clipped = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], nxt = pts[(i + 1) % pts.length];
      const curIn = cur[0] <= XMAX, nxtIn = nxt[0] <= XMAX;
      if (curIn) clipped.push(cur);
      if (curIn !== nxtIn) {
        const t = (XMAX - cur[0]) / (nxt[0] - cur[0]);
        clipped.push([XMAX, cur[1] + (nxt[1] - cur[1]) * t]);
      }
    }
    if (clipped.length >= 3) {
      const deckShape = new THREE.Shape();
      deckShape.moveTo(clipped[0][0], clipped[0][1]);
      for (let i = 1; i < clipped.length; i++) deckShape.lineTo(clipped[i][0], clipped[i][1]);
      deckShape.closePath();
      const deck = new THREE.ShapeGeometry(deckShape, 1);
      deck.rotateX(-Math.PI / 2);
      deck.translate(0, bodyTop + 0.07, 0);
      add(deck, asphalt, '大润发·西屋面停车层');
    }

    // Painted bay lines on the deck, in four double-loaded rows.
    const deckBays = [];
    for (const rowZ of [-34, -18, -2, 14, 30]) {
      for (let x = -66; x <= -32; x += 2.75) {
        deckBays.push({ x, y: bodyTop + 0.1, z: rowZ, w: 0.12, h: 0.014, d: 5.0, ry: 0 });
      }
    }
    instanced(lineMat, deckBays, '大润发·屋面车位线');

    // Parked cars as two-box instanced bodies (display scatter, not a census).
    const carBodies = [], carCabins = [];
    let ci = 0;
    for (const rowZ of [-34, -18, -2, 14, 30]) {
      for (let x = -64; x <= -33; x += 3.6) {
        if (((ci * 7) % 5) < 2) { ci++; continue; }
        const h = ((ci * 13) % 7) / 7;
        carBodies.push({ x: x + (h - 0.5) * 0.25, y: bodyTop + 0.55, z: rowZ + (h - 0.5) * 0.8, w: 1.85, h: 0.75, d: 4.5, ry: h > 0.5 ? 0 : Math.PI });
        carCabins.push({ x: x + (h - 0.5) * 0.25, y: bodyTop + 1.18, z: rowZ + (h - 0.5) * 0.8, w: 1.6, h: 0.62, d: 2.3, ry: h > 0.5 ? 0 : Math.PI });
        ci++;
      }
    }
    instanced(carBody, carBodies, '大润发·屋面停车车身');
    instanced(carDark, carCabins, '大润发·屋面停车车舱');

    // Spiral ramp mouth at the north-west corner of the deck.
    const cx = -51.1, cz = -45.1;
    const segs = 26;
    const ringRoad = [], ringParapet = [];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const rx = cx + Math.cos(a0) * 6.6, rz = cz + Math.sin(a0) * 6.6;
      ringRoad.push({ x: rx, y: bodyTop + 0.11, z: rz, w: 4.6, h: 0.05, d: 1.85, ry: -a0 });
      ringParapet.push({
        x: cx + Math.cos(a0) * 9.0, y: bodyTop + 0.12, z: cz + Math.sin(a0) * 9.0,
        w: 2.35, h: 0.85, d: 0.38, ry: -a0
      });
    }
    instanced(lineMat, ringRoad, '大润发·螺旋坡道环');
    instanced(beigeDark, ringParapet, '大润发·螺旋坡道栏板');
    const coreWall = [];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      coreWall.push({
        x: cx + Math.cos(a0) * 4.45, y: bodyTop - 1.05, z: cz + Math.sin(a0) * 4.45,
        w: 1.15, h: 2.3, d: 0.42, ry: -a0
      });
    }
    instanced(greyDark, coreWall, '大润发·螺旋坡道井');
    box(c, lineMat, cx + 7.6, bodyTop + 0.1, cz + 7.2, 4.2, 0.05, 12,
      { ry: -Math.PI / 4, collide: false, cast: false });
  }

  // ---- South frontage: shop row with the photographed canopy and blue sign
  // band (AMap labels: 罗莱家纺 / 开心城堡儿童乐园; band colour from satellite). ----
  strip(south, glass, 0, 0.4, 3.1, 74, 0.62, 0.3);
  strip(south, white, 0, 4.35, 0.32, 84, 1.55, 2.4);
  for (const [i, at] of [-26, -6, 16].entries()) {
    const p = { x: south.x + south.tx * at + south.nx * 0.72, z: south.z + south.tz * at + south.nz * 0.72 };
    box(c, white, p.x, 3.6, p.z, 11, 1.25, 0.5, { ry: south.ry, collide: false, cast: false });
    box(c, awningBlue, p.x, 3.6, p.z + south.nz * 0.32, 10.5, 1.0, 0.1,
      { ry: south.ry, collide: false, cast: false });
    const q = { x: south.x + south.tx * at + south.nx * 0.86, z: south.z + south.tz * at + south.nz * 0.86 };
    wallText(c, ['罗莱家纺', '开心城堡儿童乐园', '自然堂'][i], q.x, 3.6, q.z, 8.6, 0.82, south.facing, '#ffffff');
  }
  const southPiers = [];
  for (let at = -34; at <= 34; at += 6.4) {
    const p = { x: south.x + south.tx * at + south.nx * 0.7, z: south.z + south.tz * at + south.nz * 0.7 };
    southPiers.push({ x: p.x, y: 1.9, z: p.z, w: 0.55, h: 3.4, d: 0.55, ry: south.ry });
  }
  instanced(beigeDark, southPiers, '大润发·南侧壁柱');

  // ---- North forecourt: parking bays on the reviewed asphalt surface,
  // food-stall awnings along the north edge, receiving dock at the north-east
  // and the 北门 gate at the north-west (AMap labels + zoom-18 satellite). ----
  const bays = [];
  for (const row of [10.5, 21]) {
    for (let d = 10; d <= 102; d += 2.7) {
      const at = -north.L / 2 + d;
      const p = { x: north.x + north.tx * at + north.nx * row, z: north.z + north.tz * at + north.nz * row };
      bays.push({ x: p.x, y: 0.272, z: p.z, w: 0.12, h: 0.014, d: 5.2, ry: north.ry });
    }
  }
  instanced(lineMat, bays, '大润发·停车位标线');
  for (const row of [15.8]) {
    for (let d = 12; d <= 100; d += 7.5) {
      const at = -north.L / 2 + d;
      const p = { x: north.x + north.tx * at + north.nx * row, z: north.z + north.tz * at + north.nz * row };
      box(c, lineMat, p.x, 0.272, p.z, 3.2, 0.014, 0.13,
        { ry: north.ry, collide: false, cast: false });
    }
  }

  // Blue-awning food kiosks along the north edge of the forecourt.
  for (const [i, at] of [-north.L / 2 + 52, -north.L / 2 + 62, -north.L / 2 + 72, -north.L / 2 + 82].entries()) {
    const p = { x: north.x + north.tx * at + north.nx * 34, z: north.z + north.tz * at + north.nz * 34 };
    box(c, white, p.x, 0.22, p.z, 5.2, 2.9, 3.8, { ry: north.ry, collide: false });
    box(c, awningBlue, p.x, 3.25, p.z, 5.6, 0.22, 4.6, { ry: north.ry, collide: false, cast: false });
    box(c, glass, p.x + north.nx * 1.95, 0.35, p.z + north.nz * 1.95, 4.4, 1.9, 0.12,
      { ry: north.ry, collide: false, cast: false });
    const q = { x: p.x + north.nx * 2.05, z: p.z + north.nz * 2.05 };
    wallText(c, ['鸭血粉丝', '小吃', '水饺', '面馆'][i], q.x, 2.45, q.z, 3.4, 0.62, north.facing, '#2c64a8');
  }

  // Receiving yard at the north-east of the forecourt: canopy, dock and truck.
  {
    const at = -north.L / 2 + 12;
    const p = { x: north.x + north.tx * at + north.nx * 26, z: north.z + north.tz * at + north.nz * 26 };
    box(c, white, p.x, 4.6, p.z, 12, 0.35, 6.4, { ry: north.ry, collide: false, cast: false });
    for (const dx of [-5.2, 5.2]) {
      const q = {
        x: p.x + north.tx * dx + north.nx * 2.8,
        z: p.z + north.tz * dx + north.nz * 2.8
      };
      box(c, grey, q.x, 0.22, q.z, 0.42, 4.4, 0.42, { ry: north.ry, collide: false });
    }
    box(c, greyDark, p.x - north.nx * 0.6, 0.35, p.z - north.nz * 0.6, 11, 0.9, 2.2,
      { ry: north.ry, collide: false, cast: false });
    const t = { x: p.x + north.tx * 2.2 + north.nx * 6.5, z: p.z + north.tz * 2.2 + north.nz * 6.5 };
    box(c, white, t.x, 0.4, t.z, 2.4, 2.6, 2.5, { ry: north.ry, collide: false });
    box(c, barrierWhite, t.x + north.tx * 2.6, 0.55, t.z + north.tz * 2.6, 5.2, 2.9, 2.4,
      { ry: north.ry, collide: false });
    const sgn = { x: p.x + north.nx * 3.4, z: p.z + north.nz * 3.4 };
    wallText(c, '收货区', sgn.x, 5.35, sgn.z, 5.2, 0.85, north.facing, '#5c6266');
  }

  // 北门 gate piers at the north-west of the forecourt (AMap label; position
  // approximate along the forecourt's west edge).
  {
    const gx = -60, gz = -72;
    for (const off of [-3, 3]) {
      box(c, beigeDark, gx + off * 0.35, 0.22, gz + off, 1.3, 4.0, 1.3,
        { ry: heading, collide: false });
    }
    box(c, white, gx, 4.0, gz, 9.8, 0.75, 1.5, { ry: heading, collide: false, cast: false });
    wallText(c, '大润发 北门', gx - 0.2, 4.42, gz - 1.05, 7.2, 0.6, Math.PI / 2 + heading, '#b41f2b');
  }

  // ---- Surrounding road furniture: bus shelters at the 大润发北 / 大润发西
  // stops (AMap + 百度百科 stop list) and kerbside parking along the east
  // service drive (zoom-18 satellite). Shelter positions follow the mapped
  // stop labels and are not surveyed street furniture. ----
  const shelter = (sx, sz, ry, label) => {
    for (const off of [-1.7, 1.7]) {
      const px = sx + Math.cos(ry) * off, pz = sz - Math.sin(ry) * off;
      box(c, grey, px, 0.22, pz, 0.16, 2.55, 0.16, { ry, collide: false });
    }
    box(c, glass, sx, 0.35, sz, 4.4, 2.05, 0.09, { ry, collide: false, cast: false });
    box(c, white, sx, 2.62, sz, 4.7, 0.16, 1.75, { ry, collide: false, cast: false });
    box(c, grey, sx, 0.55, sz - Math.sin(ry + Math.PI / 2) * 0.42, 3.2, 0.42, 0.4,
      { ry, collide: false, cast: false });
    wallText(c, label, sx, 2.98, sz, 3.6, 0.5, ry + Math.PI, '#2c64a8');
  };
  shelter(-110, 1572, 0.145, '大润发北');
  shelter(-74, 1578, 0.145, '大润发北');
  shelter(-227, 1662, Math.PI / 2 + 0.145, '大润发西');

  const parked = [], parkedCabins = [];
  let pi = 0;
  for (let t = 0.08; t < 0.95; t += 0.085) {
    const x = -40 + (-67 - -40) * t, z = 1573 + (1722 - 1573) * t;
    const dx = (-67 - -40), dz = (1722 - 1573);
    const ry = -Math.atan2(dz, dx);
    for (const side of (pi % 3 === 2 ? [1] : [1, -1])) {
      parked.push({
        x: x + Math.cos(ry + Math.PI / 2) * side * 3.1,
        y: 0.72, z: z - Math.sin(ry + Math.PI / 2) * side * 3.1,
        w: 1.85, h: 0.78, d: 4.5, ry
      });
      parkedCabins.push({
        x: x + Math.cos(ry + Math.PI / 2) * side * 3.1,
        y: 1.36, z: z - Math.sin(ry + Math.PI / 2) * side * 3.1,
        w: 1.6, h: 0.62, d: 2.3, ry
      });
    }
    pi++;
  }
  instanced(carBody, parked, '大润发·东侧车道停车');
  instanced(carDark, parkedCabins, '大润发·东侧车道停车车舱');

  return ['大润发'];
}

// Transparent or white-backed wall lettering; no sign frame, unlike the shared sign helper.
function wallText(c, text, x, y, z, w, h, ry, fg, bg = null) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 1024, 256);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 256);
  }
  ctx.fillStyle = fg;
  ctx.font = '800 118px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (text.startsWith('↑')) {
    ctx.font = '700 100px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(text, 512, 140);
  } else {
    const size = text.length > 9 ? 88 : text.length > 6 ? 104 : 128;
    ctx.font = `800 ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.fillText(text, 512, 136);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicNodeMaterial({
    map: texture, transparent: !bg, depthWrite: false, side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.name = `大润发·文字·${text}`;
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  c.g.add(mesh);
  return mesh;
}

export { buildRtMartDistrict };
