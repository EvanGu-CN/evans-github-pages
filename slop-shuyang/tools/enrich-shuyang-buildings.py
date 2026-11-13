"""Fuse local OSM and pinned Overture extracts; never invent missing footprints.

Run before build-shuyang-geodata.mjs. Optional 3D-GloBFP ZIPs in reference/
provide 2020 model heights, not measurements. See tools/data/shuyang/BUILDINGS.md.
"""
from pathlib import Path
from collections import Counter
import gzip, hashlib, json, math, re
from shapely import make_valid, set_precision, transform as transform_geometry
from shapely.geometry import Polygon, Point, shape, box, mapping
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'tools/data/shuyang'
LAT, LON = 34.1285, 118.7740
KX, KY = 111320 * math.cos(math.radians(LAT)), 110574
CORE = box(-3200, -2400, 3400, 5000)
WGS_BOUNDS = [LON - 3200/KX, LAT - 5000/KY, LON + 3400/KX, LAT + 2400/KY]
USES = ['unknown', 'residential', 'commercial', 'office', 'industrial', 'civic', 'house', 'garage']
HEIGHTS = ['estimate', 'osm-height', 'osm-levels', 'overture-height', 'globfp-model', 'cnbh-raster']
SOURCES = ['OSM', 'Overture', 'procedural', 'ReviewedImagery']
ROOFS = ['flat', 'gabled', 'hipped', 'pyramidal']


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def parts(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for child in getattr(g, 'geoms', []) for p in parts(child)]


def world(g):
    return transform_geometry(g, lambda x, y: ((x-LON)*KX, -(y-LAT)*KY), interleaved=False)


def osm_geometry(e):
    if e.get('geometry'):
        r = [(p['lon'], p['lat']) for p in e['geometry']]
        return make_valid(Polygon(r)) if len(r) >= 4 and r[0] == r[-1] else Polygon()
    rings = {}
    for role in ('outer', 'inner'):
        from shapely.geometry import LineString
        lines = [LineString([(p['lon'], p['lat']) for p in m['geometry']])
                 for m in e.get('members', []) if m.get('geometry') and m.get('role', 'outer') == role]
        rings[role] = unary_union(list(polygonize(unary_union(lines)))) if lines else Polygon()
    return make_valid(rings['outer'].difference(rings['inner']))


def number(raw):
    if raw is None:
        return None
    m = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(m|metres|meters|ft|feet|\')?\s*', str(raw).lower())
    return float(m[1]) * (.3048 if m[2] in ('ft', 'feet', "'") else 1) if m else None


def classify(t):
    use = t.get('building:use') or t.get('building') or t.get('class') or t.get('subtype', '')
    if use in ('apartments', 'apartment', 'residential', 'dormitory'):
        return 'residential'
    if use in ('house', 'detached', 'semidetached_house', 'terrace', 'bungalow'):
        return 'house'
    if use in ('industrial', 'warehouse', 'manufacture'):
        return 'industrial'
    if use in ('garage', 'garages', 'shed', 'carport', 'service'):
        return 'garage'
    if use in ('office',) or t.get('office'):
        return 'office'
    if use in ('retail', 'commercial', 'supermarket', 'hotel') or t.get('shop'):
        return 'commercial'
    if use in ('school', 'hospital', 'public', 'civic', 'university', 'train_station', 'government') or t.get('amenity') in ('school', 'hospital', 'townhall', 'library', 'police'):
        return 'civic'
    return 'unknown'


