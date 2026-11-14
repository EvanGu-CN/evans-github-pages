import * as THREE from 'three/webgpu';

// Photo-guided details only. The two shops retain their OSM footprints; the
// school gets an entrance, never a replacement campus or an invented main hall.
export function buildPhotoLandmarks({ ctxFor, box, cyl, sign, M, sourceBody }) {
  const built = [];
  const standard = (color, options = {}) => new THREE.MeshStandardNodeMaterial({
    color, roughness: 0.68, metalness: 0.08, ...options
  });
  const P = {
    cream: standard(0xd4c8ab),
    silver: standard(0xd7d9d4, { metalness: 0.42, roughness: 0.46 }),
    seam: standard(0x919995),
    gold: standard(0xc6a65b, { metalness: 0.4 }),
    glass: standard(0x398ba9, { metalness: 0.62, roughness: 0.19 }),
    dark: standard(0x30393b),
    gateStone: standard(0xa9a79e),
    canopy: standard(0xd0cec1),
    red: standard(0xb61824),
    slats: [0xcc453b, 0xe2ae46, 0x578fa4, 0x8aab88, 0xe7dcc2].map(v => standard(v))
  };
  const addMesh = (c, geometry, material, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    c.g.add(mesh);
    return mesh;
  };
  // Structural/facade rods are visual details; only source bodies and actual
  // ground-level obstructions go through the provided collision helpers.
  const beamBatches = new Map();
  const beam = (c, material, a, b, radius = 0.12) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const length = delta.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    const matrix = new THREE.Matrix4().compose(start.add(end).multiplyScalar(0.5), rotation,
      new THREE.Vector3(radius, length, radius));
    if (!beamBatches.has(c.g)) beamBatches.set(c.g, new Map());
    const materials = beamBatches.get(c.g);
    if (!materials.has(material)) materials.set(material, []);
    materials.get(material).push(matrix);
  };
  const panel = (c, material, a, b, y, h, thickness = 0.45) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    return box(c, material, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2,
      Math.hypot(dx, dz), h, thickness, { ry: -Math.atan2(dz, dx), collide: false });
  };

  {
    const c = ctxFor('吾悦广场');
    if (c) {
      c.g.userData.photoBasis = 'OSM way/1372583929; wuyue-day/night and Amap exterior photos';
      sourceBody(c, P.cream, 24);
      // Surveyed west edge in world coordinates, facing Taizhou South Road.
      // Keep facade strips on this irregular edge instead of replacing the
      // 461 m north/south footprint with a short rectangular shopping box.
      const frontage = [
        [1861, 2614.5], [1845, 2658], [1841.5, 2710],
        [1855.5, 2753], [1848, 2763.5], [1845, 2774],
        [1848, 2781.5], [1825, 2826], [1816, 2875.5],
        [1813.5, 2899], [1805.5, 2922.5], [1806.5, 2937.5],
        [1826.5, 2957.5], [1835.5, 2969.5]
      ].map(([x, z]) => [x - c.s.x - 0.6, z - c.s.z]);
      for (let i = 0; i < frontage.length - 1; i++) {
        const a = frontage[i], b = frontage[i + 1];
        panel(c, P.glass, a, b, 0.3, 7.2);
        panel(c, i % 4 === 0 ? P.gold : P.silver, a, b, 8, 16);
        for (const y of [3.8, 7.5, 23.8]) panel(c, P.dark, a, b, y, 0.24, 0.6);
        const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
        const point = t => [a[0] + (b[0] - a[0]) * t - 0.3, a[1] + (b[1] - a[1]) * t];
        for (let j = 0; j < n; j++) {
          const p = point(j / n), q = point((j + 0.5) / n), r = point((j + 1) / n);
          beam(c, P.dark, [p[0], 0.4, p[1]], [p[0], 7.5, p[1]], 0.08);
          // Repeated two-storey diamond seams, visible as geometry, not a photo.
          for (const y of [8.2, 16]) {
            beam(c, P.seam, [p[0], y, p[1]], [q[0], y + 3.8, q[1]], 0.045);
            beam(c, P.seam, [q[0], y + 3.8, q[1]], [r[0], y, r[1]], 0.045);
            beam(c, P.seam, [p[0], y + 7.6, p[1]], [q[0], y + 3.8, q[1]], 0.045);
            beam(c, P.seam, [q[0], y + 3.8, q[1]], [r[0], y + 7.6, r[1]], 0.045);
          }
        }
      }

      // Curved blue-glass entrance: upper ring flares out toward the street.
      const ex = 1856 - c.s.x, ez = 2688 - c.s.z;
      const rows = 6, segments = 24, positions = [], indices = [];
      const at = (theta, y) => {
        const radius = 24 + y * 0.32;
        return [ex + Math.cos(theta) * radius, y + 0.3, ez + Math.sin(theta) * radius];
      };
      for (let row = 0; row <= rows; row++) {
        const y = row * 4;
        for (let i = 0; i <= segments; i++) positions.push(...at(Math.PI / 2 + i * Math.PI / segments, y));
      }
      for (let row = 0; row < rows; row++) {
        for (let i = 0; i < segments; i++) {
          const a = row * (segments + 1) + i, b = a + segments + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const curvedGlass = P.glass.clone();
      curvedGlass.side = THREE.DoubleSide;
      addMesh(c, geometry, curvedGlass, '吾悦·外扩曲面玻璃入口');
      for (let i = 0; i <= segments; i++) {
        const theta = Math.PI / 2 + i * Math.PI / segments;
        beam(c, P.silver, at(theta, 0), at(theta, 24), 0.085);
        if (i < segments) {
          for (let row = 0; row <= rows; row++) {
            beam(c, row === rows ? P.gold : P.silver, at(theta, row * 4),
              at(theta + Math.PI / segments, row * 4), row === rows ? 0.22 : 0.09);
          }
        }
      }
      box(c, P.gold, ex - 28.8, 4.7, ez, 5.5, 0.7, 18, { collide: false });
      sign(c, '吾悦广场', ex - 31.8, 18.4, ez, 25, 4.1, -Math.PI / 2, '#d9dbd7', '#263e49');
      // Roof fins and a limited bank of colored vertical slats match the
      // photographed facade without spreading them over the entire building.
      for (let i = 0; i < 15; i++) {
        const worldZ = 2721 + i * 1.7;
        const x = 1841.5 + (worldZ - 2710) * 14 / 43 - c.s.x - 0.8;
        box(c, P.slats[i % P.slats.length], x, 9, worldZ - c.s.z,
          1.25, 16.5, 0.65, { collide: false });
      }
      for (let i = 0; i < 9; i++) {
        box(c, P.silver, ex - 6 + i * 4, 23.7, ez - 27, 0.5, 4.3, 10, { collide: false });
      }
      built.push('吾悦广场');
    }
  }

  {
    const c = ctxFor('江苏省沭阳高级中学');
    if (c) {
      c.g.userData.photoBasis = 'highschool-amap-2.jpg; Dongguan Street 132 entrance only';
      // The site is the verified entrance, not the campus centroid. Rotate each
      // component explicitly so the collision helpers keep the same transform.
      const heading = c.s.heading ?? c.s.rotationY ?? 0;
      const cs = Math.cos(heading), sn = Math.sin(heading);
      const point = (x, z) => [x * cs + z * sn, -x * sn + z * cs];
      const gateBox = (mat, x, y, z, w, h, d, opts = {}) => {
        const p = point(x, z);
        return box(c, mat, p[0], y, p[1], w, h, d, { ...opts, ry: heading + (opts.ry || 0) });
      };
      for (const x of [-5.8, 5.8]) {
        gateBox(P.gateStone, x, 0.22, 0, 1.35, 5.4, 1.8);
        gateBox(P.canopy, x, 0.22, 1.02, 0.12, 5.1, 0.12, { collide: false });
      }
      // Overhead members never become ground-to-roof blocking colliders.
      gateBox(P.gateStone, 0, 4.45, -0.08, 10.3, 1.2, 1.25, { collide: false });
      gateBox(P.canopy, 0, 5.65, 0, 16.1, 0.65, 4.1, { collide: false });
      gateBox(P.gateStone, 0, 6.3, -0.08, 16.5, 0.18, 4.3, { collide: false });
      const letters = point(0, 0.59);
      sign(c, '江苏省沭阳高级中学', letters[0], 5.06, letters[1], 10, 0.77,
        heading, '#aaa89e', '#c3a565');
      const number = point(-5.8, 0.94);
      sign(c, '132', number[0], 2.12, number[1], 0.72, 0.42, heading, '#447fb3', '#ffffff');
      // Small side gatehouse and a folded retractable gate leave a clear
      // 8 m central passage. Existing source school buildings remain intact.
      gateBox(P.gateStone, 10.2, 0.22, -1.3, 5, 3.7, 5.3);
      gateBox(P.canopy, 10.2, 3.92, -1.25, 6, 0.35, 6.2, { collide: false });
      gateBox(P.glass, 10.2, 1.3, 1.39, 3.8, 1.6, 0.1, { collide: false });
      gateBox(P.dark, 6.65, 0.22, -0.55, 0.65, 2.25, 0.7);
      for (let i = 0; i < 7; i++) {
        const x = 4.1 + i * 0.17;
        gateBox(M.metal || P.silver, x, 0.42, 0.2, 0.07, 1.25, 0.55, { collide: false });
        const a = point(x, -0.08), b = point(x + 0.3, 0.45);
        beam(c, P.silver, [a[0], 0.4, a[1]], [b[0], 1.65, b[1]], 0.045);
      }
      built.push('江苏省沭阳高级中学');
    }
  }
  // Hundreds of diamond seams and window bars share only a handful of draws.
  const rodGeometry = new THREE.CylinderGeometry(1, 1, 1, 5);
  for (const [group, batches] of beamBatches) {
    for (const [material, matrices] of batches) {
      const mesh = new THREE.InstancedMesh(rodGeometry, material, matrices.length);
      mesh.name = '照片参考·立面构件';
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return built;
}
