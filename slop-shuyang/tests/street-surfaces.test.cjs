const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadModule } = require('./helpers/module.cjs');
class BufferGeometry {
  constructor() { this.attributes = {}; }
  setAttribute(name, attr) { this.attributes[name] = attr; }
  setIndex(index) { this.index = index; }
}
class Float32BufferAttribute {
  constructor(array, size) { this.array = array; this.itemSize = size; }
}
class Shape{constructor(){this.points=[];this.holes=[];}moveTo(x,z){this.points.push([x,z]);}lineTo(x,z){this.points.push([x,z]);}closePath(){}}
class ExtrudeGeometry{constructor(shape,options){Object.assign(this,{shape,options});}rotateX(a){this.angle=a;}translate(x,y,z){this.translation=[x,y,z];}}
const { ribbonGeometry, insideRing, nearMappedPath, createExtrudedPolygonMesh } = loadModule(
  fs.readFileSync(path.join(__dirname, '../js/city-grid.js'), 'utf8') + '\nexport { ribbonGeometry, insideRing, nearMappedPath, createExtrudedPolygonMesh };', {
    imports: {
      'three/webgpu': { BufferGeometry, Float32BufferAttribute, Shape,ExtrudeGeometry,Mesh:class{constructor(geometry,material){Object.assign(this,{geometry,material});}} },
      'three/addons/utils/BufferGeometryUtils.js': {},
      './city-config.js': { LANDMARK_SITES: {} },
      './road-ribbon.js': loadModule(fs.readFileSync(path.join(__dirname,'../js/road-ribbon.js'),'utf8')),
      './shuyang-geodata.js': { GEO: { mapPaths: [['', 'footway', 2, 0, [0,0,100,0,100,100]]] } }, './tsl-materials.js': {}
    }
  });

test('street and bridge surfaces face upward for every direction, including bends', () => {
  for (const pts of [
    [{x:0,z:0},{x:0,z:100}], [{x:0,z:100},{x:0,z:0}],
    [{x:0,z:0},{x:100,z:0}], [{x:100,z:0},{x:0,z:0}],
    [{x:0,z:0},{x:20,z:50},{x:70,z:80}]
  ]) {
    const g = ribbonGeometry(pts, 8, .03), p = g.attributes.position.array;
    for (let i = 0; i < g.index.length; i += 3) {
      const [a,b,c] = g.index.slice(i,i+3).map((j) => [p[j*3],p[j*3+2]]);
      const normalY = (b[1]-a[1])*(c[0]-a[0]) - (b[0]-a[0])*(c[1]-a[1]);
      assert.ok(normalY > 0, 'backface culling must not hide asphalt from above');
    }
  }
});

test('park vegetation stays within concave mapped park boundaries', () => {
  const ring = [{x:0,z:0},{x:100,z:0},{x:100,z:20},{x:20,z:20},{x:20,z:100},{x:0,z:100}];
  assert.equal(insideRing(ring, 10, 80), true);
  assert.equal(insideRing(ring, 80, 10), true);
  assert.equal(insideRing(ring, 80, 80), false);
});

test('park vegetation leaves space beside both legs of a mapped walking path', () => {
  assert.equal(nearMappedPath(50, 2), true);
  assert.equal(nearMappedPath(99, 50), true);
  assert.equal(nearMappedPath(50, 50), false);
});
test('extruded curb islands pass their interior road and water rings through to actual mesh triangulation',()=>{
  const outer=[{x:0,z:0},{x:100,z:0},{x:100,z:100},{x:0,z:100}],hole=[{x:20,z:20},{x:40,z:20},{x:40,z:40},{x:20,z:40}];
  const mesh=createExtrudedPolygonMesh(outer,0,.18,{},true,false,[hole]);
  assert.equal(mesh.geometry.shape.holes.length,1);
  assert.deepEqual(Array.from(mesh.geometry.shape.holes[0].points,p=>Array.from(p)),[[20,-20],[40,-20],[40,-40],[20,-40]]);
  assert.equal(mesh.geometry.options.depth,.18);assert.equal(mesh.geometry.angle,-Math.PI/2);
});
