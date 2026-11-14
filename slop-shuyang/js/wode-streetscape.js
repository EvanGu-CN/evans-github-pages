import * as THREE from 'three/webgpu';
import { ROADS } from './city-config.js';

// 沃德嘉园周边道路断面细化（苏州西路、临安东路/西路、长安路、河滨路的研究窗口内）。
//
// 影像与文本依据：
// - 高德地点图 B020F0IJ8D-2（沃德嘉园地点照片）：主路一侧红砖停车带 + 黄色车位线、
//   大块石材人行道、白色景观灯柱。照片未逐点绑定到哪条路，按同片区主路样式表达，
//   只用于红砖/黄线/石板/景观灯这四类构件，不据此断言具体路名。
// - 高德卫星 z18 拼图（2026-11-14 取得，拍摄日未公开）：临安西路与长安路沿线可见
//   路侧停车带与成排行道树；河滨路东侧为滨河绿带与步道。
// - 江苏省住建厅 2020-11-12《沭阳：锦绣花乡似画屏》：「临安路，梧桐遮夏荫」，
//   苏州路两侧绿化带升级出新（林荫步道、微广场）；老沭河河岸配建亲水平台、
//   在林荫间铺设透水混凝土步道（河滨路一侧）。
//
// 只在既有地面之上叠加薄构件（0.22 m 步行面以上），不动车行道路面几何、
// 不新增建筑来源。车位数、灯距与步道宽度为展示估计。

const WINDOW = { minX: 380, maxX: 840, minZ: 1560, maxZ: 2460 };

// 红砖停车带只做有照片/影像依据的三条；苏州西路为林荫大道样式，不做红砖带。
const BRICK_ROADS = /^(临安|长安路)/;
const PROMENADE_ROADS = /^河滨/;
const LAMP_ROADS = /^(临安|长安路|苏州西路)/;

function createBatch(material, name) {
  const positions = [], normals = [], uvs = [];
  const vertex = (p, n, uv) => {
    positions.push(p[0], p[1], p[2]);
    normals.push(n[0], n[1], n[2]);
    uvs.push(uv[0], uv[1]);
  };
  const faceNormal = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  };
  const triRaw = (a, b, c, ua, ub, uc) => {
    const n = faceNormal(a, b, c);
    vertex(a, n, ua); vertex(b, n, ub); vertex(c, n, uc);
  };
  const tri = (a, b, c, dir = null, ua = [0, 0], ub = [1, 0], uc = [1, 1]) => {
    if (dir) {
      const n = faceNormal(a, b, c);
      if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) return triRaw(a, c, b, ua, uc, ub);
    }
    triRaw(a, b, c, ua, ub, uc);
  };
  const quad = (a, b, c, d, dir = null, uvs = null) => {
    const uv = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    tri(a, b, c, dir, uv[0], uv[1], uv[2]);
    tri(a, c, d, dir, uv[0], uv[2], uv[3]);
  };
  const box = (cx, y, cz, w, h, d, ry = 0) => {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const hw = w / 2, hd = d / 2;
    const local = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    const world = local.map(([lx, lz]) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]);
    const low = world.map(p => [p[0], y, p[1]]);
    const high = world.map(p => [p[0], y + h, p[1]]);
    quad(low[0], low[1], low[2], low[3], [0, -1, 0]);
    quad(high[0], high[1], high[2], high[3], [0, 1, 0]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const mx = (low[i][0] + low[j][0]) / 2 - cx, mz = (low[i][2] + low[j][2]) / 2 - cz;
      const len = Math.hypot(mx, mz) || 1;
      quad(low[i], low[j], high[j], high[i], [mx / len, 0, mz / len]);
    }
  };
  return {
    tri, quad, box,
    get empty() { return positions.length === 0; },
    build() {
      if (!positions.length) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    }
  };
}

