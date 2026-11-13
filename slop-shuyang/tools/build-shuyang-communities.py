"""Mapped community access crossings. Photos guide form, not survey coordinates."""
import json,runpy,math
from pathlib import Path
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'tools/data/shuyang'
h=runpy.run_path(str(Path(__file__).with_name('enrich-shuyang-buildings.py')))

PHOTOS={
 '幸福家园':{'model':'referenceOnly','referenceOnly':True,'street':'台州南路','credit':'高德地图地点照片 / 原作者','image':'https://store.is.autonavi.com/showpic/056a0e08bde2ff1c405df868902b7b7e','page':'https://www.amap.com/place/B020F0IH5Y','caption':'台州南路94号幸福家园具名入口；主区与较小1期近似范围分别保留，具体门址尚未绑定。'},
 '君临天下':{'model':'referenceOnly','referenceOnly':True,'street':'永安路','credit':'高德地图地点照片 / 原作者','image':'https://store.is.autonavi.com/showpic/55672d28a3100437d9501a88','page':'https://www.amap.com/place/B020F158TN','caption':'可读君临天下景石与白墙浅红竖带住宅实拍；用于身份和多层住宅配色参考，具体门址未定位，不套用到北侧较高楼群。'},
 '华辰大厦小区':{'model':'referenceOnly','referenceOnly':True,'street':'永安路','credit':'高德地图地点照片 / 原作者','image':'https://store.is.autonavi.com/showpic/6ca5b3d3778acf7cba0f438c3d19013d','page':'https://www.amap.com/place/B0FFGA227J','caption':'具名华辰大厦门楼实拍；与幸福家园分开标注，门址尚未绑定。沿街四个高层体块另参照卫星和运动场实拍近似重建；78米及西侧8米低连接部均为展示估计，非实测。'},
 '幸福家园1期':{'model':'referenceOnly','referenceOnly':True,'street':'台州南路','credit':'高德地图地点照片 / 原作者','image':'https://store.is.autonavi.com/showpic/056a0e08bde2ff1c405df868902b7b7e','page':'https://www.amap.com/place/B020F0IH5Y','caption':'台州南路94号幸福家园具名入口实拍，用于身份参考；不是已定位的1期门址，不将高墟镇同名小区照片混入。'},
 '凤凰国际城':{'model':'phoenix','street':'苏州西路','image':'https://pic3.ajkimg.com/wuba/f2d80eed8dfecbe631f76f0c2f3c781b/400x300.jpg','page':'https://mfang.58.com/shuyang/xinfang/xq100677117/huxingtu/'},
 '城市枫林西区':{'model':'maple','street':'沈阳路','image':'https://pic3.ajkimg.com/wuba/802c32dd0f9aa51c7d87adcfedc469b5/400x300.jpg','page':'https://mfang.58.com/shuyang/xinfang/xq100677101/huxingtu/'},
 '东方名都':{'model':'east','street':'迎宾大道','image':'https://pic3.ajkimg.com/wuba/4ead291b878d58a76680d947214320a6/400x300.jpg','page':'https://mfang.58.com/shuyang/xinfang/xq100677111/huxingtu/'},
 '巴黎新城':{'model':'parisStone','street':'迎宾大道','image':'https://pic3.ajkimg.com/wuba/5030a449020e814ad80afd3c97b6b687/400x300.jpg','page':'https://mfang.58.com/shuyang/xinfang/xq100677094/huxingtu/'},
 '盛源金城':{'model':'referenceOnly','referenceOnly':True,'street':'金禾路','image':'https://pic3.ajkimg.com/wuba/67ac210376a7bedc409b357195e739fa/400x300.jpg','page':'https://mfang.58.com/shuyang/xinfang/xq100677175/huxingtu/','caption':'具名“盛源金城”景石与后方多层住宅实拍；门址未定位。'},
 '临安小区':{'model':'referenceOnly','referenceOnly':True,'street':'金禾路','image':'https://pic3.ajkimg.com/wuba/9a47ad89ee7e3f1ea250127c8c49ee46/400x300.jpg','page':'https://mfang.58.com/shuyang/xinfang/xq100677160/huxingtu/','caption':'可读“临安小区6号楼”的楼牌实拍，用于核对小区身份；不是已定位的入口照片。'},
 '嘉瑞·玫瑰园':{'model':'referenceOnly','referenceOnly':True,'street':'临安东路','credit':'高德地图地点照片 / 原作者',
  'image':'https://aos-comment.amap.com/B0FFFQ5N1J/comment/f275c406-61bb-488e-98eb-fd6f802fa3c3.png',
  'page':'https://www.amap.com/place/B0FFFQ5N1J',
  'caption':'可辨“嘉瑞·玫瑰园”题名、27号门牌、浅色横梁与X形装饰、中央岗亭和两侧通道。门址未独立定位；两侧住宅只见局部，不据此统一全小区层数。'}
}

def points(g):
 if g.geom_type=='Point':return [g]
 return [p for c in getattr(g,'geoms',[]) for p in points(c)]

