import * as THREE from 'three/webgpu';

// Exterior and west-square photographs: 沭阳发布 / 我苏网, 2019-09-29.
// Dimensions and exact furniture positions are estimates; this is a historical
// photo reference, not a claim about the present tenants or lighting inventory.
const JIUSHENG_PHOTO_SOURCE = 'https://www.ourjiangsu.com/a/20190929/1569742645931.shtml';

function jiushengPlazaFrame(edges) {
  const west = edges.filter(e => e.L > 20).reduce((a, b) => b.nx < a.nx ? b : a);
  return {
    edge: west,
    halfLength: Math.min(27, west.L / 2 - 4),
    at(u, v) {
      return {x: west.x + west.tx * u + west.nx * v, z: west.z + west.tz * u + west.nz * v};
    }
  };
}

function buildJiushengPrecinct({c, box, cyl, M, sourceEdges, edgePanel}) {
  if (!c) return;
  const edges = sourceEdges(c);
  const frame = jiushengPlazaFrame(edges);
  const stone = new THREE.MeshStandardNodeMaterial({color: 0xb4b0a5, roughness: .92});
  const paving = new THREE.MeshStandardNodeMaterial({color: 0x727878, roughness: .94});
  const redPaving = new THREE.MeshStandardNodeMaterial({color: 0x99644f, roughness: .94});
  const timber = new THREE.MeshStandardNodeMaterial({color: 0x684c37, roughness: .86});
  const flowers = [0x9a285e, 0xb24e42, 0xb3903e].map(color =>
    new THREE.MeshStandardNodeMaterial({color, roughness: .9}));
  const light = color => new THREE.MeshStandardNodeMaterial({color, emissive: color, emissiveIntensity: .65, roughness: .4});
  const warm = light(0xf2d8a1), pink = light(0x8d508e), blue = light(0x5d8c9a);
  const screen = new THREE.MeshStandardNodeMaterial({color: 0x23465b, emissive: 0x294a5d, emissiveIntensity: .9, roughness: .38});
  const drawBox = (mat, x, y, z, w, h, d, ry = 0) => box(c, mat, x, y, z, w, h, d, {ry, collide: false});
  const onFace = (e, u, v) => ({x: e.x + e.tx * u + e.nx * v, z: e.z + e.tz * u + e.nz * v});

  // Only the two photographed street elevations receive shop doors, framed
  // advertising panels and articulated cornices. No 2019 brand is a current tenant.
  for (const e of edges.filter(e => e.nx < -.7 || e.nz > .7)) {
    for (const y of [15.65, 16.05, 16.45]) edgePanel(c, e, M.offWhite, y, .18, e.L + 1.2, .85);
    edgePanel(c, e, M.darkStone, 3.4, 1.05, e.L, 1.12);
    edgePanel(c, e, M.offWhite, 4.45, .35, e.L, 1.35);
    edgePanel(c, e, warm, 3.24, .1, e.L - .4, 1.4);
    edgePanel(c, e, warm, 16.62, .08, e.L, .95);
    // Recessed glazing bays and door transoms beneath the projecting fascia.
    for (let u = -e.L / 2 + 2.8; u <= e.L / 2 - 2.8; u += 4.2) {
      const p = onFace(e, u, 1.35);
      drawBox(M.frame, p.x, .3, p.z, .15, 3.05, .3, e.ry);
      const top = onFace(e, u + 1.95, 1.36);
      drawBox(M.frame, top.x, 2.65, top.z, 3.9, .12, .3, e.ry);
    }
    // Preserve the blue-glass corner: stop screens and ribs 15 m short of it.
    const glassEnd = e.nx < -.7 ? 1 : -1;
    const start = glassEnd < 0 ? -e.L / 2 + 20 : -e.L / 2 + 10;
    const end = glassEnd > 0 ? e.L / 2 - 20 : e.L / 2 - 10;
    for (let u = start; u <= end; u += 17) {
      const p = onFace(e, u, 1.05);
      drawBox(M.offWhite, p.x, 6.1, p.z, 12.8, 7.1, .55, e.ry);
      const q = onFace(e, u, 1.36);
      drawBox(screen, q.x, 6.5, q.z, 12, 6.3, .18, e.ry);
    }
    for (let u = -e.L / 2 + 2; u <= e.L / 2 - 2; u += 8.4) {
      if ((glassEnd > 0 && u > e.L / 2 - 15) || (glassEnd < 0 && u < -e.L / 2 + 15)) continue;
      const p = onFace(e, u, .95);
      drawBox(M.darkStone, p.x, 4.8, p.z, .22, 10.1, .45, e.ry);
    }
  }

  // The plaza follows the surveyed west wall, rather than an axis-aligned box.
  // 3 m frontage remains clear; the outer edge stays east of Shanghai Road.
  const patch = (mat, u, v, w, d, y = .245, h = .035) => {
    const p = frame.at(u, v);
    return drawBox(mat, p.x, y, p.z, w, h, d, frame.edge.ry);
  };
  patch(paving, 0, 10.5, frame.halfLength * 2, 15);
  patch(redPaving, 0, 4.2, frame.halfLength * 2, 2.2, .285, .025);
  for (let u = -frame.halfLength; u <= frame.halfLength; u += 3) {
    patch(stone, u, 10.5, .055, 14.8, .29, .018);
  }
  for (const v of [6, 9, 12, 15, 17.8]) patch(stone, 0, v, frame.halfLength * 2, .055, .29, .018);

  // Curved inset light ribbons seen in the night photos. Short straight pieces
  // follow the curve with physical widths; no large point lights or photo decals.
  for (let band = 0; band < 3; band++) {
    for (let i = 0; i < 72; i++) {
      const u0 = -frame.halfLength + i / 72 * frame.halfLength * 2;
      const u1 = -frame.halfLength + (i + 1) / 72 * frame.halfLength * 2;
      const curve = u => 7.4 + band * 2.9 + Math.sin(u * .105 + band * .5) * 1.05;
      const a = frame.at(u0, curve(u0)), b = frame.at(u1, curve(u1));
      drawBox([warm, pink, blue][band], (a.x + b.x) / 2, .315, (a.z + b.z) / 2,
        Math.hypot(b.x - a.x, b.z - a.z), .018, .07, -Math.atan2(b.z - a.z, b.x - a.x));
    }
  }

  // Stone flower beds with timber bench slats on their inner edge, visible in
  // the street-level photograph. Keep gaps at both ends and down the middle.
  for (const u of [-19, 0, 19]) {
    patch(stone, u, 16.3, 7.6, 2.2, .28, .44);
    patch(M.grass, u, 16.3, 7.2, 1.8, .72, .12);
    for (let k = 0; k < 12; k++) patch(flowers[k < 2 || k > 9 ? 2 : k % 5 === 0 ? 1 : 0], u - 3.25 + k * .59, 16.3, .52, 1.5, .84, .16);
    for (let k = 0; k < 5; k++) patch(timber, u, 14.6 + k * .14, 6.8, .11, .72, .09);
  }

  // Paired spherical 'dandelion' lights: Fibonacci spokes and seed heads give
  // the actual open silhouette, rather than an opaque glowing sphere.
  const stemGeometry = new THREE.CylinderGeometry(.021, .021, 1, 4);
  const seedGeometry = new THREE.SphereGeometry(.065, 5, 3);
  const direction = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0);
  for (const [u, v, height, radius] of [[-8, 12.8, 7.7, 1.55], [-2.8, 12.8, 9.1, 1.85]]) {
    const p = frame.at(u, v);
    cyl(c, M.frame, p.x, .3, p.z, .09, .16, height, 8);
    for (let i = 0; i < 56; i++) {
      const yy = 1 - 2 * (i + .5) / 56;
      const ring = Math.sqrt(1 - yy * yy), theta = i * 2.399963229728653;
      direction.set(Math.cos(theta) * ring, yy, Math.sin(theta) * ring);
      const stem = new THREE.Mesh(stemGeometry, M.frame);
      stem.position.set(p.x + direction.x * radius / 2, height + direction.y * radius / 2, p.z + direction.z * radius / 2);
      stem.scale.y = radius;
      stem.quaternion.setFromUnitVectors(axis, direction);
      c.g.add(stem);
      const seed = new THREE.Mesh(seedGeometry, warm);
      seed.position.set(p.x + direction.x * radius, height + direction.y * radius, p.z + direction.z * radius);
      c.g.add(seed);
    }
  }
  c.g.userData.precinctReference = {
    source: JIUSHENG_PHOTO_SOURCE, published: '2019-09-29', imageAcquired: null,
    geometryNote: 'Source footprint retained; plaza depth, fittings and positions estimated from historical photographs.'
  };
}

export {buildJiushengPrecinct, jiushengPlazaFrame, JIUSHENG_PHOTO_SOURCE};
