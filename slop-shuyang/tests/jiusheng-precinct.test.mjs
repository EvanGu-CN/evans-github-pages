import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {GEO} from '../js/shuyang-geodata.js';
import {LANDMARK_SITES, ROADS} from '../js/city-config.js';

const {loadModule} = createRequire(import.meta.url)('./helpers/module.cjs');
const site = LANDMARK_SITES['久盛百货'];
const source = GEO.mapBuildings.find(b => b.id === site.sourceId);
function sourceEdges() {
  const p = source.o, n = p.length / 2;
  let area = 0;
  for (let i = 0; i < n; i++) {const j = (i + 1) % n; area += p[2*i]*p[2*j+1] - p[2*j]*p[2*i+1];}
  return Array.from({length: n}, (_, i) => {
    const j = (i + 1) % n, dx = p[2*j]-p[2*i], dz = p[2*j+1]-p[2*i+1], L = Math.hypot(dx,dz);
    return {x:(p[2*i]+p[2*j])/2-site.x, z:(p[2*i+1]+p[2*j+1])/2-site.z, L,
      tx:dx/L, tz:dz/L, nx:Math.sign(area)*dz/L, nz:-Math.sign(area)*dx/L, ry:-Math.atan2(dz,dx)};
  });
}
function setup() {
  const objects = [], boxes = [], panels = [], cylinders = [];
  class Vec {
    constructor(x=0,y=0,z=0){this.set(x,y,z);}
    set(x,y,z){Object.assign(this,{x,y,z});return this;}
  }
  class Mesh {
    constructor(geometry,material){Object.assign(this,{geometry,material,position:new Vec(),scale:new Vec(1,1,1),quaternion:{setFromUnitVectors(){}}});}
  }
  const THREE = {Mesh, Vector3:Vec, MeshStandardNodeMaterial:class {constructor(p){Object.assign(this,p);}},
    CylinderGeometry:class {}, SphereGeometry:class {}};
  const api = loadModule(readFileSync(new URL('../js/jiusheng-precinct.js',import.meta.url),'utf8'),{imports:{'three/webgpu':THREE}});
  const M = Object.fromEntries(['offWhite','darkStone','frame','grass'].map(name=>[name,{name}]));
  const c = {s:site,g:{userData:{},add(o){objects.push(o);}}};
  api.buildJiushengPrecinct({c,M,sourceEdges,box(...args){boxes.push(args);},cyl(...args){cylinders.push(args);},edgePanel(...args){panels.push(args);}});
  return {...api,objects,boxes,panels,cylinders,c};
}
const distance = (x,z,a,b) => {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
};

test('west-square paving and furniture keep clear of the real carriageways', () => {
  const {boxes} = setup();
  const ground = boxes.filter(b=>b[3]+b[6]<=1.1);
  assert.ok(ground.length>200);
  for (const b of ground) {
    const [, , x, , z, w, , d, opts] = b;
    const cs=Math.cos(opts.ry),sn=Math.sin(opts.ry);
    for(const [u,v] of [[-w/2,-d/2],[-w/2,d/2],[w/2,-d/2],[w/2,d/2]]) {
      const wx=site.x+x+cs*u+sn*v,wz=site.z+z-sn*u+cs*v;
      for(const road of ROADS.filter(r=>r.kind!=='footway'&&r.kind!=='path')) {
        for(let i=1;i<road.pts.length;i++) assert.ok(distance(wx,wz,road.pts[i-1],road.pts[i])>=road.w/2+.35,road.name+' clearance');
      }
      assert.ok(wx>15&&wx<65&&wz> -116&&wz< -42,'plaza stays west of its source building');
      let inside = false;
      for (let i=0,j=source.o.length-2;i<source.o.length;j=i,i+=2) {
        const ax=source.o[i],az=source.o[i+1],bx=source.o[j],bz=source.o[j+1];
        if ((az>wz)!==(bz>wz) && wx<(bx-ax)*(wz-az)/(bz-az)+ax) inside=!inside;
      }
      assert.equal(inside,false,'paving does not penetrate the source footprint');
    }
  }
});

test('photographed facade treatment is confined to south and west elevations', () => {
  const {panels,boxes} = setup();
  assert.ok(panels.length>0);
  for(const [,e] of panels) assert.ok(e.nx<-.7||e.nz>.7);
  for(const b of boxes) {
    assert.ok(b.slice(2,8).every(Number.isFinite));
    assert.ok(b[5]>0&&b[6]>0&&b[7]>0);
    assert.equal(b[8].collide,false,'overlay does not replace source collision');
  }
});

test('dandelion lights have open spokes and bounded heads rather than opaque globes', () => {
  const {objects,cylinders} = setup();
  assert.equal(cylinders.length,2);
  assert.equal(objects.length,224);
  for(const o of objects) {
    assert.ok([o.position.x,o.position.y,o.position.z].every(Number.isFinite));
    assert.ok(o.position.y>5&&o.position.y<12);
  }
});

test('historical photo date and unknown acquisition date remain explicit', () => {
  const {c,JIUSHENG_PHOTO_SOURCE} = setup();
  assert.equal(c.g.userData.precinctReference.source,JIUSHENG_PHOTO_SOURCE);
  assert.equal(c.g.userData.precinctReference.published,'2019-09-29');
  assert.equal(c.g.userData.precinctReference.imageAcquired,null);
  assert.match(c.g.userData.precinctReference.geometryNote,/estimated/);
});