function buildWodeStreetscape(root) {
  const group = new THREE.Group();
  group.name = '街区·沃德沿街';

  const std = (color, o = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...o });
  const M = {
    brick: std(0x9c6248, { roughness: 0.93 }),
    line: std(0xd9c25a, { roughness: 0.8 }),
    slab: std(0xb6b0a2, { roughness: 0.92 }),
    walk: std(0xaea79a, { roughness: 0.95 }),
    pole: std(0xe8e6df, { roughness: 0.55, metalness: 0.25 }),
    head: std(0x3c4148, { roughness: 0.5, metalness: 0.4 })
  };
  const batches = {
    brick: createBatch(M.brick, '沿街·红砖停车带'),
    line: createBatch(M.line, '沿街·黄色车位线'),
    slab: createBatch(M.slab, '沿街·石材人行道'),
    walk: createBatch(M.walk, '沿街·滨河步道'),
    pole: createBatch(M.pole, '沿街·景观灯柱'),
    head: createBatch(M.head, '沿街·景观灯头')
  };

  const stats = { brickSegments: 0, slotLines: 0, slabSegments: 0, promenadeSegments: 0, lamps: 0, roads: [] };
  const seenRoads = new Set();

  for (const road of ROADS) {
    const name = road.name || '';
    if (!name || road.bridge) continue;
    const wantsBrick = BRICK_ROADS.test(name);
    const wantsPromenade = PROMENADE_ROADS.test(name);
    const wantsLamps = LAMP_ROADS.test(name);
    if (!wantsBrick && !wantsPromenade && !wantsLamps) continue;
    const pts = road.pts;
    const half = (road.w || 12) / 2;
    // 景观灯沿整条路的 28 m 网格布点（不是每小段一盏）。
    let lampCursor = 6;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1.5) continue;
      const ux = dx / len, uz = dz / len;
      const nx = -uz, nz = ux;
      const ry = -Math.atan2(uz, ux);
      // 长路段切成 ≤16 m 的小段再过滤窗口，避免整段横跨窗口导致构件出界。
      const pieces = Math.max(1, Math.ceil(len / 16));
      const segLen = len / pieces;
      for (let p = 0; p < pieces; p++) {
        const t0 = p / pieces, t1 = (p + 1) / pieces;
        const sx0 = a.x + dx * t0, sz0 = a.z + dz * t0;
        const sx1 = a.x + dx * t1, sz1 = a.z + dz * t1;
        const mx = (sx0 + sx1) / 2, mz = (sz0 + sz1) / 2;
        if (mx < WINDOW.minX || mx > WINDOW.maxX || mz < WINDOW.minZ || mz > WINDOW.maxZ) continue;
        seenRoads.add(name);

        if (wantsBrick) {
          // 两侧红砖停车带（车行道缘石外 0.6–3.2 m）+ 石材人行道（3.2–5.6 m）。
          for (const side of [-1, 1]) {
            const px = mx + nx * side * (half + 1.9), pz = mz + nz * side * (half + 1.9);
            batches.brick.box(px, 0.235, pz, segLen, 0.022, 2.6, ry);
            stats.brickSegments++;
            const gx = mx + nx * side * (half + 4.4), gz = mz + nz * side * (half + 4.4);
            batches.slab.box(gx, 0.235, gz, segLen, 0.02, 2.4, ry);
            stats.slabSegments++;
            // 黄色车位线：照片样式，每 2.6 m 一道。
            const bays = Math.max(1, Math.round(segLen / 2.6));
            for (let k = 0; k <= bays; k++) {
              const t = k / bays;
              const lx = sx0 + (sx1 - sx0) * t + nx * side * (half + 1.9);
              const lz = sz0 + (sz1 - sz0) * t + nz * side * (half + 1.9);
              batches.line.box(lx, 0.252, lz, 0.12, 0.012, 2.6, ry);
              stats.slotLines++;
            }
          }
        }

        if (wantsPromenade) {
          // 河滨路东侧滨河步道（透水混凝土样式，2020 省住建厅报道 + 卫星可见岸线步道）。
          const east = nx > 0 ? 1 : -1;
          const wx = mx + nx * east * (half + 3.2), wz = mz + nz * east * (half + 3.2);
          batches.walk.box(wx, 0.234, wz, segLen, 0.02, 2.6, ry);
          stats.promenadeSegments++;
        }

        if (wantsLamps) {
          // 景观灯柱（照片样式）：沿人行道外缘 28 m 网格、单侧交替，跨小段连续计数。
          const lampStep = 28;
          while (lampCursor < segLen) {
            const t = lampCursor / segLen;
            const side = (stats.lamps % 2) ? 1 : -1;
            const lx = sx0 + (sx1 - sx0) * t + nx * side * (half + 5.2);
            const lz = sz0 + (sz1 - sz0) * t + nz * side * (half + 5.2);
            if (lx >= WINDOW.minX && lx <= WINDOW.maxX && lz >= WINDOW.minZ && lz <= WINDOW.maxZ) {
              batches.pole.box(lx, 0.22, lz, 0.18, 4.1, 0.18, ry);
              batches.pole.box(lx, 4.32, lz, 0.34, 0.1, 0.34, ry);
              batches.head.box(lx + nx * side * 0.34, 4.2, lz + nz * side * 0.34, 0.52, 0.12, 0.24, ry);
              stats.lamps++;
            }
            lampCursor += lampStep;
          }
          lampCursor -= segLen;
        }
      }
    }
  }
  stats.roads = [...seenRoads].sort();

  for (const batch of Object.values(batches)) {
    const mesh = batch.build();
    if (mesh) group.add(mesh);
  }
  group.userData = {
    photoBasis: 'AMap place photo B020F0IJ8D-2 (road edge style, position not point-bound), AMap z18 mosaic 2026-11-14 (capture date unpublished) and Jiangsu housing dept. 2020-11-12 street-landscape report; strip widths, bay pitch and lamp spacing are display estimates',
    stats
  };
  root.add(group);
  return { group, stats };
}

export { buildWodeStreetscape };
