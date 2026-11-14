import {GEO} from './shuyang-geodata.js';

const CENTRAL_PLAZA={podiumId:'way/1086134482',podiumIndex:2793,towerId:'way/1455053540',towerIndex:2795,
  podiumHeight:26.9,towerHeight:147.15,sourceTowerHeight:150,base:.22,levels:42,refugeFloors:[14,29],
  firePage:'https://js.119.gov.cn/202304/jsxfww-menu-gzdt_c_08d79c5f7b964a8985bf.html',publicationDate:'2023-04-20',captureDate:null,
  entrancePage:'https://www.yangtse.com/news/jiangsu/202508/t20250830_257238.html',entrancePublicationDate:'2025-08-30',
  limits:'147.15 m and floors 14/29 are reported by the fire service. Uniform storey spacing, window modules, recess depth, facade orientation and entrance placement are display estimates. Photographs do not show the complete tower roof; the roof is kept simple within the reported height, without the previously unsupported extra crown/mast. Source geometry and the 150 m OSM height are retained. Other podium facades remain generic.'};
function centralRecord(id){const b=GEO.mapBuildings.find(b=>b.id===id);if(!b)throw Error('Missing central plaza source '+id);return b;}
function centralEdges(id){
  const p=centralRecord(id).o,ring=Array.from({length:p.length/2},(_,i)=>({x:p[i*2],z:p[i*2+1]}));
  const area=ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a.x*b.z-b.x*a.z},0);
  return ring.map((a,i)=>{const b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz),side=area>0?1:-1;
    return {a,b,L,tx:dx/L,tz:dz/L,nx:side*dz/L,nz:-side*dx/L,facing:Math.atan2(side*dz/L,-side*dx/L)};});
}
function centralFacePoint(e,u,y,offset=0){return{x:e.a.x+(e.b.x-e.a.x)*u+e.nx*offset,y,z:e.a.z+(e.b.z-e.a.z)*u+e.nz*offset};}
function centralTowerWindows(){
  const windows=[],h=CENTRAL_PLAZA.towerHeight/CENTRAL_PLAZA.levels;
  for(const [edge,e] of centralEdges(CENTRAL_PLAZA.towerId).entries()){
    const count=Math.max(2,Math.round(e.L/2.75)),bay=e.L/count;
    for(let floor=1;floor<=CENTRAL_PLAZA.levels;floor++){
      const refuge=CENTRAL_PLAZA.refugeFloors.includes(floor),bottom=CENTRAL_PLAZA.base+(floor-1)*h+.48,top=CENTRAL_PLAZA.base+floor*h-.45;
      for(let i=0;i<count;i++)windows.push({edge,floor,bay:i,refuge,bottom,top,u0:(i+.12)/count,u1:(i+.88)/count,width:bay*.76,tone:(i+floor+edge)%3});
    }
  }return windows;
}
function centralEntranceEdge(){
  // A concave inner-street edge also points north. Facing direction alone
  // selects that hidden edge; the People Road frontage is on the north outer
  // chain, so compare its actual position after filtering north-facing edges.
  return centralEdges(CENTRAL_PLAZA.podiumId).filter(e=>e.L>50&&e.nz<-.75)
    .sort((a,b)=>(a.a.z+a.b.z)-(b.a.z+b.b.z))[0];
}
export {CENTRAL_PLAZA,centralRecord,centralEdges,centralFacePoint,centralTowerWindows,centralEntranceEdge};
