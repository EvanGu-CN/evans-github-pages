// Dimensions from the contractor's 2022-09-28 standard section, corroborated
// by post-opening photographs. A standard section is not an as-built survey of
// every junction. World bounds follow the existing mapped terminal crossings.
const TAIZHOU_ROAD_REVIEW={
  id:'taizhou2022',name:'台州路（珠海路—杭州路）',
  mainNames:['台州北路','台州南路'],minZ:331.7,maxZ:3671.2,
  carriageway:21.5,lanes:6,laneCenters:[1.875,5.25,8.75],
  sideSeparator:4,cycleway:4.5,landscape:20.75,footway:2.5,
  publicationDate:'2022-09-28',captureDate:null,
  sourcePage:'https://www.sdhtjsjt.cn/index.php?c=show&id=1685',
  note:'2022年通车报道与施工单位标准断面交叉核对。机动车道21.5米、双向六车道，两侧各4米侧分带、4.5米非机动车道及20.75米景观长廊。模型按既有道路中心线表达标准路段；路口转向车道、局部中分带、设施数量和绿化落位仍为展示估计，未按逐段竣工测绘还原。照片拍摄日未披露，不当作2026年现状。',
  photos:[{
    image:'https://x0.ifengimg.com/ucms/2022_49/2E9EDEEF7A63534A42973447285DEEB71745EFD9_size336_w553_h312.png',
    page:'https://js.ifeng.com/c/8LOC9MJLdA5',
    caption:'2022年12月报道所引台州路改造后实景：六车道、道路两侧绿化与步行空间；具体拍摄日未披露。',
    credit:'沭阳发布 / 凤凰网转载 / 原作者'
  }]
};
const RENMIN_JUNCTION_REFERENCE={
  id:'renmin2022',name:'人民中路×上海中路（历史街景）',sourceWayIds:['way/121226962'],
  publicationDate:'2022-02-15',captureDate:null,reviewedAt:'2026-11-15',status:'historical-junction-reference',
  scope:'Intersection context only; no road width, lanes, signal phases, fencing or pavement geometry is changed from these historical photographs.',
  note:'速新闻2022年2月15日图文中的核心商圈路口全景与人民中路路名牌实拍。拍摄日未披露，不当作2026现状；全景有广角畸变，未据此量取路宽。仅登记人民中路与上海中路路口附近的历史参考，整条路、各路口车道和人行道仍待逐段核实；路名牌近景背后商铺暂未逐栋绑定。',
  photos:[
    {image:'https://p1.itc.cn/q_70/images03/20220215/92b2d3e48d0f4622acd9a30073334173.jpeg',page:'https://www.sohu.com/a/523006934_412025',caption:'人民路核心商圈路口全景：中央商场及周边楼群、路口与沿街空间；2022年发表，拍摄日未知，广角图不作尺寸量测。',credit:'速新闻 / 原作者'},
    {image:'https://p5.itc.cn/q_70/images03/20220215/d88f6204f8fd4ef8a95ddd1b11403c50.jpeg',page:'https://www.sohu.com/a/523006934_412025',caption:'人民中路路名牌与沿街白色百叶商业立面近景；2022年发表，商户反映历史时点，背后楼体尚未可靠绑定。',credit:'速新闻 / 原作者'}
  ]
};
const ROAD_PHOTO_REFERENCES=[TAIZHOU_ROAD_REVIEW,RENMIN_JUNCTION_REFERENCE];

function reviewRoadSections(road){
  const review=TAIZHOU_ROAD_REVIEW;
  if(!review.mainNames.includes(road.name)||road.bridge)return[road];
  const pts=[];for(let i=0;i<road.flat.length;i+=2)pts.push([road.flat[i],road.flat[i+1]]);
  const sections=[];
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],dz=b[1]-a[1],cuts=[0,1];
    if(Math.abs(dz)>1e-9)for(const z of [review.minZ,review.maxZ]){const t=(z-a[1])/dz;if(t>1e-8&&t<1-1e-8)cuts.push(t);}
    cuts.sort((a,b)=>a-b);
    for(let j=1;j<cuts.length;j++){
      const t0=cuts[j-1],t1=cuts[j],z=a[1]+dz*(t0+t1)/2;
      const inside=z>=review.minZ-1e-6&&z<=review.maxZ+1e-6;
      const point=t=>[a[0]+(b[0]-a[0])*t,a[1]+dz*t];
      let s=sections.at(-1);
      if(!s||s.inside!==inside){s={inside,pts:[point(t0)]};sections.push(s);}
      s.pts.push(point(t1));
    }
  }
  return sections.map(s=>({...road,flat:s.pts.flat(),...(s.inside?{
    w:review.carriageway,lanes:review.lanes,photoReviewId:review.id,
    originalWidth:road.w,originalLanes:road.lanes
  }:{})}));
}

function reviewedLaneCenters(link){
  const r=TAIZHOU_ROAD_REVIEW;
  if(r.mainNames.includes(link.name)&&link.dir===0&&link.lanes===6&&Math.abs(link.w-r.carriageway)<.01)return r.laneCenters.slice();
  return null;
}
export {TAIZHOU_ROAD_REVIEW,RENMIN_JUNCTION_REFERENCE,ROAD_PHOTO_REFERENCES,reviewRoadSections,reviewedLaneCenters};