def main():
 for photo in json.loads((DATA/'corridor-photo-references.json').read_bytes()):
  PHOTOS[photo['community']]={'credit':'高德地图地点照片 / 原作者',**{k:v for k,v in photo.items() if k!='community'}}
 urban=json.loads((DATA/'urban-context.json').read_bytes())
 amap_file=DATA/'amap-community-context.json'
 amap={r['id']:r for r in json.loads(amap_file.read_bytes())['communities']} if amap_file.exists() else {}
 review_file=DATA/'community-amap-photo-review.json'
 if review_file.exists():
  streets={'紫藤花园':'北京北路','东方明珠城':'迎宾大道','宁浦·冠城':'沭师路'}
  for r in json.loads(review_file.read_bytes())['reviewed']:
   community=next((c for c in amap.values() if c['name']==r['community']),None)
   photo=next((p for m in (community or {}).get('matches',[]) for p in m['photos'] if p['image']==r['image']),None)
   if photo and r['community'] in streets:PHOTOS[r['community']]={**r,'street':streets[r['community']],'page':photo['page']}
 raw=json.loads((DATA/'osm_roads.json').read_bytes())
 roads=[]
 for e in raw['elements']:
  t=e.get('tags',{});xy=[(p['lon'],p['lat']) for p in e.get('geometry',[])]
  if len(xy)>1:roads.append((e,t,h['world'](LineString(xy))))
 records=[];all_access=0
 for n in urban['neighborhoods']:
  shape=unary_union([Polygon(list(zip(p['outer'][::2],p['outer'][1::2])),[list(zip(r[::2],r[1::2])) for r in p['holes']]) for p in n['polygons']])
  crossings=[]
  for e,t,line in roads:
   if t.get('highway') not in ('service','living_street','footway','path','pedestrian'):continue
   if not line.intersects(shape) or line.intersection(shape).length<15:continue
   for p in points(line.intersection(shape.boundary)):
    d=line.project(p);a=line.interpolate(max(0,d-4));b=line.interpolate(min(line.length,d+4))
    ia,ib=shape.contains(a),shape.contains(b)
    if ia==ib:continue
    outside=a if not ia else b;inside=b if not ia else a
    dx,dz=outside.x-inside.x,outside.y-inside.y;length=math.hypot(dx,dz)
    if length<1:continue
    photo=PHOTOS.get(n['name']);street_distance=9999
    if photo:
     street_distance=min([line2.distance(p) for _,t2,line2 in roads if t2.get('name')==photo['street']] or [9999])
    crossings.append({'x':round(p.x,1),'z':round(p.y,1),'heading':round(math.atan2(dx,dz),5),'width':h['number'](t.get('width')) or (6 if t['highway'] in ('service','living_street') else 2.5),
      'roadId':f"way/{e['id']}",'accessKind':t['highway'],'streetDistance':round(street_distance,1)})
  # Nearby duplicates belong to the same mapped access. Do not invent access for empty estates.
  unique=[]
  for p in crossings:
   if not any(math.hypot(p['x']-q['x'],p['z']-q['z'])<12 for q in unique):unique.append(p)
  all_access+=len(unique)
  photo=PHOTOS.get(n['name']);usable=sorted([p for p in unique if p['width']>=4 and p['streetDistance']<110],key=lambda p:p['streetDistance'])
  record={'id':n['id'],'name':n['name'],'buildingCount':len(n['buildings']),'access':unique,
    'photoStatus':'reviewed' if photo else 'not-yet-reviewed'}
  if n.get('boundarySource'):record['boundarySource']=n['boundarySource']
  if n['id'] in amap:record['mapContext']=amap[n['id']]
  if photo:
   record['photo']={'date':'未注明','credit':'58 / 安居客原图作者',**photo,'placementNote':
    '仅作身份与外观参考，尚未定位门址，不生成门楼。' if photo.get('referenceOnly') else
    '门型参考实拍；门址近似设于来源服务道路与小区边界交点，照片与该门点未独立绑定。'}
   if usable and not photo.get('referenceOnly'):record['gate']={**usable[0],'placementSource':'mapped-service-road/boundary intersection, approximate photo association'}
  records.append(record)
 output={'communities':records,'audit':{'communities':len(records),'mappedAccessCrossings':all_access,'withMappedAccess':sum(bool(r['access']) for r in records),'reviewedPhotos':len(PHOTOS),'placedPhotoReferences':sum('gate' in r for r in records)}}
 output['audit']['withMapPhotoCandidates']=sum(any(m['photos'] for m in r.get('mapContext',{}).get('matches',[])) for r in records)
 (DATA/'community-detail-audit.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 (ROOT/'js/community-data.js').write_text('// Generated by tools/build-shuyang-communities.py; no credentials.\nexport const COMMUNITY_DETAILS = '+json.dumps(output,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8',newline='\n')
 print(json.dumps(output['audit']));print(json.dumps([{k:r[k] for k in ('name','access','gate') if k in r} for r in records if r.get('photo')],ensure_ascii=False))

if __name__=='__main__':main()
