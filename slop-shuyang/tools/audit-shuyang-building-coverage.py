"""Measure source coverage loss before changing the building fusion rules."""
import gzip, json, runpy
from pathlib import Path
from shapely.geometry import Polygon, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'tools/data/shuyang'
h=runpy.run_path(str(Path(__file__).with_name('enrich-shuyang-buildings.py')))


def main():
    rows=json.loads(gzip.decompress((DATA/'buildings-enriched.json.gz').read_bytes()))['buildings']
    osm=[unary_union([Polygon(p['outer'],p['holes']) for p in r['polygons']]) for r in rows if r['source']=='OSM']
    tree=STRtree(osm)
    gaps=[]
    for f in json.loads((DATA/'overture-buildings.geojson').read_bytes())['features']:
        g=h['world'](shape(f['geometry'])).intersection(h['CORE'])
        if g.is_empty or g.area<12:continue
        candidates=[osm[int(i)] for i in tree.query(g)]
        if not any(g.intersection(o).area>min(g.area,o.area)*.15 for o in candidates):continue
        remaining=g.difference(unary_union(candidates))
        if remaining.area>=12 and remaining.area/g.area>.15:
            gaps.append({'id':f['properties']['id'],'areaM2':round(g.area,1),
                'uncoveredM2':round(remaining.area,1),'uncoveredFraction':round(remaining.area/g.area,3),
                'x':round(g.centroid.x,1),'z':round(g.centroid.y,1)})
    report={'sourceBuildings':len(rows),'partialDuplicatesWithUncoveredGeometry':len(gaps),
        'uncoveredRoofAreaM2':round(sum(g['uncoveredM2'] for g in gaps),1),
        'candidates':sorted(gaps,key=lambda g:-g['uncoveredM2'])}
    model_file=DATA/'landmark-model-footprints.json'
    if model_file.exists():
        from shapely.geometry import box
        models=[]
        for c in json.loads(model_file.read_bytes()):
            if c.get('sourceFootprint') or c.get('maxY',0)<1:continue
            p=c.get('polygon')
            models.append(Polygon([(v['x'],v['z']) for v in p['outer']],
                [[(v['x'],v['z']) for v in r] for r in p.get('holes',[])]) if p else box(c['minX'],c['minZ'],c['maxX'],c['maxZ']))
        occupied=unary_union(models)
        lost=[]
        for r in rows:
            g=unary_union([Polygon(p['outer'],p['holes']) for p in r['polygons']])
            overlap=g.intersection(occupied).area
            if overlap>.01 and g.difference(occupied).area>=12:
                lost.append({'id':r['id'],'name':r['name'],'areaM2':round(g.area,1),
                    'retainedAreaM2':round(g.difference(occupied).area,1),'height':r['height']})
        report['partiallyCoveredByLandmarkModels']=lost
    (DATA/'building-coverage-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='candidates'}))
    print(json.dumps(report['candidates'][:5]))
    print(json.dumps(report.get('partiallyCoveredByLandmarkModels',[]),ensure_ascii=False))


if __name__=='__main__':main()
