import * as THREE from 'three/webgpu';
import { WALL_KINDS } from './tsl-materials.js';
import { polygonContains } from './building-collision.js';
import { gableRoofPlan } from './pitched-roofs.js';

function partyWallHeight(record, a, b, neighbours) {
  const dx = b.x - a.x, dz = b.y - a.y, length = Math.hypot(dx, dz);
  let height = 0;
  // Sample along the wall so a single touching corner does not blank the entire facade.
  for (const t of [0.15, 0.5, 0.85]) {
    const x = a.x + dx * t - dz / length, z = a.y + dz * t + dx / length;
    let roof = 0;
    for (const n of neighbours) {
      if (n.polygons === record.polygons || n.height <= 0 ||
        x < n.x0 || x > n.x1 || z < n.z0 || z > n.z1) continue;
      if (n.polygons.some(p => polygonContains(p, x, z))) roof = Math.max(roof, n.height);
    }
    if (!roof) return 0;
    height = Math.max(height, roof);
  }
  return height;
}

// One merged facade/roof mesh per 1 km cell. Explicit wall coordinates keep window bays metre-sized on any angle.
function createBuildingFootprints(material, records, getNeighbours) {
  const cells = new Map();
  const roofAudit={gabledPolygons:0,gablePlanePolygons:0,hippedPolygons:0,flatPolygons:0};
  records.forEach((record, index) => {
    if (!(record.height > 0)) return;
    const key = Math.floor(record.cx / 1000) + ',' + Math.floor(record.cz / 1000);
    let cell = cells.get(key);
    if (!cell) cells.set(key, (cell = { positions: [], normals: [], indices: [], boxes: [], walls: [], info: [] }));
    const height = record.height, top = height + 0.22;
    const base = record.baseHeight || 0;
    const sourceStorey = record.levels ? (height - base - (record.roofHeight || 0)) / record.levels : 0;
    const addInfo = () => cell.info.push(base, sourceStorey, record.roofShape === 'gabled' ? 1 : 0);
    const seed = Math.floor(record.seed ?? index * 29) % 1000 + 0.1 + 0.8 * (record.tone ?? 0.5);
    const neighbours = getNeighbours && height <= 60 ? getNeighbours(record) : [];

    for (const polygon of record.polygons) {
      const rings = [polygon.outer, ...(polygon.holes || [])].map((ring, i) => {
        const points = ring.map(p => new THREE.Vector2(p.x, p.z));
        if (points.length > 1 && points[0].equals(points[points.length - 1])) points.pop();
        // Clockwise outer walls face away from the building; courtyard walls face into their holes.
        if (THREE.ShapeUtils.isClockWise(points) !== (i === 0)) points.reverse();
        return points;
      });
      if (rings[0].length < 3) continue;
      const turns=rings[0].map((p,i,r)=>{const q=r[(i+1)%r.length],s=r[(i+2)%r.length];return (q.x-p.x)*(s.y-q.y)-(q.y-p.y)*(s.x-q.x)});
      const convex=turns.every(v=>v>1e-6)||turns.every(v=>v< -1e-6);
      const pitched=record.roofShape==='hipped'&&record.roofHeight>0&&rings.length===1&&rings[0].length===4&&convex;
      const gable=record.roofShape==='gabled'?gableRoofPlan(polygon,height,record.roofHeight):null;
      const rise=gable?.rise||(pitched?Math.min(record.roofHeight,height*.25):0),wallTop=top-rise,wallHeight=height-rise;
      rings.forEach((ring, i) => {
        for (let j = 0; j < ring.length; j++) {
          const a = ring[j], b = ring[(j + 1) % ring.length];
          const dx = b.x - a.x, dz = b.y - a.y, width = Math.hypot(dx, dz);
          if (width === 0) continue;
          const offset = cell.positions.length / 3;
          const adjacentHeight = !i && neighbours.length ? partyWallHeight(record, a, b, neighbours) : 0;
          const isShop = record.storefronts && (!record.shopEdges || record.shopEdges.some(([x, z]) =>
            Math.hypot((a.x + b.x) / 2 - x, (a.y + b.y) / 2 - z) < 1));
          const kind = i ? WALL_KINDS.rear : adjacentHeight ? WALL_KINDS.lotLine
            : isShop ? WALL_KINDS.shop : WALL_KINDS.front;
          const exposedHeight = adjacentHeight ? Math.max(0, wallTop - adjacentHeight) : wallHeight;
          // Match the positive-world-axis tangent used by the shared interior-map view ray.
          const reverse = (Math.abs(dz) >= Math.abs(dx) ? dz : dx) < 0;
          cell.positions.push(a.x, base + 0.22, a.y, b.x, base + 0.22, b.y, a.x, wallTop, a.y, b.x, wallTop, b.y);
          for (let k = 0; k < 4; k++) {
            addInfo();
            cell.normals.push(-dz / width, 0, dx / width);
            // Footprint walls use the box's unused depth for the exposed height above adjoining roofs.
            cell.boxes.push(width, wallHeight, exposedHeight, seed);
            cell.walls.push(reverse ? 1 - k % 2 : k % 2, k < 2 ? wallHeight : 0, kind);
          }
          cell.indices.push(offset, offset + 1, offset + 2, offset + 2, offset + 1, offset + 3);
        }
      });
      if(gable){
        roofAudit.gabledPolygons++;roofAudit.gablePlanePolygons+=gable.faces.length;
        const triangle=(aa,bb,cc,normal=null)=>{
          const u=bb.map((v,i)=>v-aa[i]),v=cc.map((v,i)=>v-aa[i]);
          let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
          if(normal?n.reduce((s,q,i)=>s+q*normal[i],0)<0:n[1]<0){[bb,cc]=[cc,bb];n=n.map(q=>-q);}
          const length=Math.hypot(...n);if(length<1e-8)return;
          const offset=cell.positions.length/3,kind=normal?WALL_KINDS.lotLine:WALL_KINDS.front;
          for(const q of [aa,bb,cc]){
            addInfo();cell.positions.push(...q);cell.normals.push(...n.map(v=>v/length));
            cell.boxes.push(1,height,normal?0:height,seed);
            cell.walls.push(normal?0:q[0]*gable.axis[0]+q[2]*gable.axis[1],normal?0:gable.across(q[0],q[2]),kind);
          }
          cell.indices.push(offset,offset+1,offset+2);
        };
        // Blank gable caps start at the common eave, preserving horizontal
        // storeys on the main facade. Split boundary edges at ridge crossings.
        for(const ring of rings)for(let i=0;i<ring.length;i++){
          const a=ring[i],b=ring[(i+1)%ring.length],va=gable.across(a.x,a.y),vb=gable.across(b.x,b.y);
          const points=[a];
          if(va*vb< -1e-8){const t=va/(va-vb);points.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
          points.push(b);
          const L=Math.hypot(b.x-a.x,b.y-a.y);if(L<1e-6)continue;
          const normal=[-(b.y-a.y)/L,0,(b.x-a.x)/L];
          for(let j=1;j<points.length;j++){
            const c=points[j-1],d=points[j],C=[c.x,wallTop,c.y],D=[d.x,wallTop,d.y];
            const ct=[c.x,gable.heightAt(c.x,c.y),c.y],dt=[d.x,gable.heightAt(d.x,d.y),d.y];
            triangle(C,D,ct,normal);triangle(ct,D,dt,normal);
          }
        }
        for(const face of gable.faces){
          const faceRings=[face.outer,...face.holes].map((r,i)=>{
            const ps=r.map(p=>new THREE.Vector2(p.x,p.z));
            if(THREE.ShapeUtils.isClockWise(ps)!==(i===0))ps.reverse();return ps;
          });
          const points=faceRings.flat();
          for(const ids of THREE.ShapeUtils.triangulateShape(faceRings[0],faceRings.slice(1))){
            triangle(...ids.map(i=>{const p=points[i];return[p.x,gable.heightAt(p.x,p.y),p.y];}));
          }
        }
        continue;
      }
      if(pitched){
        roofAudit.hippedPolygons++;
        // The source height includes the roof. Four hips meet an actual ridge,
        // rather than adding a wedge above the recorded building height.
        const p=rings[0].slice(),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
        if(distance(p[0],p[1])<distance(p[1],p[2]))p.push(p.shift());
        const L=distance(p[0],p[1]),ux=(p[1].x-p[0].x)/L,uz=(p[1].y-p[0].y)/L;
        const depth=Math.abs(ux*(p[3].y-p[0].y)-uz*(p[3].x-p[0].x)),inset=Math.min(depth/2,L/2);
        const a=[(p[0].x+p[3].x)/2+ux*inset,top,(p[0].y+p[3].y)/2+uz*inset];
        const b=[(p[1].x+p[2].x)/2-ux*inset,top,(p[1].y+p[2].y)/2-uz*inset];
        const v=p.map(q=>[q.x,wallTop,q.y]);
        const triangle=(aa,bb,cc)=>{
          let u=bb.map((v,i)=>v-aa[i]),v=cc.map((v,i)=>v-aa[i]);
          let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
          if(n[1]<0){[bb,cc]=[cc,bb];n=n.map(q=>-q)}
          const length=Math.hypot(...n);if(length<1e-6)return;
          const offset=cell.positions.length/3;
          for(const q of [aa,bb,cc]){addInfo();cell.positions.push(...q);cell.normals.push(...n.map(v=>v/length));cell.boxes.push(1,height,height,seed);cell.walls.push(0,0,WALL_KINDS.front)}
          cell.indices.push(offset,offset+1,offset+2);
        };
        triangle(v[0],v[1],b);triangle(v[0],b,a);triangle(v[1],v[2],b);
        triangle(v[2],v[3],a);triangle(v[2],a,b);triangle(v[3],v[0],a);
        continue;
      }
      roofAudit.flatPolygons++;
      const triangles = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1));
      const points = rings.flat(), offset = cell.positions.length / 3;
      for (const p of points) {
        addInfo();
        cell.positions.push(p.x, top, p.y);
        cell.normals.push(0, 1, 0);
        cell.boxes.push(1, height, height, seed);
        cell.walls.push(0, 0, WALL_KINDS.front);
      }
      for (const [a, b, c] of triangles) cell.indices.push(offset + a, offset + c, offset + b);
    }
  });

  const group = new THREE.Group();
  group.name = 'SurveyedBuildings';
  group.userData={...group.userData,roofAudit};
  let first;
  for (const cell of cells.values()) {
    if (cell.indices.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(cell.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(cell.normals, 3));
    geometry.setAttribute('box', new THREE.Float32BufferAttribute(cell.boxes, 4));
    geometry.setAttribute('facadeWall', new THREE.Float32BufferAttribute(cell.walls, 3));
    geometry.setAttribute('buildingInfo', new THREE.Float32BufferAttribute(cell.info, 3));
    geometry.setIndex(cell.indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'SurveyedBuildingChunk';
    mesh.castShadow = mesh.receiveShadow = true;
    // Most cells are too small for scene-culling.js to pick them as big casters on its own: opt in to its stand-ins.
    mesh.userData.shadowStandIn = true;
    if (first) mesh.userData.sharesPipelineWith = first;
    else first = mesh;
    group.add(mesh);
  }
  return group;
}

export { createBuildingFootprints };
