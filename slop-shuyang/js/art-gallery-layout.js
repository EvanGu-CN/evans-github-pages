import {GEO} from './shuyang-geodata.js';
import clipping from './vendor/polygon-clipping.js';

// Digitised against the architect-supplied site plan, then fitted to the mapped
// project parcel. Plan/photo agreement supports the arrangement, not surveying
// accuracy or current conditions. Heights below remain display estimates.
const ART_GALLERY={sourceId:'way/1321791113',sourceBuildingIndex:622,
  planBounds:[233,360,714,1062],sourceHeight:12.9,redHeight:26.8,captureDate:null,
  basis:'UAD site plan and Zhao Qiang built photographs, published 2020-07-07',
  sourcePage:'https://www.gooood.cn/shuyang-art-gallery-jiangsu-by-architectural-design-and-research-institute-of-zhejiang-university.htm',
  limits:'Plan fitted to the mapped project parcel; dimensions, heights, curved cuts, brick modules and planting are display estimates. Source footprint/height records remain unchanged.'};
const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const ART_GALLERY_PARTS=[
  {id:'white-entry',kind:'white',height:11.5,plan:rect(500,525,598,610)},
  {id:'ink-east-small',kind:'ink',height:9.8,plan:[[524,619],[584,619],[584,665],[570,690],[524,690]]},
  {id:'ink-east-court',kind:'ink',height:12.3,plan:[[524,701],[560,701],[563,724],[571,746],[585,765],[602,777],[602,829],[524,829]]},
  {id:'white-west',kind:'white',height:18,plan:rect(289,619,362,750),ribbon:true},
  {id:'roof-court',kind:'white',height:7.8,plan:rect(372,619,512,748),garden:true},
  {id:'ink-west-court',kind:'ink',height:12.3,plan:[[325,759],[384,759],[398,788],[398,889],[325,889]]},
  {id:'white-south',kind:'white',height:18,plan:rect(289,900,397,1006),ribbon:true},
  {id:'office',kind:'white',height:8,plan:rect(454,866,594,1006)},
  {id:'office-upper',kind:'white',base:8,height:3,plan:rect(454,866,594,927)}
];
const ART_GALLERY_LINKS=[
  rect(478,539,500,596),rect(337,610,362,619),rect(362,644,372,722),rect(512,644,524,690),
  rect(372,748,388,759),rect(337,889,355,900),rect(398,852,454,866),rect(406,910,444,987)
];
const ART_GALLERY_POND=[[480,445],[629,445],[629,610],[598,610],[598,525],[500,525],[500,598],[480,598]];
const ART_GALLERY_BRIDGE=rect(478,507,526,518);
const ART_GALLERY_RED_PLAN=rect(289,419,478,610);
const galleryParcel=GEO.mapBuildings.find(b=>b.id===ART_GALLERY.sourceId);
if(!galleryParcel||galleryParcel.o.length!==8)throw new Error('Art gallery source parcel drift');
function galleryWorld(p){
  const b=galleryParcel;
  const u=(p[0]-233)/481,v=(p[1]-360)/702;
  const nw=[b.o[4],b.o[5]],ne=[b.o[2],b.o[3]],sw=[b.o[6],b.o[7]],se=[b.o[0],b.o[1]];
  return{x:(nw[0]*(1-u)+ne[0]*u)*(1-v)+(sw[0]*(1-u)+se[0]*u)*v,
    z:(nw[1]*(1-u)+ne[1]*u)*(1-v)+(sw[1]*(1-u)+se[1]*u)*v};
}
function galleryRedPoint(u,v,y){
  // A shallow spherical subtraction produces the photographed curved upper
  // facade cut while keeping a flat roof. It is a silhouette approximation.
  const H=ART_GALLERY.redHeight,R=53,d=50;
  const scoop=(along)=>Math.max(0,Math.sqrt(Math.max(0,R*R-(y-H)*(y-H)-along*along))-d);
  const wn=Math.max(0,Math.min(1,(6-v)/6)),we=Math.max(0,Math.min(1,(u-27.5)/6));
  return{u:u-scoop(v-17)*we,v:v+scoop(u-16.75)*wn,y};
}
function galleryRedWorld(u,v,y){
  const p=galleryRedPoint(u,v,y);
  const q=galleryWorld([289+p.u/33.5*189,419+p.v/34*191]);return{...q,y};
}
function galleryShaftRing(y,segments=64){
  const t=y/ART_GALLERY.redHeight,scale=.58+.42*t,ring=[];
  // The architect's plan shows a rounded, flat-ended opening rather than the
  // previous decorative ellipse and torus. Its taper follows the built shaft.
  for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,px=394+53*Math.cos(a)*scale,py=497+Math.min(20,49*Math.sin(a))*scale;
    ring.push(galleryWorld([px,py]));
  }
  return ring;
}
function galleryDisplayFootprints(){
  return[{id:'red-hall',kind:'red',height:ART_GALLERY.redHeight,outer:ART_GALLERY_RED_PLAN.map(galleryWorld),holes:[galleryShaftRing(.3)]},
    ...ART_GALLERY_PARTS.filter(p=>!p.base).map(p=>({...p,outer:p.plan.map(galleryWorld),holes:[]})),
    ...ART_GALLERY_LINKS.map((p,i)=>({id:'glass-'+i,kind:'glass',height:6.6,outer:p.map(galleryWorld),holes:[]}))];
}
function galleryPondPolygons(){
  return clipping.difference([ART_GALLERY_POND],...ART_GALLERY_PARTS.filter(p=>!p.base).map(p=>[p.plan]),...ART_GALLERY_LINKS.map(p=>[p]))
    .map(p=>({outer:p[0].slice(0,-1).map(galleryWorld),holes:p.slice(1).map(r=>r.slice(0,-1).map(galleryWorld))}));
}
function galleryPavingPolygons(){
  // The built photos show broad wavy paving, not the exact alignment below.
  // Clip the illustrative bands to the project parcel and all physical halls.
  const obstacles=[ART_GALLERY_RED_PLAN,...ART_GALLERY_PARTS.filter(p=>!p.base).map(p=>p.plan),...ART_GALLERY_LINKS,ART_GALLERY_POND];
  const clip=p=>clipping.difference([p],...obstacles.map(r=>[r])).map(p=>({outer:p[0].slice(0,-1).map(galleryWorld),holes:p.slice(1).map(r=>r.slice(0,-1).map(galleryWorld))}));
  const base=clip(rect(234,361,713,1061)),bands=[];
  for(let row=380;row<1080;row+=77){
    const edge=offset=>Array.from({length:41},(_,i)=>{const x=234+i/40*479;return[x,row+offset+22*Math.sin(x/65+row/120)];});
    const wave=[...edge(0),...edge(22).reverse()];
    const inParcel=clipping.intersection([wave],[rect(234,361,713,1061)]);
    for(const p of inParcel)bands.push(...clip(p[0].slice(0,-1)));
  }
  // Bilinear parcel fitting slightly bends long plan edges. Clip again in
  // world space so independently sampled edges cannot leave paving slivers.
  const worldShape=p=>[p.outer,...p.holes].map(r=>r.map(q=>[q.x,q.z]));
  const worldObstacles=[...galleryDisplayFootprints(),...galleryPondPolygons()].map(worldShape);
  const clean=polys=>polys.flatMap(p=>clipping.difference(worldShape(p),...worldObstacles).map(p=>({
    outer:p[0].slice(0,-1).map(q=>({x:q[0],z:q[1]})),holes:p.slice(1).map(r=>r.slice(0,-1).map(q=>({x:q[0],z:q[1]})))})));
  return{base:clean(base),bands:clean(bands)};
}
export {ART_GALLERY,ART_GALLERY_PARTS,ART_GALLERY_LINKS,ART_GALLERY_POND,ART_GALLERY_BRIDGE,ART_GALLERY_RED_PLAN,
  galleryWorld,galleryRedPoint,galleryRedWorld,galleryShaftRing,galleryDisplayFootprints,galleryPondPolygons,galleryPavingPolygons};
