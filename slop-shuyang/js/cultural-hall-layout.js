import {GEO} from './shuyang-geodata.js';
import clipping from './vendor/polygon-clipping.js';

// Roof outlines digitised in AMap GCJ-02 z18 imagery, converted back to the
// source WGS84 frame. Image acquisition date is unknown. Roof parallax and
// manual tracing make these display estimates, not surveyed ground outlines.
const points=r=>r.map(([x,z])=>({x,z}));
const CULTURAL_HALLS=[
  {id:'library',sourceId:'way/1321791114',sourceBuildingIndex:623,name:'沭阳县图书馆',sourceHeight:15,
    outer:points([[-2507.68,4121.04],[-2448.87,4133.32],[-2465.17,4204.53],[-2527.45,4191.75]]),
    roofPixels:[[440,321],[559,346],[526,491],[400,465]],height:18,displayMaxHeight:19,front:'west',
    skylight:points([[-2496.32,4142.65],[-2472.1,4148.05],[-2481.98,4189.31],[-2505.7,4183.9]]),
    greens:[points([[-2442.44,4140.69],[-2423.66,4144.62],[-2442.93,4231.06],[-2458.75,4227.62]]),points([[-2539.31,4216.8],[-2465.17,4232.03],[-2466.65,4239.89],[-2541.78,4224.66]])],
    photoPage:'https://jsnews.jschina.com.cn/sq/a/202401/t20240118_3349991.shtml',publicationDate:'2024-01-17',captureDate:null,
    limits:'West-facing facade inferred from the north road, east housing and southern art/museum relation in the built aerial. Four floors are reported in the 2019 project announcement, not individually surveyed. Height, recess depth, panels and roof details are estimates.'},
  {id:'museum',sourceId:'way/1321791112',sourceBuildingIndex:621,name:'沭阳县博物馆',sourceHeight:11.7,
    outer:points([[-2433.04,4267.89],[-2381.15,4279.19],[-2396.96,4344.02],[-2449.84,4332.72]]),
    roofPixels:[[591,620],[696,643],[664,775],[557,752]],height:11.7,displayMaxHeight:15.3,front:'south',
    roofProfile:[[0,11.7],[.25,15.3],[.5,11.7],[.75,14.4],[1,11.7]],
    dome:{x:-2404.37,z:4342.05,radius:3.9,base:11.4},
    greens:[points([[-2375.71,4282.63],[-2364.83,4285.09],[-2381.63,4354.82],[-2390.53,4352.86]]),points([[-2450.33,4348.92],[-2412.28,4357.77],[-2414.75,4369.06],[-2453.3,4360.71]])],
    photoPage:'https://www.sohu.com/a/408511385_668341',publicationDate:'2020-07-19',captureDate:null,
    limits:'South entrance bound to the Lanting Road forecourt. Folded roof and blue dome are visible in UAD built aerials; ridge profile, dome elevation/radius, stone modules and entrance dimensions are estimates. Two main floors and local third floor are reported, not individually measured.'}
];
const CULTURAL_HALL_BY_SOURCE=new Map(CULTURAL_HALLS.map(h=>[h.sourceId,h]));
const CULTURAL_IMAGERY={provider:'AMap official public satellite tiles',zoom:18,tileOrigin:[217543,104638],retrievedAt:'2026-11-15',imageAcquired:null,
  coordinates:'GCJ-02 Web Mercator pixels inverted to WGS84, then project world coordinates',redistribution:'Reference imagery is not bundled with the site.'};
function hallPoint(h,u,v){const [nw,ne,se,sw]=h.outer;return{x:(nw.x*(1-u)+ne.x*u)*(1-v)+(sw.x*(1-u)+se.x*u)*v,z:(nw.z*(1-u)+ne.z*u)*(1-v)+(sw.z*(1-u)+se.z*u)*v};}
function hallEdge(h,side){
  const [nw,ne,se,sw]=h.outer,[a,b]=side==='west'?[nw,sw]:side==='east'?[se,ne]:side==='north'?[ne,nw]:[sw,se];
  const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz),center=hallPoint(h,.5,.5);let nx=dz/L,nz=-dx/L;
  if(((a.x+b.x)/2-center.x)*nx+((a.z+b.z)/2-center.z)*nz<0){nx=-nx;nz=-nz;}
  return{a,b,L,nx,nz,angle:-Math.atan2(dz,dx),facing:Math.atan2(nx,nz)};
}
function hallFacePoint(h,side,u,offset=0){const e=hallEdge(h,side);return{x:e.a.x+(e.b.x-e.a.x)*u+e.nx*offset,z:e.a.z+(e.b.z-e.a.z)*u+e.nz*offset};}
const polygon=p=>[p.map(q=>[q.x,q.z])];
const unpack=polys=>polys.map(p=>({outer:points(p[0].slice(0,-1)),holes:p.slice(1).map(r=>points(r.slice(0,-1)))}));
function hallSiteSurfaces(h){
  const source=GEO.mapBuildings.find(b=>b.id===h.sourceId);if(!source)throw Error('Missing cultural hall parcel '+h.sourceId);
  const parcel=[Array.from({length:source.o.length/2},(_,i)=>source.o.slice(i*2,i*2+2))];
  // Green pieces are independent beds; union them before subtracting from the
  // paving. Intersection of all beds would incorrectly erase both of them.
  const greenUnion=clipping.difference(clipping.intersection(clipping.union(...h.greens.map(polygon)),parcel),polygon(h.outer));
  const paving=unpack(clipping.difference(parcel,polygon(h.outer),greenUnion));
  return{greens:unpack(greenUnion),paving};
}
export {CULTURAL_HALLS,CULTURAL_HALL_BY_SOURCE,CULTURAL_IMAGERY,hallPoint,hallEdge,hallFacePoint,hallSiteSurfaces};
