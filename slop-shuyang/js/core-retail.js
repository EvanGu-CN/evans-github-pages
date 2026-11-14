import * as THREE from 'three/webgpu';

// 蓝天商贸城识别性细化。中央商场由 central-plaza.js 单独重建，
// 避免重复的旧冠部、入口体块和两套立面叠加。
// 蓝天依据：2022司法评估、公开照片及2026高德图层；细部仍为展示估计。
function buildCoreRetail({ctxFor,box,cyl,sign,M,sourceEdges,edgePanel}) {
  const tile = new THREE.MeshStandardNodeMaterial({color:0xd3d0c7,roughness:.86});
  const tileWarm = new THREE.MeshStandardNodeMaterial({color:0xc7c0b2,roughness:.88});
  const glassBlue = new THREE.MeshStandardNodeMaterial({color:0x2c6478,roughness:.12,metalness:.8});
  const frameWhite = new THREE.MeshStandardNodeMaterial({color:0xf3f1ea,roughness:.55,metalness:.2});
  const steel = new THREE.MeshStandardNodeMaterial({color:0x7e878d,roughness:.34,metalness:.72});
  const glowWarm = new THREE.MeshBasicNodeMaterial({color:0xffd9a2});
  const glowWhite = new THREE.MeshBasicNodeMaterial({color:0xf4f6f7});
  const glowBlue = new THREE.MeshBasicNodeMaterial({color:0x8ec8e8});
  const leaf = new THREE.MeshStandardNodeMaterial({color:0x4d6f45,roughness:.95});

  // Solid diagonal strut between two local points (entrance lattice, canopy braces).
  const strut = (c, mat, ax, ay, az, bx, by, bz, r = .22) => {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    const v = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 6), mat);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    mesh.castShadow = true;
    c.g.add(mesh);
  };

  const b = ctxFor('蓝天国际商贸城');

  // ---------------- 蓝天国际商贸城（蓝天市场） ----------------
  if (b) {
    b.g.userData.photoBasis = 'JD auction entrance photo + 2022 judicial valuation (glass curtain + tile, F1 28 floors) + 2026 field survey';
    const edges = sourceEdges(b).filter(e => e.L > 8);
    for (const e of edges) {
      // Glass curtain with warm tile bands and projecting horizontal louvers.
      edgePanel(b, e, glassBlue, 1.4, 22.2, e.L - 1.2, .5);
      for (const y of [5.4, 12.4, 19.4]) edgePanel(b, e, tileWarm, y, 1.5, e.L + 1.0, 1.15);
      for (let band = 0; band < 4; band++) {
        const y = 2.2 + band * 5.4;
        for (let k = 0; k < 3; k++) {
          edgePanel(b, e, frameWhite, y + k * 1.35, .22, e.L - 2, 1.35);
        }
      }
      for (let u = -e.L / 2 + 2.2; u < e.L / 2 - 1; u += 4.2) {
        box(b, steel, e.x + e.tx * u + e.nx * 1.45, 1.4, e.z + e.tz * u + e.nz * 1.45,
          .34, 22.4, .34, {ry:e.ry, collide:false});
      }
      edgePanel(b, e, tile, .2, 1.2, e.L, 1.0);
      edgePanel(b, e, glowWarm, 3.1, .16, e.L - 1, 1.5);
      edgePanel(b, e, tile, 23.7, 1.5, e.L + .8, 1.2);
    }
    const front = edges.reduce((a, e2) => (e2.nz > a.nz ? e2 : a), edges[0]);
    if (front) {
      const nx = front.nx, nz = front.nz, tx = front.tx, tz = front.tz;
      const at = (u, v) => ({x:front.x + tx * u + nx * v, z:front.z + tz * u + nz * v});
      // Two-layer canopy over the round opening, with solid web members.
      const p1 = at(0, 4.4), p2 = at(0, 4.4);
      box(b, frameWhite, p1.x, 27.4, p1.z, 150, .8, 11, {ry:front.ry, collide:false});
      box(b, frameWhite, p2.x, 30.2, p2.z, 138, .7, 9.5, {ry:front.ry, collide:false});
      for (let u = -68; u <= 68; u += 17) {
        const q = at(u, 4.4);
        strut(b, steel, q.x, 28.2, q.z, q.x + tx * 8.5, 30.2, q.z + tz * 8.5, .16);
        strut(b, steel, q.x, 28.2, q.z, q.x - tx * 8.5, 30.2, q.z - tz * 8.5, .16);
      }
      const ring = at(0, 4.5);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(6.6, .3, 8, 36), glowBlue);
      halo.rotation.y = front.facing;
      halo.position.set(ring.x, 27.5, ring.z);
      b.g.add(halo);
      // Eight silver columns with caps.
      for (const u of [-90, -67, -45, -22, 22, 45, 67, 90]) {
        const q = at(u, 5.0);
        cyl(b, steel, q.x, .25, q.z, .5, .62, 27, 12);
        box(b, frameWhite, q.x, 26.6, q.z, 1.4, .5, 1.4, {ry:front.ry, collide:false});
      }
      // Category signs from the 2026 field survey, with luminous backing.
      const labels = ['黄金珠宝', '数码通信', '眼镜钟表', '黄金珠宝', '通信服务'];
      labels.forEach((text, i) => {
        const u = -74 + i * 37;
        const q = at(u, 2.4);
        box(b, glowWarm, q.x, 3.4, q.z, 19, 1.9, .3, {ry:front.ry, collide:false});
        sign(b, text, q.x, 3.55, q.z + nz * .05, 17, 1.5, front.facing, '#233b4d', '#e8cf8a');
      });
      // Entrance steps toward the snack street.
      for (let i = 0; i < 3; i++) {
        const s = at(0, 6 + i * 1.2);
        box(b, tile, s.x, .28 - i * .1, s.z, 70 - i * 3, .3, 1.3, {ry:front.ry, collide:false});
      }
    }
    // Roof: plant, a large advertising frame and the round atrium dome.
    // The plan is a skewed quadrilateral, so no full rectangular roof slab.
    for (const [u, v, w, h, d] of [[-92, -54, 20, 4.2, 13], [-52, 46, 16, 3.4, 11], [30, -58, 24, 4.6, 12], [92, 32, 18, 3.8, 12]]) {
      box(b, tileWarm, u, 25.2, v, w, h, d, {collide:false});
    }
    box(b, frameWhite, 62, 30.5, -34, 46, 7.4, 1.8, {ry:front ? front.ry : 0, collide:false});
    box(b, glowWhite, 62, 31.2, -34, 42, 6.0, .4, {ry:front ? front.ry : 0, collide:false});
    const atrium = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 10.2, 4.6, 32), glassBlue);
    atrium.position.set(-18, 27.2, -12);
    b.g.add(atrium);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(10.4, .5, 8, 36), frameWhite);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(-18, 25.2, -12);
    b.g.add(rim);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(7.2, .22, 8, 32), glowBlue);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.set(-18, 29.6, -12);
    b.g.add(ring2);
  }

  // ---------------- Street furniture on the Bluesky forecourt ----------------
  // Bluesky's south forecourt is the larger one; keep positions inside the
  // reviewed plaza and away from the road and building walls.
  const furniture = (c, x0, x1, z0, z1, count) => {
    for (let i = 0; i < count; i++) {
      const x = x0 + (x1 - x0) * (i / Math.max(count - 1, 1));
      const z = i % 2 === 0 ? z0 : z1;
      // Tree pit with stone kerb and low planting.
      box(c, tile, x, .3, z, 2.2, .45, 2.2, {collide:false});
      box(c, leaf, x, .75, z, 1.7, .35, 1.7, {collide:false});
      cyl(c, tileWarm, x, 1.05, z, .22, .34, .55, 8);
      // Lamp post with a warm head.
      cyl(c, steel, x + 2.6, .3, z, .1, .14, 5.4, 8);
      box(c, glowWarm, x + 2.6, 5.6, z, .55, .28, .55, {collide:false});
    }
    // Paver bands and low guard rails along the forecourt edge.
    for (let x = x0 - 4; x <= x1 + 4; x += 7) {
      box(c, tileWarm, x, .27, (z0 + z1) / 2, .28, .1, Math.abs(z1 - z0) + 3, {collide:false});
    }
    for (let x = x0 - 4; x <= x1 + 4; x += 2.4) {
      cyl(c, steel, x, .3, z1 + 2.2, .06, .08, 1.1, 6);
    }
    box(c, steel, (x0 + x1) / 2, 1.35, z1 + 2.2, x1 - x0 + 8, .1, .1, {collide:false});
    // Two illuminated wayfinding totems.
    for (const x of [x0 + 3, x1 - 3]) {
      box(c, glowWhite, x, 1.4, z0 - 1.4, .9, 2.4, .28, {collide:false});
      box(c, steel, x, .3, z0 - 1.4, 1.1, 1.1, .4, {collide:false});
    }
  };
  if (b) furniture(b, -44, 108, 146, 162, 6);
}

export {buildCoreRetail};
