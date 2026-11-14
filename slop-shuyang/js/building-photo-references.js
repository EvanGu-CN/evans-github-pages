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
}];

const BUILDING_PHOTO_BY_SOURCE = new Map(BUILDING_PHOTO_REFERENCES.map(r => [r.sourceId, r]));
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
export {BUILDING_PHOTO_REFERENCES, BUILDING_PHOTO_BY_SOURCE, buildingObservationPoint};