def main():
    rows = []
    audit = Counter()
    contexts, context_uses = [], []
    for e in load('osm_land.json')['elements']:
        use = e.get('tags', {}).get('landuse')
        if use not in ('residential', 'commercial', 'retail', 'industrial'):
            continue
        g = world(osm_geometry(e))
        if not g.is_empty:
            contexts.append(g)
            context_uses.append('commercial' if use == 'retail' else use)
    context_tree = STRtree(contexts)

    def add(g, t, source, ident):
        g = make_valid(g).intersection(CORE)
        # Preserve concavities/courtyards. Half-metre quantization is the runtime format.
        g = set_precision(make_valid(g.simplify(.2, preserve_topology=True)), .5)
        ps = [p for p in parts(g) if p.area >= 12]
        if not ps:
            audit['tiny-or-invalid'] += 1
            return
        g = unary_union(ps)
        category = classify(t)
        category_source = 'source-use' if category != 'unknown' else 'unknown'
        if category == 'unknown':
            matches = [(g.intersection(contexts[int(i)]).area / g.area, context_uses[int(i)])
                       for i in context_tree.query(g)]
            if matches:
                ratio, use = max(matches)
                if ratio >= .65:
                    category, category_source = use, 'landuse-estimate'
        h = number(t.get('height') or t.get('building:height'))
        levels = number(t.get('building:levels') or t.get('num_floors'))
        hs = ('osm-height' if source == 'OSM' else 'overture-height') if h and 2 <= h <= 200 else 'estimate'
        if hs == 'estimate' and levels and 1 <= levels <= 60:
            h = levels * (3.6 if category in ('office', 'commercial', 'civic') else 3.0)
            hs = 'osm-levels' if source == 'OSM' else 'estimate'
        elif hs == 'estimate':
            # Conservative display values, explicitly marked estimates. No distance/random skyline boost.
            h = {'residential': 18, 'commercial': 12, 'office': 24, 'industrial': 8,
                 'civic': 15, 'house': 8.5, 'garage': 3.5}.get(category, 9)
            if category == 'residential' and g.area < 120:
                h = 9
        base = number(t.get('min_height')) or 0
        if not 0 <= base < h:
            base = 0
        roof = t.get('roof:shape') or t.get('roof_shape') or 'flat'
        roof = roof if roof in ROOFS else 'flat'
        rh = number(t.get('roof:height') or t.get('roof_height')) or (min(3, h*.2) if roof != 'flat' else 0)
        # Height is total roof elevation, not wall + roof added a second time.
        rows.append({'id': ident, 'name': t.get('name') or (t.get('names') or {}).get('primary', ''),
                     'source': source, 'height': round(h, 1), 'heightSource': hs,
                     'baseHeight': round(base, 1), 'levels': round(levels or 0),
                     'category': category, 'categorySource': category_source,
                     'roofShape': roof, 'roofHeight': round(min(rh, h/3), 1),
                     'colour': t.get('building:colour', ''), 'roofColour': t.get('roof:colour', ''),
                     'polygons': [{'outer': list(p.exterior.coords)[:-1],
                                   'holes': [list(r.coords)[:-1] for r in p.interiors]} for p in ps],
                     '_geometry': g})

    for e in load('osm_buildings.json')['elements']:
        t = e.get('tags', {})
        if not t.get('building') or t['building'] in ('no', 'construction', 'proposed', 'ruins'):
            continue
        g = world(osm_geometry(e))
        if not g.is_empty and g.intersects(CORE):
            add(g, t, 'OSM', f"{e['type']}/{e['id']}")
    # OSM wins geometry conflicts. An overlap test uses polygons, not their bounding boxes.
    osm_shapes = [r['_geometry'] for r in rows]
    osm_tree = STRtree(osm_shapes)
    overture = DATA / 'overture-buildings.geojson'
    if not overture.exists():
        raise SystemExit('Missing pinned Overture extract. See BUILDINGS.md; refusing to silently publish sparse data.')
    overture_bytes = overture.read_bytes()
    features = json.loads(overture_bytes)['features']
    for f in features:
        g = world(shape(f['geometry']))
        if not g.intersects(CORE):
            continue
        t = f['properties']
        if t.get('is_underground') or (t.get('confidence') is not None and t['confidence'] < .7):
            audit['overture-filtered'] += 1
            continue
        overlaps = [(g.intersection(osm_shapes[int(i)]).area, int(i)) for i in osm_tree.query(g)]
        if any(a > min(g.area, osm_shapes[i].area)*.15 for a, i in overlaps):
            audit['overture-osm-duplicate'] += 1
            # Preserve Overture metric height when an otherwise heightless OSM outline matches reliably.
            h = number(t.get('height'))
            if h and 2 <= h <= 200:
                for a, i in overlaps:
                    if a / (g.area + osm_shapes[i].area-a) >= .5 and rows[i]['heightSource'] == 'estimate':
                        rows[i]['height'], rows[i]['heightSource'] = round(h, 1), 'overture-height'
            continue
        add(g, t, 'Overture', t.get('id') or f.get('id'))

    # Individually reviewed roof observations may fill real omissions, with their
    # acquisition date and uncertainty retained. Never subdivide empty lots.
    reviewed_meta = None
    reviewed_file = DATA/'reviewed-buildings.geojson'
    if reviewed_file.exists():
        reviewed = json.loads(reviewed_file.read_bytes())
        existing = [r['_geometry'] for r in rows]
        existing_tree = STRtree(existing)
        accepted = []
        accepted_ids, decisions = [], []
        for f in reviewed['features']:
            ident = f['properties']['id']
            bound_ids=set(f['properties'].get('reviewedReplacesSourceIds',[]))
            g = make_valid(world(shape(f['geometry']))).intersection(CORE)
            if g.is_empty or g.area < 12:
                decisions.append({'traceId':ident,'status':'rejected-invalid-or-small'})
                continue
            overlaps = [(existing[int(i)],rows[int(i)]['id']) for i in existing_tree.query(g)] + [
                (p,pid) for p,pid in zip(accepted,accepted_ids) if p.intersects(g)]
            conflicts = [{'sourceId':pid,'sourceAreaM2':round(p.area,1),
                          'intersectionM2':round(g.intersection(p).area,1)} for p,pid in overlaps
                         if g.intersection(p).area > min(g.area,p.area)*.2]
            if bound_ids:
                # A specifically reviewed partial record may remain in the data
                # while its rendering is bound to the newer complete outline.
                # Never waive an arbitrary overlap or discard the old record.
                matches=[(p,pid) for p,pid in overlaps if pid in bound_ids]
                if {pid for _,pid in matches}!=bound_ids or any(
                    g.intersection(p).area/p.area<.8 or g.area<2*p.area for p,_ in matches):
                    raise ValueError('Invalid reviewed partial-source binding: '+ident)
                conflicts=[c for c in conflicts if c['sourceId'] not in bound_ids]
            if conflicts:
                audit['reviewed-existing-duplicate'] += 1
                decisions.append({'traceId':ident,'status':'rejected-overlap','observedAreaM2':round(g.area,1),
                    'reason':'Overlap exceeds 20 percent of smaller footprint; existing source retained.',
                    'conflicts':conflicts})
                continue
            t = f['properties'];before=len(rows)
            add(g,t,'ReviewedImagery',t['id'])
            if len(rows)>before:
                rows[-1].update(heightSource='estimate',geometrySource=t['geometrySource'],
                    **({'labelScope':t['labelScope']} if t.get('labelScope') else {}),
                    geometryReference={'imageDate':t['referenceImageDate'],'traceId':t['id'],
                        **({'replacesSourceIds':sorted(bound_ids)} if bound_ids else {}),
                        **({'referenceId':t['referenceId'],'retrievedAt':t['referenceRetrievedAt']} if t.get('referenceId') else {}),
                        'accuracyNote':t['geometryAccuracyNote']},
                    heightNote=t['heightNote'],photoLevelsEstimate=t.get('levelsEstimate',0))
                accepted.append(rows[-1]['_geometry'])
                accepted_ids.append(ident)
                decisions.append({'traceId':ident,'status':'accepted','areaM2':round(rows[-1]['_geometry'].area,1),
                    **({'boundSourceIds':sorted(bound_ids),'overlapResolution':'Original partial source retained in extract; dedicated model must bind both IDs to the complete reviewed outline.'} if bound_ids else {})})
        reviewed_meta = {'reference':reviewed['reference'],'additionalReferences':reviewed.get('additionalReferences',[]),'traceSha256':reviewed['traceSha256'],
            'observedCandidates':len(reviewed['features']),'acceptedBuildings':len(accepted),
            'deduplicatedAgainstExisting':audit['reviewed-existing-duplicate'],'decisions':decisions}

    # Optional regional archives. Only intersecting records are read; full ZIPs stay outside Git.
    glob_shapes, glob_heights, glob_refs = [], [], []
    archives = []
    for archive in sorted((DATA / 'reference').glob('globfp-*.zip')):
        import shapefile, zipfile
        if not zipfile.is_zipfile(archive):
            continue
        with zipfile.ZipFile(archive) as z:
            shp = next(n for n in z.namelist() if n.endswith('.shp'))
            with z.open(shp) as a, z.open(shp[:-4]+'.dbf') as b, z.open(shp[:-4]+'.shx') as c:
                reader = shapefile.Reader(shp=a, dbf=b, shx=c)
                for r in reader.iterShapeRecords(bbox=WGS_BOUNDS):
                    h = number(r.record['Height'])
                    g = world(make_valid(shape(r.shape.__geo_interface__)))
                    if h and 2 <= h <= 200 and g.intersects(CORE):
                        glob_shapes.append(g); glob_heights.append(h)
                        glob_refs.append(f'{archive.stem}/{r.record.oid}')
        archives.append({'file': archive.name, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()})
    glob_tree = STRtree(glob_shapes)
    for r in rows:
        if r['heightSource'] != 'estimate' or r['source']=='ReviewedImagery':
            continue
        g = r['_geometry']
        matches = []
        for i in glob_tree.query(g):
            i = int(i); a = g.intersection(glob_shapes[i]).area
            iou = a / (g.area+glob_shapes[i].area-a)
            if iou >= .45:
                matches.append((iou, i))
        if matches:
            iou, i = max(matches)
            r.update(height=round(glob_heights[i], 1), heightSource='globfp-model',
                     heightMatch={'id': glob_refs[i], 'iou': round(iou, 3), 'referenceYear': 2020})

    # A raster estimate is lower priority than tagged heights/floors and matched individual models.
    # Use valid pixel centres inside the footprint (including holes), never just the bounding-box centre.
    raster_meta = None
    raster_path = DATA / 'cnbh-2020-core.tif'
    if raster_path.exists():
        import rasterio
        import numpy as np
        from rasterio.features import geometry_mask
        from rasterio.windows import from_bounds, Window
        from rasterio.warp import transform_geom
        with rasterio.open(raster_path) as raster:
            for r in rows:
                if r['heightSource'] != 'estimate' or r['source']=='ReviewedImagery':
                    continue
                g = transform_geometry(r['_geometry'], lambda x, y: (LON+x/KX, LAT-y/KY), interleaved=False)
                geom = transform_geom('EPSG:4326', raster.crs, mapping(g))
                window = from_bounds(*shape(geom).bounds, raster.transform)
                x0, y0 = max(0, math.floor(window.col_off)), max(0, math.floor(window.row_off))
                x1, y1 = min(raster.width, math.ceil(window.col_off+window.width)), min(raster.height, math.ceil(window.row_off+window.height))
                if x1 <= x0 or y1 <= y0:
                    continue
                window = Window(x0, y0, x1-x0, y1-y0)
                a = raster.read(1, window=window)
                mask = geometry_mask([geom], a.shape, raster.window_transform(window), invert=True)
                values = a[mask & np.isfinite(a) & (a >= 2) & (a <= 200)]
                if len(values) < 2 or len(values) < mask.sum()*.5:
                    continue
                r.update(height=round(float(np.median(values)), 1), heightSource='cnbh-raster',
                         heightMatch={'referenceYear': 2020, 'resolutionM': 10, 'pixels': len(values),
                                      'method': 'median-of-valid-pixel-centres-in-footprint',
                                      'rangeM': [round(float(values.min()), 1), round(float(values.max()), 1)]})
        raster_meta = {'provider': 'CNBH-10m / Wanben Wu', 'referenceYear': 2020, 'resolutionM': 10,
                       'reference': 'https://doi.org/10.5281/zenodo.7923866', 'license': 'CC BY 4.0',
                       'extractSha256': hashlib.sha256(raster_path.read_bytes()).hexdigest(),
                       'file': 'CNBH10m_X119Y35.tif', 'crs': 'EPSG:32650'}

    # Visible six-storey west teaching typology supersedes coarse 2020 pixels.
    # This remains a display estimate, never an official floor/height measurement.
    campus_file=DATA/'reviewed-mengxi-campus.json'
    if campus_file.exists():
        campus=json.loads(campus_file.read_bytes())
        for r in rows:
            if r['id'] in campus['westTeachingIds'] and r['heightSource'] in ('estimate','cnbh-raster','globfp-model'):
                r['previousHeightReference']={k:r[k] for k in ('height','heightSource','heightMatch') if k in r}
                r.pop('heightMatch',None)
                r.update(height=campus['heightEstimate'],heightSource='estimate',category='civic',
                    categorySource='reviewed-campus-photo-typology',heightNote=campus['heightNote'],
                    heightReferenceId=campus['referenceId'])

    # Deterministic order makes binary diffs reproducible and keeps neighbouring geometry together.
    rows.sort(key=lambda r: (math.floor(r['_geometry'].centroid.x/500),
                             math.floor(r['_geometry'].centroid.y/500), str(r['id'])))
    for r in rows:
        del r['_geometry']
    report = {'boundsWgs84': WGS_BOUNDS, 'buildings': len(rows),
              'sources': dict(Counter(r['source'] for r in rows)),
              'heightSources': dict(Counter(r['heightSource'] for r in rows)),
              'categories': dict(Counter(r['category'] for r in rows)), 'filters': dict(audit),
              'courtyards': sum(len(p['holes']) for r in rows for p in r['polygons']),
              'overture': {'release': '2026-10-21.0', 'features': len(features),
                           'sha256': hashlib.sha256(overture_bytes).hexdigest(),
                           'reference': 'https://docs.overturemaps.org/guides/buildings/'},
              'globfpArchives': archives, 'reviewedImagery': reviewed_meta,
              'cnbh': raster_meta,
              'limitations': ['Unlabelled heights and landuse-derived uses remain estimates.',
                              'Satellite roofprints and model heights do not reconstruct photographed facades.',
                              'CNBH is a 2020 model at 10 m resolution; mixed pixels and new construction limit individual-building accuracy.',
                              '3D-GloBFP, when available, represents 2020 and uses model-estimated heights.']}
    payload = json.dumps({'schema': 2, 'report': report, 'buildings': rows}, ensure_ascii=False, separators=(',', ':')).encode()
    (DATA / 'buildings-enriched.json.gz').write_bytes(gzip.compress(payload, mtime=0))
    (DATA / 'building-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
