import * as THREE from 'three/webgpu';
import { ISLAND_BOUNDS } from './city-config.js';

// 只保留城区绿带：在核心区外缘种一圈树，不再生成乡镇、村庄和远处厂房。
// 城区范围外由 city-grid.js 的田野色块与雾效收边。

function buildBoroughs(scene) {
  const group = new THREE.Group();
  group.name = 'ShuyangGreenBelt';

  const treeMat = new THREE.MeshStandardNodeMaterial({ color: 0x4d6b3f, roughness: 0.95 });
  const geo = new THREE.ConeGeometry(3.2, 8, 6);
  const dummy = new THREE.Object3D();
  const hash = (a, b) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;

  const trees = [];
  const { minX, maxX, minZ, maxZ } = ISLAND_BOUNDS;
  const step = 26;
  for (let x = minX - 500; x <= maxX + 500; x += step) {
    for (const z of [minZ - 260 - hash(x, 1) * 180, maxZ + 260 + hash(x, 2) * 180]) {
      if (hash(x, z) < 0.45) continue;
      trees.push({ x: x + (hash(x, 3) - 0.5) * 14, z, s: 0.7 + hash(x, 4) * 0.8 });
    }
  }
  for (let z = minZ - 400; z <= maxZ + 400; z += step) {
    for (const x of [minX - 260 - hash(5, z) * 180, maxX + 260 + hash(6, z) * 180]) {
      if (hash(x, z) < 0.45) continue;
      trees.push({ x, z: z + (hash(7, z) - 0.5) * 14, s: 0.7 + hash(8, z) * 0.8 });
    }
  }
  if (trees.length) {
    const inst = new THREE.InstancedMesh(geo, treeMat, trees.length);
    trees.forEach((t, i) => {
      dummy.position.set(t.x, 4 * t.s, t.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(t.s, t.s, t.s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.castShadow = true;
    group.add(inst);
  }

  scene.add(group);
  return { group, colliders: [] };
}

export { buildBoroughs };
