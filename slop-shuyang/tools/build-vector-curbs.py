"""Replace raster stair-steps with the complement of actual road triangles.

The Node geodata builder sends public geometry on stdin. The old raster mask is
retained only as a conservative source of lot rectangles, never as a curb edge.
Requires Shapely 2; no map service or image is queried by this build step.
"""
import json,sys
from shapely import make_valid,set_precision
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
from shapely.strtree import STRtree

def polygons(g):
    if g.geom_type=='Polygon':return [g]
    return [p for child in getattr(g,'geoms',[]) for p in polygons(child)]

def encoded(p):
    ring=lambda r:[[round(x,3),round(z,3)] for x,z in list(r.coords)[:-1]]
    return {'poly':ring(p.exterior),'holes':[ring(h) for h in p.interiors]}

def build(data):
    frame=data['bounds'];land=box(frame['minX'],frame['minZ'],frame['maxX'],frame['maxZ'])
    triangles=[Polygon([(p['x'],p['z']) for p in t]) for t in data['roadTriangles']]
    # 2 cm protects Float32 rendering and millimetre topology rounding. It is
    # not a measured road shoulder and does not change any carriageway width.
    roads=unary_union([p for p in triangles if p.area>1e-9]).buffer(.02,join_style=2)
    water=unary_union([make_valid(Polygon(p[0],p[1:])) for p in data['water']])
    exact=set_precision(land.difference(unary_union([roads,water.buffer(.02,join_style=2)])),.001)
    old=data['rasterBlocks'];old_shapes=[make_valid(Polygon(b['poly'])) for b in old];tree=STRtree(old_shapes)
    result=[];dropped=0;rect_dropped=0
    for p in sorted(polygons(exact),key=lambda p:(p.bounds[0],p.bounds[1],-p.area)):
        if p.area<200:dropped+=1;continue
        overlaps=[(int(i),p.intersection(old_shapes[i]).area) for i in tree.query(p)]
        overlaps=[(i,a) for i,a in overlaps if a>1]
        inherited=old[max(overlaps,key=lambda ia:ia[1])[0]] if overlaps else {}
        lots=[];seen=set()
        for i,_ in overlaps:
            for r in old[i]['rects']:
                key=tuple(r)
                if key in seen:continue
                seen.add(key)
                if p.covers(box(r[0],r[2],r[1],r[3])):lots.append(r)
                else:rect_dropped+=1
        xmin,zmin,xmax,zmax=p.bounds
        # Large parks/industrial parcels previously skipped every sidewalk.
        # Draw a street-side band without paving the entire parcel interior.
        # Clear the fixed-precision model while buffering. GEOS can otherwise
        # collapse an entire valid parcel on a millimetre negative offset.
        surface=p if p.area<=120000 else set_precision(set_precision(p,0).buffer(-.002).intersection(roads.buffer(3.3,join_style=2)),.001)
        inset=set_precision(set_precision(surface,0).buffer(-.3,join_style=2,mitre_limit=3),.001)
        point=p.representative_point()
        result.append({**encoded(p),'surfaces':[encoded(s) for s in polygons(surface) if s.area>.01],
                       'slabs':[encoded(s) for s in polygons(inset) if s.area>.01],
                       'rects':lots,'park':inherited.get('park',0),'parkName':inherited.get('parkName',''),
                       'rect':not p.interiors and abs((xmax-xmin)*(zmax-zmin)-p.area)<.001,
                       'cx':point.x,'cz':point.y,'area':p.area})
    return {'blocks':result,'audit':{'method':'vector complement of renderer road triangles and holed water polygons',
        'rasterBlocksBefore':len(old),'blocks':len(result),'holes':sum(len(p['holes']) for p in result),
        'smallIslandsDropped':dropped,'lotRectanglesDropped':rect_dropped,'roadTriangles':len(triangles),
        'roadClearanceM':.02,'waterClearanceM':.02,'slabInsetM':.3,'largeParcelStreetBandM':3.3,'precisionM':.001}}

if __name__=='__main__':
    if hasattr(sys.stdin,'reconfigure'):sys.stdin.reconfigure(encoding='utf-8')
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(build(json.load(sys.stdin)),ensure_ascii=False,separators=(',',':')))
