// Individually identified street buildings, separate from the landmark roster.
// A photograph establishes appearance; dimensions, camera orientation and dates
// remain explicit rather than being promoted into surveyed measurements.
const BUILDING_PHOTO_REFERENCES = [{
  id: 'vienna', name: '维也纳商业广场', aliases: ['维也纳购物中心'],
  sourceId: 'way/1321791079', sourceBuildingIndex: 3627,
  modeledFaces: ['east'], captureDate: null,
  access: {x: 507, z: 833, heading: 1.4612}, accessLabel: '前往广场路观察点',
  streetSection: {name: '广场路', minZ: 783, maxZ: 883, side: 'west'},
  note: '2020年拍卖原页引用的具名实拍，拍摄日未披露。仅细化临街立面：米金色板材、蓝玻璃、深色百叶、白底红字题名和首层商铺。朝向依据地块东临广场路及来源轮廓推定，照片相机位置未测定；保留来源14.8米估高。窗格、灯柱、步行带尺寸及数量均为展示估计，其他三面尚待实拍。观察点不是已核实的入口，历史商户未当作现租户。',
  photos: [{
    image: 'https://shcqpm.com/uploads/allimg/200521/6-2005211104580-L.jpg',
    page: 'https://shcqpm.com/sifayewupaimai/biaodezhanshi/2020/0521/507.html',
    caption: '维也纳商业广场具名外立面；2020年拍卖页引用，拍摄日期未知。原图333×222像素，细小构件无法逐一量测。',
    credit: '上海产权拍卖有限公司公开标的照片 / 原作者'
  }]
}, {
  id: 'tcmHospital', name: '沭阳县中医院', kind: 'hospital', aliases: ['沭阳中医院'],
  sourceId: 'way/1370836783', sourceBuildingIndex: 3558, relatedSiteIds: ['way/1367632166'],
  modeledFaces: ['south', 'west'], captureDate: null,
  displayHeight: 68.4, displayLevels: 19, totalHeightEstimate: 71, displayCategory: 'civic',
  associatedSources: [
    {sourceId:'way/1370836782',sourceBuildingIndex:3557,role:'west-podium',modeledFaces:['west'],displayCategory:'civic'},
    {sourceId:'way/1455053529',sourceBuildingIndex:3559,role:'east-wing',modeledFaces:['courtyard'],displayCategory:'civic'},
    {sourceId:'way/1455053530',sourceBuildingIndex:3560,role:'river-end',modeledFaces:['courtyard'],displayCategory:'civic'}
  ],
  access: {x: -1.75, z: 213, heading: -1.752}, accessLabel: '前往上海中路观察点',
  streetSection: {name:'上海中路',minZ:162,maxZ:280,side:'east'},
  note: '上海中路28号院区。参考具名航拍、街面实拍与卫星图核对：病房塔楼、西侧U形裙房和东侧两楼分别建模；北面“中医大厦”另列。塔楼主体68.4米=19层×3.6米，冠部最高约71米，均为展示估计；原始25.9米估高另行保留，未写成实测。其他三栋保留来源高度。照片及卫星拍摄日未知，旧照片中的等级和合作医院文字未作为当前标识。入口形体、窗格、夜间亮灯、候车棚和铺装落位为估计；模型门洞仅作外观表达，未更改院区通行路线。',
  photos: [
    {image:'https://p3-sdbk2-media.byteimg.com/tos-cn-i-xv4ileqgde/fdd86f7639974f6da10d1cebd86d9669~tplv-xv4ileqgde-resize-w%3A1440.image',
      page:'https://m.baike.com/wikiid/8917680364442827932',caption:'沭阳县中医院街面实拍：浅青玻璃裙房、入口框架与候车棚；拍摄日未知，等级标牌反映历史时点。',credit:'快懂百科收录 / 原作者'},
    {image:'https://img.uborn.net/city/2023/11-25/05ea8ab61986043ee6f6.png',page:'https://www.uborn.net/xiuqian/hospital',
      caption:'医院具名航拍：塔楼、U形裙房、院落和东翼的相对关系；目录路径含2023年，不能当作拍摄日期。',credit:'优宝目录收录 / 原作者'}
  ]
}];

const BUILDING_PHOTO_BY_SOURCE = new Map(BUILDING_PHOTO_REFERENCES.map(r => [r.sourceId, r]));
function reviewedSourceBindings() {
  return BUILDING_PHOTO_REFERENCES.flatMap(r => [
    {...r,reviewId:r.id},
    ...(r.associatedSources||[]).map(s => ({...s,reviewId:r.id,associated:true}))
  ]);
}
function applyPhotoBuildingEstimate(record, review) {
  if (!review || (!review.displayHeight && !review.displayCategory)) return record;
  return {...record, sourceRecord:record.sourceRecord||record,
    height:review.displayHeight??record.height, levels:review.displayLevels??record.levels,
    category:review.displayCategory??record.category, originalSourceHeight:record.height, photoReviewId:review.reviewId};
}
function buildingObservationPoint(review, roads) {
  const a = review.access;
  if (!a || !review.streetSection) return null;
  let best = null;
  for (const r of roads.filter(r => r.name === review.streetSection.name && !r.bridge)) {
    for (let i = 1; i < r.pts.length; i++) {
      const p = r.pts[i - 1], q = r.pts[i], dx = q.x - p.x, dz = q.z - p.z;
      const t = Math.max(0, Math.min(1, ((a.x - p.x) * dx + (a.z - p.z) * dz) / (dx * dx + dz * dz || 1)));
      const x = p.x + t * dx, z = p.z + t * dz, distance = Math.hypot(x - a.x, z - a.z);
      if (!best || distance < best.distance) best = {x, z, distance, heading: Math.atan2(a.x - x, a.z - z)};
    }
  }
  return best;
}
export {BUILDING_PHOTO_REFERENCES, BUILDING_PHOTO_BY_SOURCE, buildingObservationPoint, reviewedSourceBindings, applyPhotoBuildingEstimate};
