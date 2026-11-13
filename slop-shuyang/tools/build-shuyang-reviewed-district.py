"""Convert individually observed roof runs, retaining image dates and uncertainty.

No lot subdivision or random building generation. Every roof run is a manually
reviewed observation in wuyue-roof-traces.json; existing source wins overlaps.
"""
import hashlib,json,math,runpy
from pathlib import Path
from shapely.geometry import Polygon,mapping

ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'tools/data/shuyang'
frame=runpy.run_path(str(Path(__file__).with_name('enrich-shuyang-buildings.py')))

def main():
    inp=DATA/'wuyue-roof-traces.json';data=json.loads(inp.read_bytes());ref=data['reference']
    x0,y0,x1,y1=ref['extent3857'];width,height=ref['imageSize']
    def wgs(p):
        x=x0+p[0]/width*(x1-x0);y=y1-p[1]/height*(y1-y0)
        return [math.degrees(x/6378137),math.degrees(2*math.atan(math.exp(y/6378137))-math.pi/2)]
    def world(p):
        lon,lat=wgs(p);return [(lon-frame['LON'])*frame['KX'],-(lat-frame['LAT'])*frame['KY']]
    features=[]
    for group in data['groups']:
        observations=[]
        for i,(ax,ay,bx,by,depth) in enumerate(group.get('runs',[])):
            length=math.hypot(bx-ax,by-ay);nx=-(by-ay)/length*depth;ny=(bx-ax)/length*depth
            pixels=[[ax,ay],[bx,by],[bx+nx,by+ny],[ax+nx,ay+ny]]
            observations.append((f'{i+1:03d}',pixels,'manually-reviewed-roof-run'))
        for outline in group.get('outlines',[]):
            observations.append((outline['id'],outline['pixels'],'manually-reviewed-roof-outline'))
        for ident,pixels,method in observations:
            g=Polygon([wgs(p) for p in pixels]);assert g.is_valid
            features.append({'type':'Feature','geometry':mapping(g),'properties':{
                'id':f"reviewed/wuyue/{group['id']}/{ident}",'communityContext':group['neighborhood'],
                'building':'apartments','height':group['heightEstimate'],'heightSource':'estimate',
                'levelsEstimate':group['levelsEstimate'],'roof:shape':group['roofShape'],'roof:height':group['roofHeightEstimate'],
                'referenceImageDate':ref['imageAcquired'],'geometrySource':method,
                'geometryAccuracyNote':'Approximate observed roofprint; roof lean and source accuracy limit ground alignment.',
                'referencePixels':pixels,'heightNote':group.get('heightNote','Conservative photo-typology/display estimate, not a measured height or official floor count.')}})
    runpy.run_path(str(Path(__file__).with_name('build-shuyang-online-district.py')))['main']()
    online=json.loads((DATA/'online-reviewed-buildings.geojson').read_bytes())
    features.extend(online['features'])
    online_refs=[online['reference'],*online.get('additionalReferences',[])]
    output={'type':'FeatureCollection','reference':ref,'additionalReferences':online_refs,
        'traceSha256':hashlib.sha256(inp.read_bytes()+(DATA/'online-district-traces.json').read_bytes()).hexdigest(),'features':features}
    (DATA/'reviewed-buildings.geojson').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    contexts=[]
    for n in data['neighborhoods']:
        points=[world(p) for p in n['pixels']];g=Polygon(points);q=g.representative_point()
        contexts.append({'id':n['id'],'name':n['name'],'source':'ReviewedImagery','scope':'approximate-context',
            'boundarySource':'User map labels + dated imagery street-block approximation, not an official estate boundary',
            'referenceImageDate':ref['imageAcquired'],'x':round(q.x,1),'z':round(q.y,1),
            'polygons':[{'outer':[round(v,1) for p in points for v in p],'holes':[]}],
            'photoTypology':n['photoTypology']})
    contexts.extend(json.loads((DATA/'online-reviewed-context.json').read_bytes())['neighborhoods'])
    (DATA/'reviewed-district-context.json').write_text(json.dumps({'reference':ref,'additionalReferences':online_refs,'neighborhoods':contexts},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    surfaces=[]
    for s in data.get('surfaces',[]):
        rings=[[world(p) for p in r] for r in s['rings']]
        curved=s['kind'] in ('running-track','infield') or s['id'].endswith('/infield-apron')
        if curved:
            # The photograph shows smooth track curves. Round the reviewed
            # samples consistently on both sides of shared rings; keep the raw
            # source pixels above, and never turn court rectangles into curves.
            for _ in range(2):
                rings=[[[a[0]*t+b[0]*(1-t),a[1]*t+b[1]*(1-t)]
                        for a,b in zip(r,r[1:]+r[:1]) for t in (.75,.25)] for r in rings]
        g=Polygon(rings[0],rings[1:]);assert g.is_valid, s['id']
        surfaces.append({k:s[k] for k in ('id','kind','name','sourceSiteId')}|{'rings':rings,
            'geometryMethod':'reviewed-pixel-boundary; 2-pass corner rounding of observed curved edges' if curved else 'reviewed-pixel-boundary'})
    surfaces.extend(json.loads((DATA/'online-reviewed-surfaces.json').read_bytes())['surfaces'])
    (DATA/'reviewed-district-surfaces.json').write_text(json.dumps({'reference':ref,'additionalReferences':online_refs,'reviewNote':data.get('surfaceReview',''),
        'surfaces':surfaces},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    print(json.dumps({'observedRoofCandidates':len(features),'reviewedSurfaces':len(surfaces),'approximateNamedContexts':len(contexts),'imageAcquired':ref['imageAcquired']}))

if __name__=='__main__':main()
