"""Convert native map observations through GCJ-02; never date them as 2026 imagery."""
import json, math, runpy
from pathlib import Path
from shapely.geometry import Polygon, LineString, mapping, box

DATA=Path(__file__).resolve().parent/'data/shuyang'
frame=runpy.run_path(str(Path(__file__).with_name('enrich-shuyang-buildings.py')))
inverse=runpy.run_path(str(Path(__file__).with_name('china-coordinates.py')))['gcj02_to_wgs84']

def projection(ref):
    (west,south),(east,north)=ref['bounds']['southWest'],ref['bounds']['northEast']
    width,height=ref['size'];ox,oy=ref['mapOffset']
    merc=lambda lat:math.log(math.tan(math.pi/4+math.radians(lat)/2))
    def wgs(p):
        lon=west+(p[0]-ox)/width*(east-west)
        my=merc(north)+(p[1]-oy)/height*(merc(south)-merc(north))
        return inverse(lon,math.degrees(2*math.atan(math.exp(my))-math.pi/2))
    def world(p):
        lon,lat=wgs(p);return [(lon-frame['LON'])*frame['KX'],-(lat-frame['LAT'])*frame['KY']]
    return wgs,world

def main():
    data=json.loads((DATA/'online-district-traces.json').read_bytes());ref=data['reference']
    refs={r['id']:r for r in [ref,*data.get('additionalReferences',[])]}
    wgs,world=projection(ref)
    features=[]
    for b in data['buildings']:
        br=refs[b.get('referenceId',ref['id'])];convert,_=projection(br)
        g=Polygon([convert(p) for p in b['pixels']]);assert g.is_valid,b['id']
        features.append({'type':'Feature','geometry':mapping(g),'properties':{
            'id':'reviewed/online/'+b['id'],'name':b['name'],'building':b['building'],
            'communityContext':b['communityContext'],'height':b['heightEstimate'],'heightNote':b['heightNote'],
            **({'labelScope':'building-unit'} if b['name'].endswith('号楼') else {}),
            'roof:shape':b['roofShape'],'roof:height':b['roofHeightEstimate'],'levelsEstimate':0,
            'geometrySource':'manually-reviewed-map-outline','geometryAccuracyNote':br['limitations'],
            'referenceImageDate':None,'referenceId':br['id'],'referenceRetrievedAt':br['queriedAt'],
            **({'reviewedReplacesSourceIds':b['reviewedReplacesSourceIds']} if b.get('reviewedReplacesSourceIds') else {}),
            'referencePixels':b['pixels']}})
    contexts=[]
    for n in data['neighborhoods']:
        nr=refs[n.get('referenceId',ref['id'])];_,convert=projection(nr)
        ps=[convert(p) for p in n['pixels']];q=Polygon(ps).representative_point()
        contexts.append({k:n[k] for k in ('id','name','photoTypology')}|{
            'source':'ReviewedImagery','scope':'approximate-context','referenceId':nr['id'],
            'boundarySource':'AMap named POIs + manually reviewed visible block context, not an official estate boundary; limited to observed view',
            'referenceImageDate':None,'referenceRetrievedAt':nr['queriedAt'],'x':round(q.x,1),'z':round(q.y,1),
            'polygons':[{'outer':[round(v,1) for p in ps for v in p],'holes':[]}]})
    (DATA/'online-reviewed-buildings.geojson').write_text(json.dumps({'type':'FeatureCollection','reference':ref,'additionalReferences':data.get('additionalReferences',[]),'features':features},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    a,b,c,d=[world(p) for p in data['workersPalaceRoofPanelPixels']]
    dx,dz=b[0]-a[0],b[1]-a[1];w=math.hypot(dx,dz)
    panel={'x':sum(p[0] for p in [a,b,c,d])/4,'z':sum(p[1] for p in [a,b,c,d])/4,
        'w':w,'d':math.dist(b,c),'tx':dx/w,'tz':dz/w}
    surfaces=[]
    for s in data.get('surfaces',[]):
        sr=refs[s.get('referenceId',ref['id'])];_,convert=projection(sr)
        surfaces.append({k:s[k] for k in ('id','kind','name','sourceSiteId','appearanceSource')}|{
            **({'replacesSourceSurfaceIds':s['replacesSourceSurfaceIds']} if s.get('replacesSourceSurfaceIds') else {}),
            'rings':[[convert(p) for p in ring] for ring in s['rings']],
            'imageAcquired':None,'referenceRetrievedAt':sr['queriedAt'],'referenceId':sr['id'],
            'geometryMethod':'reviewed-native-satellite-pixel-boundary; GCJ-02 inverted to WGS84'})
    for path in data.get('paths',[]):
        pr=refs[path['referenceId']];_,convert=projection(pr)
        g=LineString([convert(p) for p in path['pixels']]).buffer(path['widthEstimate']/2,cap_style='flat',join_style='round')
        surfaces.append({k:path[k] for k in ('id','name','sourceSiteId','appearanceSource')}|{
            'kind':'community-path','rings':[list(g.exterior.coords)[:-1]],'imageAcquired':None,
            'referenceRetrievedAt':pr['queriedAt'],'referenceId':pr['id'],'widthEstimate':path['widthEstimate'],
            'geometryMethod':'reviewed-visible-route-centreline; estimated width; GCJ-02 inverted to WGS84'})
    (DATA/'online-reviewed-surfaces.json').write_text(json.dumps({'reference':ref,'additionalReferences':data.get('additionalReferences',[]),'surfaces':surfaces},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    western=data.get('huachenWesternTowers');tower_model=None
    if western:
        source=next(b for b in data['buildings'] if 'reviewed/online/'+b['id']==western['sourceTraceId'])
        _,convert=projection(refs[western['referenceId']]);pixel_shape=Polygon(source['pixels'])
        tower_model={k:western[k] for k in ('sourceTraceId','heightEstimate','baseHeightEstimate','method')}
        tower_model['parts']=[]
        for part in western['parts']:
            clipped=pixel_shape.intersection(box(*part['clipPixels']))
            assert clipped.geom_type=='Polygon' and clipped.area>100
            tower_model['parts'].append({'name':part['name'],'outer':[convert(p) for p in list(clipped.exterior.coords)[:-1]]})
    campus=data.get('mengxiCampus')
    if campus:
        _,convert=projection(refs[campus['referenceId']])
        output={k:v for k,v in campus.items() if k not in ('pixels','gatePixels')}
        output.update(boundary=[convert(p) for p in campus['pixels']],gate=convert(campus['gatePixels']))
        (DATA/'reviewed-mengxi-campus.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (DATA/'online-reviewed-context.json').write_text(json.dumps({'reference':ref,'additionalReferences':data.get('additionalReferences',[]),
        'neighborhoods':contexts,'workersPalaceRoofPanel':panel,'huachenWesternTowers':tower_model},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'onlineCandidates':len(features),'onlineContexts':len(contexts),'imageAcquired':None}))

if __name__=='__main__':main()
