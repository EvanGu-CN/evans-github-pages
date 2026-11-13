import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO } from './shuyang-geodata.js';
import { LANDMARKS, LANDMARK_SITES } from './city-config.js';

function shapeFromPolygon(p) {
  const ring = (flat, Ctor) => {
    const path = new Ctor();
    path.moveTo(flat[0], -flat[1]);
    for (let i = 2; i < flat.length; i += 2) path.lineTo(flat[i], -flat[i + 1]);
    path.closePath();
    return path;
  };
  const shape = ring(p.outer, THREE.Shape);
  shape.holes = p.holes.map((h) => ring(h, THREE.Path));
  return shape;
}

function buildUrbanContext(scene) {
  const group = new THREE.Group();
  group.name = 'ShuyangUrbanContext';
  scene.add(group);
  const styles = {
    'residential-ground': { color: 0xa8ada4, y: .225 },
    path: { color: 0xb9b3a5, y: .255 },'community-path':{color:0x8e9695,y:.255}, parking: { color: 0x737d80, y: .245 },
    plaza: { color: 0xc0bcae, y: .25 }, green: { color: 0x738354, y: .235 },
    soccer:{color:0x557747,y:.27},basketball:{color:0x627f8b,y:.27},
    'sports-ground':{color:0x77856e,y:.265},'running-track':{color:0xa85645,y:.28},
    infield:{color:0x4d7b58,y:.28},court:{color:0x5a8f86,y:.28},'sport-paving':{color:0x9a7261,y:.275}
  };
  for (const [kind, style] of Object.entries(styles)) {
    const geos = [];
    for (const surface of GEO.urban?.surfaces || []) {
      if (surface.kind !== kind) continue;
      for (const p of surface.polygons) {
        const geo = new THREE.ShapeGeometry(shapeFromPolygon(p));
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, style.y, 0);
        geos.push(geo);
      }
    }
    if (!geos.length) continue;
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardNodeMaterial({ color: style.color, roughness: .95 }));
    mesh.name = `Mapped-${kind}`;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const barrierGeos = [];
  for (const barrier of GEO.urban?.barriers || []) {
    const pts = barrier.points;
    for (let i = 2; i < pts.length; i += 2) {
      const dx = pts[i] - pts[i - 2], dz = pts[i + 1] - pts[i - 1], length = Math.hypot(dx, dz);
      if (length < .1) continue;
      const geo = new THREE.BoxGeometry(length, barrier.height, barrier.kind === 'hedge' ? .65 : .22);
      geo.rotateY(-Math.atan2(dz, dx));
      geo.translate((pts[i] + pts[i - 2]) / 2, barrier.height / 2 + .22, (pts[i + 1] + pts[i - 1]) / 2);
      barrierGeos.push(geo);
    }
  }
  if (barrierGeos.length) {
    const mesh = new THREE.Mesh(mergeGeometries(barrierGeos), new THREE.MeshStandardNodeMaterial({ color: 0x8d9386, roughness: .9 }));
    barrierGeos.forEach((g) => g.dispose());
    mesh.name = 'Mapped-barriers';
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData.audit = GEO.urban?.audit;

  // Navigation annotations sit above real estate coordinates. They are not physical rooftop signs.
  const labels = new THREE.Group();
  labels.name = 'ShuyangNeighborhoodLabels';
  scene.add(labels);
  const canonical = name => name.replace(/[（(].*?[）)]/g,'').trim();
  const landmarkNames = new Set(LANDMARKS.flatMap(l=>[l.name,l.short,...(LANDMARK_SITES[l.name].aliases||[])].map(canonical)));
  const subsites=Object.values(LANDMARK_SITES).flatMap(s=>s.subsites||[]);
  const subsiteNames=new Set(subsites.map(s=>canonical(s.name)));
  const entries = [
    ...(GEO.neighborhoods || []).map((n) => ({ ...n, kind: 'housing' })),
    ...(GEO.namedSites || []).filter(n=>!landmarkNames.has(canonical(n.name))&&!subsiteNames.has(canonical(n.name))),
    ...subsites.map(n=>({...n,labelHeight:n.h+8})),
    ...LANDMARKS.map(l=>({...l,labelHeight:l.h+8}))
  ].map((n) => {
    const lm = LANDMARKS.find((l) => canonical(l.name) === canonical(n.name) || canonical(l.short) === canonical(n.name));
    return { ...n, labelHeight: Math.max(n.labelHeight, lm ? lm.h + 8 : /沭阳县(美术馆|图书馆|博物馆)/.test(n.name) ? 35 : 0), sprite: null };
  });
  labels.userData.counts = { neighborhoods: GEO.neighborhoods?.length || 0, buildingsAndPlaces: GEO.namedSites?.length || 0 };
  const labelStyles = {
    housing: ['小区', '#97d7b7'], hospital: ['医疗', '#ffb1ae'], school: ['学校', '#c9b7ff'],
    mall: ['商业', '#ffcf82'], mixed: ['地标', '#ffcf82'], heritage: ['历史街区', '#e5cf9c'], waterfront: ['地标', '#a9dfff'],
    commercial: ['商业', '#ffcf82'], government: ['公共', '#a9c9ff'], culture: ['文化', '#e5cf9c'],
    station: ['车站', '#a9dfff'], bank: ['银行', '#a8dbbb'], office: ['办公', '#b9d1e8'],
    industrial: ['厂区', '#c2ced5'], civic: ['公共', '#a9c9ff'], sports: ['体育', '#97d7b7'], park: ['公园', '#97d7b7'], building: ['建筑', '#d7e1e8']
  };
  function makeLabel(n) {
    const canvas = document.createElement('canvas');
    const width = Math.max(256, Math.min(720, n.name.length * 34 + 48));
    canvas.width = width; canvas.height = 108;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(19,40,42,.88)';
    ctx.beginPath(); ctx.roundRect(2, 2, width - 4, 104, 16); ctx.fill();
    const [kind, tint] = labelStyles[n.kind] || labelStyles.building;
    ctx.strokeStyle = tint; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = tint; ctx.font = '500 21px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(kind, width / 2, 27);
    ctx.fillStyle = '#edf3f7'; ctx.font = '600 32px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(n.name, width / 2, 69, width - 30);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, sizeAttenuation: false }));
    sprite.name = n.name;
    sprite.scale.set(.043 * width / 108, .043, 1);
    sprite.position.set(n.x, n.labelHeight, n.z);
    labels.add(sprite);
    sprite.updateMatrixWorld(true);
    return sprite;
  }
  const projected = new THREE.Vector3();
  let lastUpdate = -Infinity;
  return {
    group, labels,
    update(camera, elapsed) {
      if (elapsed - lastUpdate < .15) return;
      lastUpdate = elapsed;
      entries.forEach((n) => { if (n.sprite) n.sprite.visible = false; });
      const candidates = entries.map((n) => ({ n, distance: Math.hypot(n.x - camera.position.x, n.z - camera.position.z) }))
        .filter((c) => c.distance < (c.n.labelScope==='building-unit'?180:1300))
        .sort((a,b)=>(a.distance+(a.n.labelScope==='building-unit'?250:0))-(b.distance+(b.n.labelScope==='building-unit'?250:0)));
      const placed = [];
      for (const { n, distance } of candidates) {
        projected.set(n.x, n.labelHeight, n.z).project(camera);
        if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > .95 || Math.abs(projected.y) > .9) continue;
        const sprite = n.sprite || (n.sprite = makeLabel(n));
        const aspect = camera.aspect || 1;
        const w = sprite.scale.x * 2 / aspect, h = .10;
        if (placed.some((r) => Math.abs(r.x - projected.x) < (r.w + w) / 2 && Math.abs(r.y - projected.y) < h)) continue;
        placed.push({ x: projected.x, y: projected.y, w });
        sprite.material.opacity = Math.min(1, Math.max(0, (1300 - distance) / 300));
        sprite.visible = true;
        if (placed.length >= (aspect < .9 ? 6 : 12)) break;
      }
    }
  };
}

export { buildUrbanContext };
