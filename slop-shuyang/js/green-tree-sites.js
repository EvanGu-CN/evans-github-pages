// Sample tree positions inside reviewed green surfaces, e.g. the courtyard
// planting of 沃德嘉园 (`reviewed/wode/row-green-*`, perimeter belts, central
// garden). The sampler is pure: the caller supplies the collision pad so trees
// never land on a mapped building, and the hash keeps the spacing organic.

function hash(a, b) {
  return Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;
}

function inRing(ring, x, z) {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const x1 = ring[i], z1 = ring[i + 1], x2 = ring[j], z2 = ring[j + 1];
    if ((z1 > z) !== (z2 > z) && x < (x2 - x1) * (z - z1) / (z2 - z1) + x1) hit = !hit;
  }
  return hit;
}

function collectGreenTreeSites(surfaces, blockedAt, opts = {}) {
  const step = opts.step ?? 9;
  const skip = opts.skip ?? 0.22;
  const sites = [];
  for (const surface of surfaces) {
    if (surface.kind !== 'green' || !String(surface.id).startsWith('reviewed/wode/')) continue;
    for (const poly of surface.polygons) {
      const ring = poly.outer;
      if (!ring || ring.length < 6) continue;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < ring.length; i += 2) {
        minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i]);
        minZ = Math.min(minZ, ring[i + 1]); maxZ = Math.max(maxZ, ring[i + 1]);
      }
      for (let x = minX + step * 0.4; x < maxX; x += step) {
        for (let z = minZ + step * 0.4; z < maxZ; z += step) {
          const h = hash(x, z);
          if (h < skip) continue;
          const px = x + (h - 0.5) * step * 0.55;
          const pz = z + (hash(z, x) - 0.5) * step * 0.55;
          if (!inRing(ring, px, pz)) continue;
          let inHole = false;
          for (const hole of poly.holes || []) {
            if (inRing(hole, px, pz)) { inHole = true; break; }
          }
          if (inHole) continue;
          if (blockedAt && blockedAt(px, pz, 1.6)) continue;
          sites.push({
            x: px, y: 0.22, z: pz,
            scale: 0.62 + h * 0.3,
            species: h < 0.5 ? 1 : h < 0.8 ? 0 : 2,
            tier: 1
          });
        }
      }
    }
  }
  return sites;
}

export { collectGreenTreeSites };
