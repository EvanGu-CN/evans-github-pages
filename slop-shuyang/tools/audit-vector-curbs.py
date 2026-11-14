"""Audit emitted curb/slab geometry against the actual renderer road triangles."""
from pathlib import Path
import hashlib,json,subprocess
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT=Path(__file__).resolve().parents[1]
def points(flat):return list(zip(flat[::2],flat[1::2]))
def audit():
    js="""import {GEO} from './js/shuyang-geodata.js';import {roadRibbonTriangles} from './js/road-ribbon.js';
    process.stdout.write(JSON.stringify({GEO,triangles:GEO.roads.filter(r=>!r[5]).flatMap(r=>roadRibbonTriangles(Array.from({length:r[6].length/2},(_,i)=>({x:r[6][i*2],z:r[6][i*2+1]})),r[2]+.8))}));"""
    data=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT,text=True,encoding='utf-8'));geo=data['GEO']
    triangles=[Polygon([(p['x'],p['z']) for p in t]) for t in data['triangles']]
    roads=unary_union([p for p in triangles if p.area>1e-9])
    water=unary_union([Polygon(points(p['rings'][0]),[points(r) for r in p['rings'][1:]]) for p in geo['water']['polygons']])
    islands=[Polygon(points(b[0]),[points(h) for h in b[6]]) for b in geo['blocks']]
    road_overlap=water_overlap=outside=mutual=0.;min_inset=1e9;slab_count=0;surface_area=0;large_surface_area=0;no_road_islands=0
    tree=STRtree(islands)
    for i,(p,b) in enumerate(zip(islands,geo['blocks'])):
        assert p.is_valid and p.area>=199.99
        road_overlap+=p.intersection(roads).area;water_overlap+=p.intersection(water).area
        for j in tree.query(p):
            if j>i:mutual+=p.intersection(islands[j]).area
        surface=unary_union([Polygon(points(s['outer']),[points(h) for h in s['holes']]) for s in b[9]])
        assert surface.is_valid
        if surface.is_empty:
            assert p.distance(roads)>3.29,{'island':i,'roadDistance':p.distance(roads),'area':p.area}
            no_road_islands+=1
        outside+=surface.difference(p).area;surface_area+=surface.area
        if p.area>120000:large_surface_area+=surface.area
        for s in b[7]:
            q=Polygon(points(s['outer']),[points(h) for h in s['holes']]);assert q.is_valid
            slab_count+=1;outside+=q.difference(surface).area;min_inset=min(min_inset,q.distance(surface.boundary))
    result={'islands':len(islands),'holes':sum(len(b[6]) for b in geo['blocks']),'slabs':slab_count,
        'surfaces':sum(len(b[9]) for b in geo['blocks']),'largeParcels':sum(p.area>120000 for p in islands),
        'roadTriangles':len(data['triangles']),'roadOverlapM2':road_overlap,'waterOverlapM2':water_overlap,
        'mutualOverlapM2':mutual,'slabOutsideIslandM2':outside,'minimumSlabSetbackM':min_inset,
        'surfaceAreaM2':surface_area,'largeParcelStreetBandAreaM2':large_surface_area,
        'landIslandsWithoutAdjacentRoad':no_road_islands,
        'sourceRoadWays':len(set(geo['roadSourceIds'])),'renderRoadSections':len(geo['roads']),
        'sourceBuildingBinarySha256':hashlib.sha256((ROOT/'js/building-geodata.bin.gz').read_bytes()).hexdigest()}
    assert max(road_overlap,water_overlap,outside,mutual)<.001,result
    assert min_inset>.298,result
    return result
if __name__=='__main__':print(json.dumps(audit(),indent=2))
