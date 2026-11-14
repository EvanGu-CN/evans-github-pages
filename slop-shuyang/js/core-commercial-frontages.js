import * as THREE from 'three/webgpu';
import { GEO } from './shuyang-geodata.js';
import { BUILDING_PHOTO_REFERENCES } from './building-photo-references.js';

// Overlays retain the ordinary source body, roof, height and collision polygon.
// The east elevation is inferred from the documented Guangchang Road boundary;
// the other elevations have no verified exterior photo and remain unchanged.
function buildCoreCommercialFrontages({root, M, box, cyl, sign, sourceEdges, edgePanel}) {
  const std = (color, extra = {}) => new THREE.MeshStandardNodeMaterial({color, roughness: .78, ...extra});
  const stone = std(0xb4a78b), seam = std(0x827a68), louver = std(0x353d3c);
  const blueGlass = std(0x487d98, {roughness: .24, metalness: .45});
  const pale = std(0xd3d0c4), paving = std(0xadaaa0, {roughness: .94});
  const glow = std(0xe9debb, {emissive: 0xd6bd89, emissiveIntensity: .4});

  for (const review of BUILDING_PHOTO_REFERENCES) {
    if (review.id !== 'vienna') continue;
    const b = GEO.mapBuildings.find(b => b.id === review.sourceId);
    if (!b) throw new Error('Missing reviewed source building: ' + review.sourceId);
    const xs = b.o.filter((_, i) => i % 2 === 0), zs = b.o.filter((_, i) => i % 2 === 1);
    const s = {sourceId: b.id, x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2};
    const g = new THREE.Group(); g.name = '沿街建筑·' + review.name;
    g.position.set(s.x, 0, s.z); root.add(g);
    const c = {s, g};
    const e = sourceEdges(c).reduce((a, b) => b.nx > a.nx ? b : a);
    const at = (u, v) => ({x: e.x + e.tx * u + e.nx * v, z: e.z + e.tz * u + e.nz * v});
    const put = (mat, u, y, v, w, h, d) => {
      const p = at(u, v);
      return box(c, mat, p.x, y, p.z, w, h, d, {ry: e.ry, collide: false});
    };
    const panel = (mat, u, y, w, h, v = .48) => put(mat, u, y, v, w, h, .18);
    const top = Math.min(b.h, 14.8);
    edgePanel(c, e, stone, .24, top - .24, e.L, .22);

    // Tall beige cladding modules with narrow, recessed joints.
    for (let u = -e.L / 2 + 1.6; u <= e.L / 2 - 1.6; u += 3.2) panel(seam, u, 4.4, .045, top - 4.6, .43);
    for (const y of [4.4, 7.7, 11.1, top - .35]) panel(seam, 0, y, e.L, .055);

    // Upper glazing and its light aluminium grid, scaled to the retained height.
    panel(blueGlass, 0, 11.2, e.L - 2.2, top - 11.5, .57);
    for (let u = -e.L / 2 + 3; u < e.L / 2 - 2; u += 3.7) panel(pale, u, 11.2, .1, top - 11.4, .7);
    for (const y of [11.2, 12.6, 14.05]) panel(pale, 0, y, e.L - 2.2, .1, .7);

    // Wide louver fields alternate with solid panel piers. The small photo
    // supports their pattern, not an exact louver or tenant count.
    for (const u of [-35, 35]) {
      panel(louver, u, 4.8, 21, 6.0, .61);
      for (let y = 4.95; y < 10.7; y += .29) panel(M.darkStone, u, y, 21, .07, .77);
      panel(pale, u, 4.65, 22, .17, .7);
      panel(pale, u, 10.8, 22, .17, .7);
    }
    // The actual building title, not any of the historical shops below it.
    panel(seam, 0, 5.4, 26, 5.2, .7);
    panel(pale, 0, 5.7, 25.2, 4.55, .84);
    const title = at(0, .96);
    sign(c, review.name, title.x, 6.9, title.z, 18, 2.4, e.facing, '#d3d0c4', '#983f36', {aspect:8,fontSize:72,border:false});
    const logo = new THREE.Mesh(new THREE.TorusGeometry(.66, .07, 6, 24), M.red);
    const lp = at(0, 1.0); logo.position.set(lp.x, 8.9, lp.z); logo.rotation.y = e.facing; g.add(logo);
    put(M.red, 0, 8.0, 1.0, .1, 1.9, .12);

    // Recessed ground-floor doors, shop fascias and a shallow entrance canopy.
    panel(M.glass, 0, .28, e.L - 1.4, 3.2, .57);
    for (let u = -e.L / 2 + 1.8; u < e.L / 2; u += 5.8) {
      panel(pale, u, .3, .24, 3.45, .76);
      if (u + 2.65 < e.L / 2 - 1) panel(M.frame, u + 2.65, 2.6, 5.1, .1, .77);
    }
    panel(louver, 0, 3.5, e.L - .5, .65, .86);
    panel(glow, 0, 3.48, e.L - 1, .07, .98);
    put(M.darkStone, 0, 3.92, .75, 15.5, .18, 2.0);
    const entrance = at(0, 1.03);
    sign(c, '维也纳商业广场', entrance.x, 3.77, entrance.z, 13, .42, e.facing, '#302f2d', '#c95343');
    for (const u of [-2.0, 0, 2.0]) panel(M.frame, u, .35, .1, 2.7, .79);

    // Confine the walking strip to the narrow space between the mapped wall
    // and the seven-metre carriageway; add neither guessed parking nor road paint.
    put(paving, 0, .245, 1.08, e.L - 7.0, .035, 1.45);
    for (let u = -e.L / 2 + 4; u <= e.L / 2 - 4; u += 1.6) put(seam, u, .285, 1.08, .025, .012, 1.42);
    for (const u of [-28, 0, 28]) {
      const p = at(u, 1.25);
      cyl(c, pale, p.x, .28, p.z, .065, .10, 5.4, 8);
      put(pale, u, 5.3, 1.25, 1.5, .06, .08);
      for (const offset of [-.65, 0, .65]) {
        const q = at(u + offset, 1.25), sphere = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), glow);
        sphere.position.set(q.x, offset === 0 ? 5.9 : 5.55, q.z); g.add(sphere);
      }
    }
    g.userData.photoReview = {sourceId: b.id, sourceBuildingIndex: review.sourceBuildingIndex,
      faces: review.modeledFaces, retainedHeight: b.h, captureDate: null, sourcePage: review.photos[0].page,
      orientation: 'inferred from east street boundary; not a measured camera pose'};
  }
}

export {buildCoreCommercialFrontages};
