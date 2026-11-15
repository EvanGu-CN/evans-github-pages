import * as THREE from 'three/webgpu';
import {buildBlueskyCanopy} from './bluesky-canopy.js';

// 蓝天商贸城识别性细化。中央商场由 central-plaza.js 单独重建，
// 避免重复的旧冠部、入口体块和两套立面叠加。
// 蓝天依据：2022司法评估、公开照片及2026高德图层；细部仍为展示估计。
function buildCoreRetail({ctxFor,box,cyl,sign,M,sourceEdges,edgePanel,colliders}) {
  const tile = new THREE.MeshStandardNodeMaterial({color:0xd3d0c7,roughness:.86});
  const tileWarm = new THREE.MeshStandardNodeMaterial({color:0xc7c0b2,roughness:.88});
  const steel = new THREE.MeshStandardNodeMaterial({color:0x7e878d,roughness:.34,metalness:.72});
  const glowWarm = new THREE.MeshBasicNodeMaterial({color:0xffd9a2});
  const glowWhite = new THREE.MeshBasicNodeMaterial({color:0xf4f6f7});
  const leaf = new THREE.MeshStandardNodeMaterial({color:0x4d6f45,roughness:.95});

  const b = ctxFor('蓝天国际商贸城');

  if(b) buildBlueskyCanopy({c:b,cyl,sign,colliders});

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
