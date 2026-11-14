import * as THREE from 'three/webgpu';
import { GEO } from './shuyang-geodata.js';

// 沭阳实验小学（公园路11号 / 公园西路128号，前校区）。
// 六个来源轮廓保留并改为照片引导的教学立面；其余院内来源楼体继续普通渲染。
// 2026-10-16 校园特色展示图文（10-17 转载）可见：橙粉色边框、白色水平窗带、
// 带钟的弧形山墙、顶部开放钢架、首层架空柱廊、喷泉水景与大铺装广场。
// 所有高度、构件尺寸与题字均为类型化展示估计，不是测绘复原或逐栋实测。
function buildShiyanCampus({ctxFor,box,cyl,sign,M,sourceBody,sourceEdges,edgePanel}) {
  const c = ctxFor('沭阳实验小学');
  if (!c) return;
  c.g.userData.photoBasis = 'School 2026-10 campus feature photos + 2026-11-13 AMap standard/satellite tiles; capture dates unconfirmed';
  const s = c.s;
  const peach = new THREE.MeshStandardNodeMaterial({color:0xd6a184,roughness:.78});
  const pale = new THREE.MeshStandardNodeMaterial({color:0xf1ece1,roughness:.8});
  const local = p => ({x:p[0]-s.x, z:p[1]-s.z});
  const body = s.bodyHeight || 16.5;
  const steel = M.frame;

  // 1. Six mapped teaching blocks: white storey bands, peach piers and sills.
  for (const id of s.teachingSourceIds || []) {
    const cc = {...c, s:{...s, sourceId:id}};
    sourceBody(cc, pale, body);
    for (const e of sourceEdges(cc)) {
      if (e.L < 8) continue;
      for (let floor = 0; floor < 4; floor++) {
        const y = 1.2 + floor * 3.6;
        edgePanel(c, e, M.glass, y, 1.85, Math.max(e.L - 1.2, 2), .22);
        edgePanel(c, e, peach, y - .42, .3, e.L, .26);
      }
      edgePanel(c, e, peach, body - .55, .55, e.L, .26);
      for (let u = -e.L / 2 + 2; u < e.L / 2 - 1; u += 4.2) {
        box(c, peach, e.x + e.tx * u + e.nx * .3, .22, e.z + e.tz * u + e.nz * .3,
          .5, body, .5, {ry:e.ry, collide:false});
      }
    }
  }

  // 2. Arched pediment with a clock on the south-facing teaching wing.
  const gableId = (s.teachingSourceIds || [])[1];
  if (gableId) {
    const front = sourceEdges({...c, s:{...s, sourceId:gableId}})
      .filter(e => e.L > 12).sort((a, b) => b.nz - a.nz)[0];
    if (front) {
      const fx = front.x + front.nx * .85, fz = front.z + front.nz * .85;
      box(c, peach, front.x, body - .3, front.z, Math.min(front.L, 22), 2.1, .7,
        {ry:front.ry, collide:false});
      const arch = new THREE.Mesh(new THREE.TorusGeometry(6.4, 1.05, 8, 28, Math.PI), peach);
      arch.position.set(fx, body + 1.3, fz);
      arch.rotation.y = front.facing;
      arch.castShadow = true;
      c.g.add(arch);
      const clock = new THREE.Mesh(new THREE.CircleGeometry(2.5, 28), M.white);
      clock.position.set(fx + front.nx * .12, body + 3.4, fz + front.nz * .12);
      clock.rotation.y = front.facing;
      c.g.add(clock);
      cyl(c, M.frame, fx, body + 7.6, fz, .09, .12, 5.2, 8, false);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7),
        new THREE.MeshStandardNodeMaterial({color:0xb5352c, side:THREE.DoubleSide, roughness:.8}));
      flag.position.set(fx + 1.3, body + 11.4, fz);
      flag.rotation.y = front.facing;
      c.g.add(flag);
    }
  }

  // 3. Open roof frame above the narrow tower block, as in the 2026 photos.
  const towerId = (s.teachingSourceIds || [])[3];
  const tower = towerId && (GEO.mapBuildings || []).find(b => b.id === towerId);
  if (tower) {
    const xs = [], zs = [];
    for (let i = 0; i < tower.o.length; i += 2) {
      xs.push(tower.o[i] - s.x); zs.push(tower.o[i + 1] - s.z);
    }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    for (const x of [x0 + .6, cx, x1 - .6]) {
      for (const z of [z0 + .6, cz, z1 - .6]) box(c, steel, x, body, z, .26, 3.1, .26, {collide:false});
    }
    box(c, steel, cx, body + 3.1, cz, w, .22, .22, {collide:false});
    box(c, steel, cx, body + 3.1, cz, .22, .22, d, {collide:false});
    for (let u = 1; u < 5; u++) {
      box(c, steel, x0 + (x1 - x0) * u / 5, body + 3.1, cz, .16, .18, d, {collide:false});
    }
  }

  // 4. Fountain in the paved square. Positions come from reviewed tile pixels.
  if (s.fountain) {
    const f = local(s.fountain);
    cyl(c, M.stone, f.x, .24, f.z, 5.1, 5.4, .48, 32, true);
    cyl(c, M.blueGlass, f.x, .68, f.z, 4.6, 4.6, .12, 32, false);
    cyl(c, M.white, f.x, .8, f.z, .32, .48, 3.1, 12, false);
    for (const [dx, dz] of [[3.1, 0], [-3.1, 0], [0, 3.1], [0, -3.1]]) {
      cyl(c, M.white, f.x + dx, .8, f.z + dz, .12, .18, 1.5, 8, false);
    }
  }

  // 5. Main south gate: stone name wall, piers, sliding gate, guard room.
  //    The central approach is deliberately left open for the campus axis.
  box(c, M.stone, -21, .22, 0, 24, 2.9, 1.1, {collide:true});
  sign(c, '沭阳实验小学', -21, 1.85, -.62, 22, 1.15, 0, '#b8b2a4', '#9c2727');
  sign(c, '百年文脉 知行合一', -21, .85, -.62, 18, .62, 0, '#c9c2b2', '#6d3b32');
  for (const u of [-8.6, 8.6]) {
    box(c, M.stone, u, .22, 0, 2.1, 4.4, 2.1, {collide:true});
    box(c, peach, u, 4.62, 0, 2.5, .35, 2.5, {collide:false});
  }
  box(c, M.frame, 0, .3, 0, 15.2, 1.55, .32, {collide:false});
  for (let u = -7; u <= 7; u += 1.55) box(c, steel, u, .3, 0, .12, 1.8, .18, {collide:false});
  box(c, M.white, 17, .22, -3.4, 7, 3.3, 6, {collide:true});
  box(c, peach, 17, 3.52, -3.4, 7.8, .32, 6.8, {collide:false});
  box(c, M.glass, 17, 1.1, -.35, 5.2, 1.5, .12, {collide:false});
  // Low flanking railings, not a full guessed campus wall.
  for (const [u0, u1] of [[-44, -10], [10, 42]]) {
    for (let u = u0; u <= u1; u += 2.4) box(c, steel, u, .22, 0, .16, 1.55, .16, {collide:false});
    box(c, steel, (u0 + u1) / 2, 1.65, 0, u1 - u0, .14, .16, {collide:false});
  }

  // 6. Secondary (south-west) entrance: two modest piers only, no invented gatehouse.
  if (s.secondaryGate) {
    const g = local(s.secondaryGate);
    for (const u of [-3.2, 3.2]) box(c, M.stone, g.x + u, .22, g.z, 1.4, 3.4, 1.4, {collide:true});
    box(c, M.frame, g.x, 2.9, g.z, 7.8, .3, .35, {collide:false});
  }
}

export {buildShiyanCampus};
