import * as THREE from 'three/webgpu';

// 人民中路 × 上海中路核心商圈的识别性细化，只叠加细节，不重复生成来源主体。
// 依据：2023 消防主塔实拍、中央商场 2025-08-30 官方开业近景（深灰玻璃幕墙、
// 白色横框、顶部广告带、斜钢桁架、红色圆标）、雨润中央广场公开层数资料、
// 蓝天商贸城 2022 司法评估报告（玻璃幕+贴砖、F1 区 28 层）、
// 2026-05-04 商圈现场观察与 2026-11-13 高德标准图/卫星图。
// 31/32 层住宅与蓝天 28 层塔楼未与单条来源轮廓绑定，故不新增虚构体量。
function buildCoreRetail({ctxFor,box,cyl,sign,M,sourceEdges,edgePanel}) {
  const tile = new THREE.MeshStandardNodeMaterial({color:0xd3d0c7,roughness:.86});
  const tileWarm = new THREE.MeshStandardNodeMaterial({color:0xc7c0b2,roughness:.88});
  const glassDark = new THREE.MeshStandardNodeMaterial({color:0x1d3441,roughness:.1,metalness:.86});
  const glassBlue = new THREE.MeshStandardNodeMaterial({color:0x2c6478,roughness:.12,metalness:.8});
  const frameWhite = new THREE.MeshStandardNodeMaterial({color:0xf3f1ea,roughness:.55,metalness:.2});
  const steel = new THREE.MeshStandardNodeMaterial({color:0x7e878d,roughness:.34,metalness:.72});
  const red = new THREE.MeshStandardNodeMaterial({color:0xb2352c,roughness:.6});
  const glowWarm = new THREE.MeshBasicNodeMaterial({color:0xffd9a2});
  const glowWhite = new THREE.MeshBasicNodeMaterial({color:0xf4f6f7});
  const glowBlue = new THREE.MeshBasicNodeMaterial({color:0x8ec8e8});
  const glowRed = new THREE.MeshBasicNodeMaterial({color:0xd8452f});
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
  const bulb = (c, mat, x, y, z, r = .28) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    m.position.set(x, y, z);
    c.g.add(m);
  };

  const c = ctxFor('中央城市广场');
  const b = ctxFor('蓝天国际商贸城');

  // ---------------- 中央商场：7 层百货 + 42 层 147.15m 公寓主塔 ----------------
  if (c) {
    c.g.userData.photoBasis = '2023 fire-service tower photo + 2025-08-30 official mall entrance photo + 2026 AMap layers';
    const edges = sourceEdges(c).filter(e => e.L > 8);

    for (const e of edges) {
      // Deep plinth and seven glazed retail floors with real projecting slabs.
      edgePanel(c, e, glassDark, .2, 3.4, e.L, .45);
      for (let k = 1; k <= 7; k++) {
        const y = k * 3.55;
        edgePanel(c, e, frameWhite, y - .18, .55, e.L + 1.4, .95);
        edgePanel(c, e, glowWarm, y - .5, .14, e.L - .6, 1.06);
        // Every other floor gets a deeper sunshade, so the facade reads in layers.
        if (k % 2 === 0) edgePanel(c, e, frameWhite, y - 1.05, .28, e.L + .8, 1.75);
      }
      // Stone fins every 8 m: 1.4 m wide, 1.1 m proud, full retail height.
      for (let u = -e.L / 2 + 4; u < e.L / 2 - 2; u += 8) {
        box(c, tile, e.x + e.tx * u + e.nx * 1.55, .3, e.z + e.tz * u + e.nz * 1.55,
          1.4, 25.2, 1.1, {ry:e.ry, collide:false});
      }
      // Illuminated fascia and a solid parapet cap.
      edgePanel(c, e, glassDark, 23.4, 2.3, e.L, 1.0);
      edgePanel(c, e, glowWhite, 23.7, .22, e.L - 1, 1.15);
      edgePanel(c, e, tile, 25.4, 1.3, e.L + .6, 1.1);
    }

    // Main entrance faces 人民中路 on the north side of the podium.
    const front = edges.filter(e => e.L > 30).sort((a, b) => a.nz - b.nz)[0];
    if (front) {
      const nx = front.nx, nz = front.nz, tx = front.tx, tz = front.tz;
      const at = (u, v) => ({x:front.x + tx * u + nx * v, z:front.z + tz * u + nz * v});
      const p = at(0, 4.2);
      // Projecting glazed entrance hall, 10 m deep.
      box(c, glassDark, p.x, .3, p.z, 34, 12.4, 9, {ry:front.ry, collide:true});
      box(c, frameWhite, p.x, 12.7, p.z, 35, .7, 10, {ry:front.ry, collide:false});
      // Canopy with a luminous underside, 14 m projection.
      const cp = at(0, 6.4);
      box(c, frameWhite, cp.x, 12.0, cp.z, 38, .65, 10.5, {ry:front.ry, collide:false});
      box(c, glowWhite, cp.x, 11.82, cp.z, 36, .12, 9, {ry:front.ry, collide:false});
      for (const u of [-17, 17]) {
        const q = at(u, 9.5);
        cyl(c, steel, q.x, .25, q.z, .28, .32, 11.8, 8);
      }
      // Lattice of solid steel diagonals on both flanks of the entrance.
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const a = at(side * (18 + i * 2.4), 1.2);
          const b = at(side * (16 + (i + 1) * 2.4), 13.5);
          strut(c, steel, a.x, .3, a.z, b.x, 13.5, b.z, .24);
          strut(c, steel, b.x, .3, b.z, a.x, 13.2, a.z, .2);
        }
      }
      // Red roundel and the illuminated fascia sign above the hall.
      const rp = at(13, 10.2);
      const roundel = new THREE.Mesh(new THREE.CircleGeometry(2.3, 26), red);
      roundel.position.set(rp.x, 5.6, rp.z);
      roundel.rotation.y = front.facing;
      c.g.add(roundel);
      const sp = at(0, 10.3);
      sign(c, '中央商场', sp.x, 16.2, sp.z, 30, 4.4, front.facing, '#5c2323', '#f0d9a8');
      // Entrance steps and bollards.
      for (let i = 0; i < 3; i++) {
        const s = at(0, 9 + i * 1.1);
        box(c, tile, s.x, .3 - i * .12, s.z, 40 - i * 2, .35, 1.2, {ry:front.ry, collide:false});
      }
      for (const u of [-19, -10, 10, 19]) {
        const q = at(u, 11.5);
        cyl(c, steel, q.x, .3, q.z, .16, .18, 1.0, 8);
      }
    }

    // Roof plant and greenery seen on satellite imagery. No single roof slab:
    // the podium is L-shaped, so a full rectangle would overhang the courtyard.
    for (const [u, v, w, h, d] of [
      [-62, -50, 18, 5.2, 12], [-30, -58, 12, 3.6, 9], [10, -52, 16, 4.4, 10],
      [48, -34, 12, 3.2, 9], [-54, 30, 14, 4.8, 10], [18, 44, 20, 5.6, 12],
      [58, 22, 10, 3.4, 8], [-8, 12, 24, 3.0, 8]
    ]) box(c, tileWarm, u, 26.9, v, w, h, d, {collide:false});
    for (const [u, v, w, d] of [[-40, -20, 34, 8], [22, -8, 34, 8], [-10, 40, 40, 7]]) {
      box(c, leaf, u, 27.0, v, w, .5, d, {collide:false});
    }
    // Roof lantern strips and parapet caps.
    for (const [u, v, w, d] of [[-18, -22, 52, 7], [-18, 0, 52, 7], [-18, 22, 52, 7]]) {
      box(c, glassBlue, u, 27.1, v, w, .6, d, {collide:false});
      box(c, frameWhite, u, 27.7, v, w + 2, .35, d + 2, {collide:false});
    }

    // 42-storey tower: pale stone fins, refuge galleries and a stepped crown.
    const tower = {...c, s:{...c.s, sourceId:'way/1455053540'}};
    const te = sourceEdges(tower);
    const tx0 = Math.min(...te.map(e => e.x)), tx1 = Math.max(...te.map(e => e.x));
    const tz0 = Math.min(...te.map(e => e.z)), tz1 = Math.max(...te.map(e => e.z));
    const tx = (tx0 + tx1) / 2, tz = (tz0 + tz1) / 2;
    const tw = tx1 - tx0, td = tz1 - tz0;
    for (const e of te) {
      // Vertical stone fins every 6 m, in three stacked runs so they read at distance.
      for (let u = -e.L / 2 + 3; u < e.L / 2 - 2; u += 6) {
        for (const [y, h] of [[0, 49], [50, 51], [102, 45]]) {
          box(c, tile, e.x + e.tx * u + e.nx * .95, y + .3, e.z + e.tz * u + e.nz * .95,
            1.5, h, .9, {ry:e.ry, collide:false});
        }
      }
      // Refuge floors project 2 m; each gets a thin luminous edge.
      for (const y of [25, 49, 73, 101.5, 125]) {
        edgePanel(c, e, tile, y, 1.0, e.L + 2.6, 1.9);
        edgePanel(c, e, glowWhite, y + .12, .16, e.L + 2.2, 2.0);
      }
      for (const u of [-e.L / 2 + 1, e.L / 2 - 1]) {
        box(c, tile, e.x + e.tx * u + e.nx * .4, .3, e.z + e.tz * u + e.nz * .4,
          1.3, 147.15, 1.3, {ry:e.ry, collide:false});
      }
    }
    // Three setbacks, plant room and a 13 m mast with aviation lights.
    box(c, tile, tx, 147.15, tz, tw * .92 + 3, 3.0, td * .92 + 3, {collide:false});
    box(c, glassDark, tx, 150.15, tz, tw * .78, 2.6, td * .78, {collide:false});
    box(c, tile, tx, 152.75, tz, tw * .62, 2.4, td * .62, {collide:false});
    box(c, tileWarm, tx, 155.15, tz, tw * .42, 2.8, td * .42, {collide:false});
    cyl(c, steel, tx, 157.95, tz, .22, .34, 13, 8);
    for (const [u, v] of [[-1.2, 0], [1.2, 0], [0, -1.2], [0, 1.2]]) {
      strut(c, steel, tx + u, 157.95, tz + v, tx + u * .4, 166, tz + v * .4, .1);
    }
    box(c, steel, tx, 166, tz, 2.6, .25, 2.6, {collide:false});
    bulb(c, glowRed, tx, 171.2, tz, .5);
    bulb(c, glowRed, tx - 1.4, 168.6, tz, .32);
    bulb(c, glowRed, tx + 1.4, 168.6, tz, .32);
  }

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

  // ---------------- Street furniture on the two forecourts ----------------
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
  if (c) furniture(c, -100, -70, -92, -68, 2);
}

export {buildCoreRetail};
