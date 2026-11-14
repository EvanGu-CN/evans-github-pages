// Plan-view verification drawing for js/bayi-district.js (stubbed three.js, same as tests).
// Not a browser screenshot: top-down projection of the module's actual triangles plus source footprints.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { NEIGHBORHOODS, ROADS } from '../js/city-config.js';
import { GEO } from '../js/shuyang-geodata.js';

const { loadModule } = createRequire(import.meta.url)('../tests/helpers/module.cjs');
const source = readFileSync(new URL('../js/bayi-district.js', import.meta.url), 'utf8');
const REAL_BUILDINGS = JSON.parse(gunzipSync(readFileSync(
  new URL('../tools/data/shuyang/buildings-enriched.json.gz', import.meta.url)))).buildings.map((b, i) => {
  const polygons = b.polygons.map(p => ({
    outer: p.outer.map(([x, z]) => ({ x, z })),
    holes: (p.holes || []).map(h => h.map(([x, z]) => ({ x, z })))
  }));
  const xs = polygons[0].outer.map(p => p.x), zs = polygons[0].outer.map(p => p.z);
  return {
    height: b.height, baseHeight: b.baseHeight, category: b.category, heightSource: b.heightSource,
    source: b.source, levels: b.levels, roofShape: b.roofShape, roofHeight: b.roofHeight,
    seed: 301 + i, polygons,
    minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs),
    cx: (Math.min(...xs) + Math.max(...xs)) / 2, cz: (Math.min(...zs) + Math.max(...zs)) / 2
  };
});
class Geom {
  constructor() { this.attributes = {}; }
  setAttribute(name, value) { this.attributes[name] = value; }
  computeBoundingSphere() {}
}
const THREE = {
  Group: class { constructor() { this.name = ''; this.children = []; this.userData = {}; } add(o) { this.children.push(o); } },
  BufferGeometry: Geom,
  Float32BufferAttribute: class {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
  },
  Mesh: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; } },
  MeshStandardNodeMaterial: class { constructor(o) { Object.assign(this, o); } },
  MeshBasicNodeMaterial: class { constructor(o) { Object.assign(this, o); } },
  CanvasTexture: class { constructor() { this.colorSpace = ''; } },
  RepeatWrapping: 1000, SRGBColorSpace: 'srgb'
};
const { buildBayiDistrict } = loadModule(source, {
  imports: {
    'three/webgpu': THREE,
    './building-geodata.js': { REAL_BUILDINGS },
    './city-config.js': { NEIGHBORHOODS, ROADS }
  }
});
const root = new THREE.Group();
const result = buildBayiDistrict(root);
if (!result) throw new Error('module produced nothing');

const nb = NEIGHBORHOODS.find(n => n.name === '八一·文枢院');
const ring = nb.polygons[0].outer;
const xs = ring.map(p => p.x), zs = ring.map(p => p.z);
const pad = 40;
const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
const minZ = Math.min(...zs) - pad, maxZ = Math.max(...zs) + pad;
const W = 900, H = Math.round(W * (maxZ - minZ) / (maxX - minX));
const sx = v => ((v - minX) / (maxX - minX) * W).toFixed(1);
const sz = v => ((v - minZ) / (maxZ - minZ) * H).toFixed(1);

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif">
<rect width="${W}" height="${H}" fill="#f4f1ea"/>
<text x="12" y="22" font-size="16" fill="#333">八一·文枢院 平面核对图（模块真实几何俯视，非浏览器截图）</text>
<text x="12" y="40" font-size="11" fill="#666">灰=街区构件俯视范围 · 红=来源楼体轮廓 · 黄=小区范围 · 门/售楼处已标注 · 2026-11-13</text>`;
// community boundary
const pts = [];
for (let i = 0; i < ring.length; i += 2) pts.push(`${sx(ring[i])},${sz(ring[i + 1])}`);
svg += `<polygon points="${pts.join(' ')}" fill="none" stroke="#d8a400" stroke-width="2.5"/>`;
// source footprints
for (const b of REAL_BUILDINGS) {
  if (!result.group.userData.records.some(r => Math.hypot(r.cx - b.cx, r.cz - b.cz) < 1) &&
      !(b.cx > minX && b.cx < maxX && b.cz > minZ && b.cz < maxZ)) continue;
  if (!(b.cx > minX && b.cx < maxX && b.cz > minZ && b.cz < maxZ)) continue;
  const o = b.polygons[0].outer;
  const p = [];
  for (let i = 0; i < o.length; i++) p.push(`${sx(o[i].x)},${sz(o[i].z)}`);
  svg += `<polygon points="${p.join(' ')}" fill="rgba(220,80,60,.18)" stroke="#c04030" stroke-width="1.2"/>`;
}
// detail mesh plan hulls (per mesh, projected triangles as light grey outlines)
for (const mesh of result.group.children) {
  const pos = mesh.geometry.attributes.position.array;
  const tris = [];
  for (let i = 0; i < pos.length; i += 9) {
    const ax = +sx(pos[i]), az = +sz(pos[i + 2]);
    const bx = +sx(pos[i + 3]), bz = +sz(pos[i + 5]);
    const cx = +sx(pos[i + 6]), cz = +sz(pos[i + 8]);
    tris.push(`<polygon points="${ax},${az} ${bx},${bz} ${cx},${cz}" fill="rgba(60,60,60,.12)" stroke="rgba(60,60,60,.25)" stroke-width=".3"/>`);
  }
  svg += `<g data-mesh="${mesh.name}">${tris.join('')}</g>`;
}
// markers
const mark = (x, z, label) => {
  svg += `<circle cx="${sx(x)}" cy="${sz(z)}" r="5" fill="#0a6"/><text x="${+sx(x) + 8}" y="${+sz(z) + 4}" font-size="12" fill="#064">${label}</text>`;
};
mark(-732, -1128, '南门（近似）');
mark(-732, -1142, '售楼处');
svg += '</svg>';
writeFileSync(new URL('../docs/acceptance/bayi-district-2026-11-13/plan-overview.svg', import.meta.url), svg);
console.log('stats', JSON.stringify(result.stats));
console.log('meshes', result.group.children.length);
let verts = 0;
for (const m of result.group.children) verts += m.geometry.attributes.position.count;
console.log('vertices', verts);

// Also dump projected triangles + footprints as JSON for the PIL raster pass.
const dump = { minX, minZ, maxX, maxZ, W, H, ring, sources: [], meshes: [] };
for (const b of REAL_BUILDINGS) {
  if (!(b.cx > minX && b.cx < maxX && b.cz > minZ && b.cz < maxZ)) continue;
  dump.sources.push(b.polygons[0].outer.map(p => [p.x, p.z]));
}
for (const mesh of result.group.children) {
  const pos = mesh.geometry.attributes.position.array;
  const tris = [];
  for (let i = 0; i < pos.length; i += 9) {
    tris.push([pos[i], pos[i + 2], pos[i + 3], pos[i + 5], pos[i + 6], pos[i + 8]]);
  }
  dump.meshes.push({ name: mesh.name, tris });
}
writeFileSync(new URL('../docs/acceptance/bayi-district-2026-11-13/plan-geometry.json', import.meta.url), JSON.stringify(dump));
console.log('plan-geometry.json written');
