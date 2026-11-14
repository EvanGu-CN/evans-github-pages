"""Build credential-free landmark anchors and school context from reviewed sources."""
import gzip, json, runpy
from pathlib import Path
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT/'tools/data/shuyang'
h = runpy.run_path(str(Path(__file__).with_name('enrich-shuyang-buildings.py')))
gcj = runpy.run_path(str(Path(__file__).with_name('china-coordinates.py')))['gcj02_to_wgs84']


def main():
    buildings = json.loads(gzip.decompress((DATA/'buildings-enriched.json.gz').read_bytes()))['buildings']
    pois = [p for q in json.loads((DATA/'landmark-amap-observations.json').read_bytes())['queries'] for p in q['pois']]
    def point(ident):
        p = next(p for p in pois if p['id'] == ident)
        lon, lat = gcj(p['location']['lng'], p['location']['lat'])
        return {'x': round((lon-h['LON'])*h['KX'],1), 'z': round(-(lat-h['LAT'])*h['KY'],1),
                'positionSource': f'AMap {ident}; GCJ-02 inverse to WGS84 (approximate)'}
    sites = {}
    for name, ident, height in [('大润发','way/497798167',17),('吾悦广场','way/1372583929',24)]:
        b = next(b for b in buildings if b['id'] == ident)
        g = unary_union([Polygon(p['outer'],p['holes']) for p in b['polygons']]); x0,z0,x1,z1=g.bounds
        sites[name] = {'x':round(g.centroid.x,1),'z':round(g.centroid.y,1),'w':round(x1-x0+12,1),
                       'd':round(z1-z0+12,1),'h':height,'kind':'mall','sourceId':ident,
                       'sourceBuildingIndices':[i for i,r in enumerate(buildings) if r['id']==ident],
                       'positionSource':'OSM source footprint','heightSource':'photo-proportion estimate'}
    sites['大润发']['heightSource'] = 'source record CNBH-2020 raster median 17 m; facade proportions from 2009/2024 photos'
    sites['老服装厂城市休闲街区'] = {**point('B0M61HI0Y4'),'w':190,'d':140,'h':9,'kind':'heritage','arrive':100}
    sites['沭水之阳'] = {**point('B0L1VLAX76'),'w':38,'d':38,'h':30,'kind':'waterfront','arrive':85}
    # Campus entrances are actual mapped service-road intersections, not POI centres.
    e = next(e for e in json.loads((DATA/'osm_landmark_sites.json').read_bytes())['elements'] if e['id']==1027263212)
    campus = h['world'](h['osm_geometry'](e))
    road = next(r for r in json.loads((DATA/'osm_roads.json').read_bytes())['elements'] if r['id']==497324976)
    gate = campus.boundary.intersection(h['world'](LineString([(p['lon'],p['lat']) for p in road['geometry']])))
    indices=[]
    for i,b in enumerate(buildings):
        g=unary_union([Polygon(p['outer'],p['holes']) for p in b['polygons']])
        if g.intersects(campus) and g.intersection(campus).area/g.area>=.6:indices.append(i)
    sites['江苏省沭阳高级中学'] = {'x':round(gate.x,1),'z':round(gate.y,1),'w':64,'d':36,'h':20,
        'kind':'school','heading':-.63,'preserveSource':True,'arrive':92,'campusBuildingIndices':indices,
        'positionSource':'OSM campus way/1027263212 × service way/497324976','model':'highSchoolGate'}
    sites['沭阳文化中心'] = {'x':-2430,'z':4230,'w':360,'d':250,'h':28,'kind':'culture',
        'sourceBuildingIndices':[i for i,b in enumerate(buildings) if b['id'] in ('way/1321791112','way/1321791113','way/1321791114')]}
    # Historic 虞姬公园 is the 公园路19号/城北公园 site, distinct from the
    # ecological park by the government. Preserve its mapped landscape/buildings.
    park_element=next(e for e in json.loads((DATA/'osm_land.json').read_bytes())['elements'] if e['id']==1372587295)
    park=h['world'](h['osm_geometry'](park_element));pp=park.representative_point()
    sites['虞姬公园']={'x':round(pp.x,1),'z':round(pp.y,1),'w':350,'d':320,'h':28,'kind':'park',
        'model':'historicYujiPark','preserveSource':True,'preserveParkLandscape':True,'aliases':['城北公园'],
        'arrive':145,'front':{'x':0,'z':1},'positionSource':'OSM park way/1372587295; 公园路19号 cross-checked with public sources',
        'geometryNote':'Park position verified; monument/bridge interior anchors remain unlocated, so they are not guessed.'}
    lake=json.loads((DATA/'reviewed-water.json').read_bytes())
    sx,sz=lake['southArrival'];vx,vz=lake['lakeView']
    sites['南湖公园']={'x':sx,'z':sz,'w':60,'d':50,'h':8,'kind':'park','model':'nanhuPark',
        'preserveSource':True,'preserveParkLandscape':True,'arrive':25,'front':{'x':0,'z':1},
        'viewTarget':{'x':vx,'z':vz},'positionSource':'South entrance plaza observed in georeferenced 2021-12-10 imagery',
        'geometryNote':'Reviewed shoreline, islands, two plazas and four mapped footbridges; unlocated generic monuments removed.'}
    # Bind replacements to source IDs; a landmark reserve rectangle is not a
    # licence to delete neighbouring buildings or the rest of a shopping mall.
    for name,ids,extra in [
        ('中央城市广场',['way/1086134482','way/1455053540'],{'sourceId':'way/1086134482'}),
        ('蓝天国际商贸城',['way/1321791084'],{'sourceId':'way/1321791084'}),
        ('万达广场',['way/1321791097'],{'sourceId':'way/1321791097'}),
        ('沭阳站',['way/995943344'],{}),
        ('吴印咸故居',['way/1456635010'],{}),
        ('沭阳县政府',['way/1027263213','way/1372583964','way/1372583963'],{
            'x':2335,'z':1748,'w':500,'d':300,'front':{'x':-.363,'z':.932},'arrive':195,
            'geometryNote':'Campus is not one roof; two mapped buildings split by 2024 aerial; tower height estimated',
            'subsites':[{'name':'县政府西侧附楼','x':2145.8,'z':1691,'h':20,'kind':'civic'}]}),
        ('沭阳体育中心',['way/1455053507','way/496856000','4b78a3d2-c2c3-4e55-b5c5-af47da2fbfb1'],{
            'w':430,'d':370,'front':{'x':0,'z':1},'arrive':220,'viewTarget':{'x':-489.25,'z':4722.5},
            'geometryNote':'2026 aerial: N-S open stadium, NW gym, SW pool; roof heights estimated',
            'subsites':[{'name':'沭阳体育场','x':-489.25,'z':4722.5,'h':26,'kind':'sports'},
                       {'name':'沭阳体育馆','x':-715,'z':4578.5,'h':20,'kind':'sports'},
                       {'name':'体育中心游泳馆','x':-743.8,'z':4775.2,'h':11,'kind':'sports'}]})]:
        sites.setdefault(name,{}).update(sourceBuildingIndices=[i for i,b in enumerate(buildings) if b['id'] in ids],**extra)
    for name,ident,height in [('万豪商务大厦','way/1456180564',90),('久盛百货','way/1367632165',16)]:
        i,b=next((i,b) for i,b in enumerate(buildings) if b['id']==ident)
        g=unary_union([Polygon(p['outer'],p['holes']) for p in b['polygons']]);x0,z0,x1,z1=g.bounds
        sites[name]={'x':round(g.centroid.x,1),'z':round(g.centroid.y,1),'w':round(x1-x0+10,1),'d':round(z1-z0+10,1),
            'h':height,'kind':'office' if '万豪' in name else 'mall','sourceId':ident,'sourceBuildingIndices':[i],
            'heightSource':'photo-storey/proportion estimate, not a measurement'}
    ident='reviewed/online/workers-palace'
    i,b=next((i,b) for i,b in enumerate(buildings) if b['id']==ident)
    g=unary_union([Polygon(p['outer'],p['holes']) for p in b['polygons']]);x0,z0,x1,z1=g.bounds
    sites['沭阳县工人文化宫（新馆）']={'x':round(g.centroid.x,1),'z':round(g.centroid.y,1),
        'w':round(x1-x0+4,1),'d':round(z1-z0+4,1),'h':18,'kind':'culture','sourceId':ident,
        'sourceBuildingIndices':[i],'front':{'x':0,'z':1},'arrive':75,
        'roofPanel':json.loads((DATA/'online-reviewed-context.json').read_bytes())['workersPalaceRoofPanel'],
        'positionSource':'AMap standard map whole footprint + satellite + B0JG3A0FKP exterior; GCJ-02 inverted to WGS84',
        'heightSource':'photo-proportion display estimate, not a measurement',
        'geometryNote':'2023-05-01 opening verified by Jiangsu Workers newspaper; imagery acquisition date unknown.'}
    west=json.loads((DATA/'online-reviewed-context.json').read_bytes()).get('huachenWesternTowers')
    if west:
        ids={west['sourceTraceId'],'reviewed/online/huachen/01','reviewed/online/huachen/02','1f3ce979-3701-4115-870e-3d42e2d11918'}
        selected=[(i,b) for i,b in enumerate(buildings) if b['id'] in ids]
        assert {b['id'] for _,b in selected}==ids,'Huachen complete outline and partial-source binding must both exist'
        g=unary_union([Polygon(p['outer'],p['holes']) for _,b in selected for p in b['polygons']]);x0,z0,x1,z1=g.bounds
        sites['华辰大厦沿街楼群']={'x':round(g.centroid.x,1),'z':round(g.centroid.y,1),
            'w':round(x1-x0,1),'d':round(z1-z0,1),'h':west['heightEstimate'],'kind':'residential',
            'sourceId':west['sourceTraceId'],'sourceBuildingIndices':[i for i,_ in selected],
            'towerParts':west['parts'],'towerHeight':west['heightEstimate'],'podiumHeight':west['baseHeightEstimate'],
            'eastSourceIds':['reviewed/online/huachen/02','reviewed/online/huachen/01'],
            'positionSource':'Labelled AMap footprints + satellite; complete 2-number outline binds original small Overture fragment',
            'heightSource':'photo/satellite proportion estimates, floor counts unknown','geometryNote':west['method']}
    campus_file=DATA/'reviewed-mengxi-campus.json'
    if campus_file.exists():
        mc=json.loads(campus_file.read_bytes());campus=Polygon(mc['boundary'])
        campus_indices=[];teaching_indices=[]
        for i,b in enumerate(buildings):
            g=unary_union([Polygon(p['outer'],p['holes']) for p in b['polygons']])
            if g.intersection(campus).area/g.area>=.6:campus_indices.append(i)
            if b['id'] in mc['westTeachingIds']:teaching_indices.append(i)
        assert len(teaching_indices)==6
        sites[mc['name']]={'x':round(mc['gate'][0],1),'z':round(mc['gate'][1],1),'w':70,'d':30,'h':23,
            'kind':'school','model':'mengxiGate','preserveSource':True,'arrive':75,'front':{'x':-.1,'z':.995},
            'campusBuildingIndices':campus_indices,'sourceBuildingIndices':teaching_indices,
            'teachingSourceIds':mc['westTeachingIds'],'teachingHeight':mc['heightEstimate'],'bodyHeight':mc['bodyHeightEstimate'],
            'positionSource':'AMap native satellite campus axis; GCJ-02 inverted to WGS84; source teaching footprints retained',
            'heightSource':mc['heightNote'],'geometryNote':mc['boundaryNote']}
    school_file=DATA/'reviewed-shiyan-campus.json'
    if school_file.exists():
        sc=json.loads(school_file.read_bytes());school=Polygon(sc['boundary'])
        school_indices=[];teaching=[]
        for i,b in enumerate(buildings):
            g=unary_union([Polygon(p['outer'],p['holes']) for p in b['polygons']])
            if g.intersection(school).area/g.area>=.6:school_indices.append(i)
            if b['id'] in sc['teachingSourceIds']:teaching.append(i)
        assert len(teaching)==len(sc['teachingSourceIds']),'Shiyan teaching source ids must all resolve'
        assert not (set(teaching)&set(indices)),'Shiyan and high-school replacements must stay separate'
        sites[sc['name']]={'x':round(sc['gate'][0],1),'z':round(sc['gate'][1],1),'w':110,'d':70,'h':20,
            'kind':'school','model':'shiyanGate','preserveSource':True,'arrive':88,'front':{'x':0,'z':1},
            'campusBuildingIndices':school_indices,'sourceBuildingIndices':teaching,
            'teachingSourceIds':sc['teachingSourceIds'],'teachingHeight':sc['heightEstimate'],'bodyHeight':sc['bodyHeightEstimate'],
            'campusBoundary':[[round(v,1) for v in p] for p in sc['boundary']],
            'fountain':[round(v,1) for v in sc['fountain']],'plazaCenter':[round(v,1) for v in sc['plazaCenter']],
            'secondaryGate':[round(v,1) for v in sc['secondaryGate']],
            'positionSource':'AMap 2026-11-13 zoom-18 standard/satellite tile mosaic, campus POI area and Tencent south gate 公园路11号; GCJ-02 inverted to WGS84',
            'heightSource':sc['heightNote'],'geometryNote':sc['boundaryNote'],
            'photoEventEvidence':sc['photoEventEvidence']}
    # Keep WGS84 OSM source geometry. Commercial-map POI coordinates are never used raw.
    output='// Generated by tools/build-shuyang-landmarks.py; no credentials.\nexport const PHOTO_LANDMARK_SITES = '+json.dumps(sites,ensure_ascii=False,separators=(',',':'))+';\n'
    (ROOT/'js/landmark-data.js').write_text(output,encoding='utf-8',newline='\n')
    print(json.dumps({'sites':len(sites),'campusBuildings':len(indices),'gate':[round(gate.x,1),round(gate.y,1)]}))


if __name__=='__main__': main()
