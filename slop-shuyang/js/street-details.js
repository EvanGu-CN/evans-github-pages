import * as THREE from 'three/webgpu';
import { color, mix, smoothstep, uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROADS, blockAt, signalPhase } from './city-config.js';
import { GEO } from './shuyang-geodata.js';
import { cityUniforms } from './tsl-materials.js';
import { createTreeField } from './trees.js';
import { parkTreeSites } from './city-grid.js';
import { collectGreenTreeSites } from './green-tree-sites.js';

// 沭阳街道设施：行道树、路灯、路口信号灯。交通系统的信号灯位置与相位都从这里来。

function buildStreetDetails(scene, colliders = []) {
  const group = new THREE.Group();
  group.name = 'ShuyangStreetDetails';
  const dummy = new THREE.Object3D();
  const signalClock = uniform(0);
  const footprints = [];
  const signalIntersections = [];
  const audioSignals = [];

  // 建筑碰撞体的空间索引（树木/路灯避让）
  const COL_CELL = 64;
  const colGrid = new Map();
  for (const c of colliders) {
    for (let ix = Math.floor(c.minX / COL_CELL); ix <= Math.floor(c.maxX / COL_CELL); ix++) {
      for (let iz = Math.floor(c.minZ / COL_CELL); iz <= Math.floor(c.maxZ / COL_CELL); iz++) {
        const k = ix * 100003 + iz;
        if (!colGrid.has(k)) colGrid.set(k, []);
        colGrid.get(k).push(c);
      }
    }
  }
  const blockedAt = (x, z, pad = 1.2) => {
    for (let ix = Math.floor((x - pad) / COL_CELL); ix <= Math.floor((x + pad) / COL_CELL); ix++) {
      for (let iz = Math.floor((z - pad) / COL_CELL); iz <= Math.floor((z + pad) / COL_CELL); iz++) {
        for (const c of colGrid.get(ix * 100003 + iz) || []) {
          if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
        }
      }
    }
    return false;
  };

  const poleMat = new THREE.MeshStandardNodeMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.65 });
  const headMat = new THREE.MeshStandardNodeMaterial({ color: 0x1c2024, roughness: 0.55, metalness: 0.4 });
  const lampGlow = new THREE.MeshBasicNodeMaterial();
  lampGlow.colorNode = mix(color(0x9a9c96), color(0xffefd2).mul(2.0), smoothstep(0.4, 1.1, cityUniforms.uInteriorGlow));

  // 行道树：沿道路两侧、人行道内 3.5 m，避开建筑与路口
  const sites = [...parkTreeSites];
  const hash = (a, b) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;
  for (const road of ROADS) {
    if (road.bridge) continue;
    const pts = road.pts;
    const step = 11;
    let acc = 0;
    // 临安路/苏州路：省住建厅 2020-11 报道「临安路，梧桐遮夏荫」、苏州路林荫步道，
    // 行道树统一用梧桐（species 0）并加密种植；其他道路保留混交。
    const planeRoad = /^(临安|苏州)/.test(road.name || '');
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 1) continue;
      const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
      const nx = -dz, nz = dx;
      for (let s = acc; s < L; s += step) {
        const px = a.x + dx * s, pz = a.z + dz * s;
        for (const side of [-1, 1]) {
          const off = road.w / 2 + 3.6;
          const x = px + nx * off * side;
          const z = pz + nz * off * side;
          const blk = blockAt(x, z);
          if (!blk || blk.park > 0.5) continue;
          if (blockedAt(x, z, 1.4)) continue;
          const h = hash(x, z);
          if (h < (planeRoad ? 0.16 : 0.32)) continue; // gaps for shop fronts and driveways
          sites.push({
            x: x + (h - 0.5) * 1.6, y: 0.22, z: z + (hash(z, x) - 0.5) * 1.6,
            scale: 0.62 + h * 0.28, species: planeRoad ? 0 : (h < 0.55 ? 1 : h < 0.82 ? 0 : 2), tier: 1
          });
        }
      }
      acc = (acc + L) % step;
    }
    if (sites.length > 9000) break;
  }
  // 已核对的小区绿地（沃德嘉园边界绿化、楼间绿带与中央庭院）里的庭院树。
  for (const site of collectGreenTreeSites(GEO.urban?.surfaces || [], blockedAt)) sites.push(site);

  const treeField = createTreeField(scene, sites, colliders);
  group.add(treeField.group);

  // 路灯：沿道路每 36 m 一盏，灯臂朝向车行道
  const lampPole = new THREE.CylinderGeometry(0.11, 0.14, 6.4, 6);
  lampPole.translate(0, 3.2, 0);
  const lampArm = new THREE.BoxGeometry(0.1, 0.1, 2.2);
  lampArm.translate(0, 6.1, 1.0);
  const lampHead = new THREE.BoxGeometry(0.42, 0.16, 0.9);
  lampHead.translate(0, 6.02, 2.0);
  const lamps = [];
  for (const road of ROADS) {
    if (road.bridge || road.w < 6) continue;
    const pts = road.pts;
    const step = 36;
    let acc = 8;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 1) continue;
      const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
      const nx = -dz, nz = dx;
      for (let s = acc; s < L; s += step) {
        const px = a.x + dx * s, pz = a.z + dz * s;
        const side = (lamps.length % 2) ? 1 : -1;
        const off = road.w / 2 + 1.6;
        const x = px + nx * off * side, z = pz + nz * off * side;
        if (!blockAt(x, z) || blockedAt(x, z, 1.0)) continue;
        const inward = Math.atan2(-nx * side, -nz * side);
        lamps.push({ x, z, ry: inward });
      }
      acc = 0;
    }
    if (lamps.length > 3200) break;
  }
  if (lamps.length) {
    const poleInst = new THREE.InstancedMesh(lampPole, poleMat, lamps.length);
    const armInst = new THREE.InstancedMesh(lampArm, poleMat, lamps.length);
    const headInst = new THREE.InstancedMesh(lampHead, lampGlow, lamps.length);
    poleInst.castShadow = armInst.castShadow = true;
    poleInst.receiveShadow = true;
    lamps.forEach((l, i) => {
      dummy.position.set(l.x, 0.22, l.z);
      dummy.rotation.set(0, l.ry, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);
      armInst.setMatrixAt(i, dummy.matrix);
      headInst.setMatrixAt(i, dummy.matrix);
    });
    poleInst.instanceMatrix.needsUpdate = armInst.instanceMatrix.needsUpdate = headInst.instanceMatrix.needsUpdate = true;
    poleInst.frustumCulled = armInst.frustumCulled = headInst.frustumCulled = false;
    group.add(poleInst, armInst, headInst);
  }
  console.info(`[streetDetails] ${treeField.stats.trees} trees, ${lamps.length} street lamps`);

  // 道路采样点索引，用于找到路口最近的道路方向
  const RG_CELL = 48;
  const roadCells = new Map();
  for (const r of ROADS) {
    if (r.w < 6) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(L / 24));
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
        const key = Math.floor(x / RG_CELL) * 100003 + Math.floor(z / RG_CELL);
        if (!roadCells.has(key)) roadCells.set(key, []);
        roadCells.get(key).push({ r, x, z });
      }
    }
  }
  function nearestRoad(x, z) {
    let best = null, bd = 40;
    for (let ix = Math.floor((x - 40) / RG_CELL); ix <= Math.floor((x + 40) / RG_CELL); ix++) {
      for (let iz = Math.floor((z - 40) / RG_CELL); iz <= Math.floor((z + 40) / RG_CELL); iz++) {
        for (const s of roadCells.get(ix * 100003 + iz) || []) {
          const d = Math.hypot(s.x - x, s.z - z);
          if (d < bd) { bd = d; best = s.r; }
        }
      }
    }
    return best;
  }

  // 信号灯：OSM 路网中度数 ≥ 3 且较宽的路口
  const nodeCount = GEO.roadGraph.nodes.length / 2;
  const deg = new Int16Array(nodeCount);
  const maxW = new Float32Array(nodeCount);
  for (const [a, b, , w] of GEO.roadGraph.links) {
    deg[a]++; deg[b]++;
    maxW[a] = Math.max(maxW[a], w);
    maxW[b] = Math.max(maxW[b], w);
  }
  const nodeMap = new Map();
  for (let i = 0; i < nodeCount; i++) {
    if (deg[i] < 3 || maxW[i] < 9.5) continue;
    const x = GEO.roadGraph.nodes[i * 2], z = GEO.roadGraph.nodes[i * 2 + 1];
    const key = `${Math.round(x / 8)},${Math.round(z / 8)}`;
    const prev = nodeMap.get(key);
    if (!prev || maxW[i] > prev.w) nodeMap.set(key, { x, z, deg: deg[i], w: maxW[i] });
  }
  const intersections = [...nodeMap.values()].sort((a, b) => b.w - a.w);
  const MAX_SIGNALS = 260;
  for (const n of intersections) {
    if (signalIntersections.length >= MAX_SIGNALS) break;
    const road = nearestRoad(n.x, n.z);
    const isAvenue = (road?.w || 0) >= 14;
    signalIntersections.push({ x: n.x, z: n.z, isAvenue });
    audioSignals.push({ x: n.x, y: 5.4, z: n.z, isAvenue });
  }

  // 信号灯头：每个路口一组，杆立在路侧、悬臂伸向车行道
  const headGeos = [];
  const lensGeos = { ave: [[], [], []], st: [[], [], []] };
  for (const s of signalIntersections) {
    const road = nearestRoad(s.x, s.z);
    const ang = road ? Math.atan2(road.pts[1].x - road.pts[0].x, road.pts[1].z - road.pts[0].z) : 0;
    const nx = Math.cos(ang), nz = -Math.sin(ang);
    const off = (road?.w || 12) / 2 + 2.2;
    const px = s.x + nx * off, pz = s.z + nz * off;
    const pole = new THREE.CylinderGeometry(0.13, 0.16, 6.2, 6).translate(px, 3.1, pz);
    const armLen = (road?.w || 12) / 2 + 2.6;
    const arm = new THREE.BoxGeometry(0.12, 0.12, armLen);
    arm.rotateY(ang);
    arm.translate(px - nx * armLen / 2, 6.0, pz - nz * armLen / 2);
    headGeos.push(pole, arm);
    const hx = px - nx * (armLen - 0.6), hz = pz - nz * (armLen - 0.6);
    const head = new THREE.BoxGeometry(0.42, 1.1, 0.3);
    head.rotateY(ang);
    head.translate(hx, 5.55, hz);
    headGeos.push(head);
    for (let k = 0; k < 3; k++) {
      const lens = new THREE.SphereGeometry(0.14, 8, 6);
      lens.translate(hx, 5.92 - k * 0.36, hz);
      lensGeos[s.isAvenue ? 'ave' : 'st'][k].push(lens);
    }
  }
  if (headGeos.length) {
    const mesh = new THREE.Mesh(mergeGeometries(headGeos, false), headMat);
    mesh.castShadow = true;
    group.add(mesh);
  }
  // 红/黄/绿六种共享灯罩材质，每帧按相位切换颜色
  const lensMats = {
    ave: [0, 1, 2].map(() => new THREE.MeshBasicNodeMaterial()),
    st: [0, 1, 2].map(() => new THREE.MeshBasicNodeMaterial())
  };
  for (const key of ['ave', 'st']) {
    for (let k = 0; k < 3; k++) {
      if (!lensGeos[key][k].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(lensGeos[key][k], false), lensMats[key][k]);
      group.add(mesh);
    }
  }
  const DARK = new THREE.Color(0x1a1c1e);
  const COLORS = [new THREE.Color(0xff3b30), new THREE.Color(0xffb300), new THREE.Color(0x35d067)];
  function updateSignalColors() {
    for (const key of ['ave', 'st']) {
      const phase = signalPhase(signalClock.value, key === 'ave');
      const active = phase === 'green' ? 2 : phase === 'amber' ? 1 : 0;
      for (let k = 0; k < 3; k++) {
        lensMats[key][k].color.copy(k === active ? COLORS[k] : DARK);
      }
    }
  }
  updateSignalColors();

  function update(camera) {
    treeField.update(camera.position);
    updateSignalColors();
  }

  scene.add(group);
  return { group, footprints, signalClock, signalIntersections, audioSignals, treeField, update };
}

export { buildStreetDetails };
