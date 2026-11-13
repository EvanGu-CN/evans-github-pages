"""Associate public AMap residential POIs by name AND mapped boundary proximity.

This produces candidates, not visually reviewed gates or surveyed coordinates.
No API credentials are read by this offline step.
"""
import json,re,runpy
from pathlib import Path
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'tools/data/shuyang'
frame=runpy.run_path(str(Path(__file__).with_name('enrich-shuyang-buildings.py')))
inverse=runpy.run_path(str(Path(__file__).with_name('china-coordinates.py')))['gcj02_to_wgs84']

def canonical(name):
    name=re.sub(r'[\s·・（）()\-—]','',name)
    name=re.sub(r'^(沭阳县|沭阳|宿迁市|宿迁)','',name)
    return re.sub(r'小区$','',name)

def main():
    urban=json.loads((DATA/'urban-context.json').read_bytes())
    queries={q['query']:q for q in json.loads((DATA/'landmark-amap-observations.json').read_bytes())['queries']}
    review_file=DATA/'community-amap-photo-review.json'
    reviews=json.loads(review_file.read_bytes()) if review_file.exists() else {}
    reviewed={r['image']:r for r in reviews.get('reviewed',[])}
    rejected={r['image'] for r in reviews.get('rejected',[])}
    records=[]
    for n in urban['neighborhoods']:
        shape=unary_union([Polygon(list(zip(p['outer'][::2],p['outer'][1::2])),
            [list(zip(h[::2],h[1::2])) for h in p['holes']]) for p in n['polygons']])
        q=queries.get('沭阳'+n['name'],{});matches=[]
        for p in q.get('pois',[]):
            if canonical(n['name'])!=canonical(p['name']):continue
            if '住宅区' not in p.get('type',''):continue
            if p.get('district')!='沭阳县' or not p.get('location'):continue
            lon,lat=inverse(p['location']['lng'],p['location']['lat'])
            x,z=(lon-frame['LON'])*frame['KX'],-(lat-frame['LAT'])*frame['KY']
            distance=shape.distance(Point(x,z))
            if distance>80:continue
            photos=[]
            for photo in p.get('photos',[]):
                url=photo.get('url','').replace('http://','https://',1)
                if not url.startswith('https://'):continue
                if url in rejected:continue
                photos.append({'image':url,'page':'https://www.amap.com/place/'+p['id'],
                    'caption':reviewed.get(url,{}).get('caption','高德地点关联图片，尚未逐张核对门头及建筑身份；拍摄日期未知。'),
                    'credit':'高德地图地点照片 / 原作者','reviewStatus':'reviewed-reference' if url in reviewed else 'unreviewed'})
            matches.append({'poiId':p['id'],'name':p['name'],'address':p.get('address',''),
                'x':round(x,1),'z':round(z,1),'distanceOutsideBoundaryM':round(distance,1),
                'coordinateNote':'GCJ-02转WGS84近似坐标，仅核对地点；不是实测入口',
                'queriedAt':q.get('queriedAt'),'photos':photos})
        records.append({'id':n['id'],'name':n['name'],'queryStatus':q.get('status','not-queried'),
            'matches':sorted(matches,key=lambda p:p['distanceOutsideBoundaryM'])})
    audit={'communities':len(records),'queriedSuccessfully':sum(r['queryStatus']=='complete' for r in records),
        'nameAndPositionMatched':sum(bool(r['matches']) for r in records),
        'withCandidatePhotos':sum(any(m['photos'] for m in r['matches']) for r in records),
        'candidatePhotos':sum(len(m['photos']) for r in records for m in r['matches']),
        'visuallyReviewedByThisStep':0,'manualEntranceReferences':len(reviewed),'rejectedMismatchedPhotos':len(rejected)}
    output={'provider':'高德地图公开地点资料','matchingRule':'名称规范化一致 + 住宅区类型 + 沭阳县 + 距来源小区范围不超过80米',
        'audit':audit,'communities':records}
    (DATA/'amap-community-context.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(audit))

if __name__=='__main__':main()
