import {GEO} from './shuyang-geodata.js';
const BLUESKY_CANOPY={sourceId:'way/1321791084',sourceIndex:2726,sourceHeight:19.3,bodyDisplayHeight:25,base:26.2,thickness:1.2,
  halfWidth:104,halfDepth:8,offset:5,radius:6.2,displayMaxHeight:32,
  photo:'https://img10.360buyimg.com/n0/jfs/t1/216838/2/45438/129947/6713843eFd9215053/edb0ba1c72c3ac0b.jpg',
  page:'https://paimai.jd.com/detailUnaudit/309846413',captureDate:null,
  limits:'The auction photograph shows a single flat canopy with a circular open oculus, rectangular sky slots, slender silver posts and pink roof lettering. Dimensions, slot count/spacing, post count, height and south-front placement are display estimates. The source parcel/body is retained; this is not a reconstructed whole-market roofprint or a verified entrance coordinate. No newly bound 28-storey tower, dome or rooftop billboard is claimed.'};
function blueskyFront(){
  const b=GEO.mapBuildings.find(b=>b.id===BLUESKY_CANOPY.sourceId);if(!b)throw Error('Missing Bluesky source');const p=Array.from({length:b.o.length/2},(_,i)=>({x:b.o[i*2],z:b.o[i*2+1]}));
  const area=p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.z-b.x*a.z},0);
  return p.map((a,i)=>{const b=p[(i+1)%p.length],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz),side=area>0?1:-1;return{x:(a.x+b.x)/2,z:(a.z+b.z)/2,tx:dx/L,tz:dz/L,nx:side*dz/L,nz:-side*dx/L,L,facing:Math.atan2(side*dz/L,-side*dx/L),ry:-Math.atan2(dz,dx)}}).sort((a,b)=>b.nz-a.nz)[0];
}
const rect=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d]];
function blueskyCanopyPlan(){
  const c=BLUESKY_CANOPY,circle=Array.from({length:64},(_,i)=>[c.radius*Math.cos(i/64*Math.PI*2),c.radius*Math.sin(i/64*Math.PI*2)]);
  return{outer:rect(-c.halfWidth,-c.halfDepth,c.halfWidth,c.halfDepth),holes:[circle,...[-92,-71,-50,-29,29,50,71,92].map(u=>rect(u-4.5,-2.4,u+4.5,2.4))]};
}
function blueskyWorld(u,v,y=BLUESKY_CANOPY.base){const e=blueskyFront();return{x:e.x+e.tx*u+e.nx*(BLUESKY_CANOPY.offset+v),y,z:e.z+e.tz*u+e.nz*(BLUESKY_CANOPY.offset+v)};}
function blueskyPosts(){return[-98,-70,-42,-14,14,42,70,98].map(u=>blueskyWorld(u,0,.25));}
export {BLUESKY_CANOPY,blueskyFront,blueskyCanopyPlan,blueskyWorld,blueskyPosts};
