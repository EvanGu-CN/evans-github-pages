"""Build named housing areas and mapped street surfaces from local OSM snapshots.

All geometry uses the same metre frame as the building extract. Membership uses
polygon coverage, never proximity. No perimeter walls or internal roads are invented.
"""
import gzip, hashlib, json, runpy
from collections import Counter
from shapely import make_valid, set_precision
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree
from pathlib import Path

helpers = runpy.run_path(str(Path(__file__).with_name('enrich-shuyang-buildings.py')))
DATA, CORE = helpers['DATA'], helpers['CORE']
world, osm_geometry, parts, number = (helpers[k] for k in ('world', 'osm_geometry', 'parts', 'number'))


def load(name):
    return json.loads((DATA / name).read_bytes())


def line(e):
    pts = [(p['lon'], p['lat']) for p in e.get('geometry', [])]
    return world(LineString(pts)) if len(pts) > 1 else LineString()


def encode(g):
    result = []
    g = set_precision(make_valid(g.simplify(.3, preserve_topology=True)), .1)
    for p in parts(g):
        if p.area < 1:
            continue
        flat = lambda r: [round(v, 1) for xy in list(r.coords)[:-1] for v in xy]
        result.append({'outer': flat(p.exterior), 'holes': [flat(r) for r in p.interiors]})
    return result


def main():
    raw = (DATA / 'buildings-enriched.json.gz').read_bytes()
    buildings = json.loads(gzip.decompress(raw))['buildings']
    shapes = [unary_union([Polygon(p['outer'], p['holes']) for p in b['polygons']]) for b in buildings]
    tree = STRtree(shapes)
    # Clearance exceeds simplification + quantization, so paving cannot peek through a wall.
    building_mask = unary_union(shapes).buffer(.65)
    land, roads, urban, water = (load('osm_'+k+'.json') for k in ('land', 'roads', 'urban_features', 'water'))
    neighborhoods, areas = [], []
    name_aliases=load('place-name-aliases.json')
    for e in land['elements']:
        t = e.get('tags', {})
        if t.get('landuse') != 'residential' or not t.get('name'):
            continue
        g = make_valid(world(osm_geometry(e))).intersection(CORE)
        if g.is_empty or g.area < 200:
            continue
        p = g.representative_point()
        aliases = sorted({s.strip() for k in ('alt_name', 'short_name', 'name:zh') for s in t.get(k, '').split(';') if s.strip() and s != t['name']})
        aliases=sorted(set(aliases+name_aliases.get(f"{e['type']}/{e['id']}",[])))
        neighborhoods.append({'id': f"{e['type']}/{e['id']}", 'name': t['name'], 'aliases': aliases,
                              'x': round(p.x, 1), 'z': round(p.y, 1), 'area': round(g.area),
                              'bounds': [round(v, 1) for v in g.bounds], 'polygons': encode(g),
                              'buildings': [], 'paletteVariant': e['id'] % 3})
        areas.append(g)
    # Explicitly approximate street-block contexts are supplementary references,
    # not a claim that the provider mapped official estate boundaries.
    reviewed_file=DATA/'reviewed-district-context.json'
    if reviewed_file.exists():
        for n in json.loads(reviewed_file.read_bytes())['neighborhoods']:
            if any(p['name']==n['name'] for p in neighborhoods):continue
            g=unary_union([Polygon(list(zip(p['outer'][::2],p['outer'][1::2]))) for p in n['polygons']]).intersection(CORE)
            if g.is_empty:continue
            neighborhoods.append({**n,'aliases':[],'area':round(g.area),'bounds':[round(v,1) for v in g.bounds],
                'buildings':[],'paletteVariant':0,'photoStyle':{'临安小区':'linan-red','盛源金城':'shengyuan-pale','君临天下':'junlin-peach'}.get(n['name'])})
            areas.append(g)
    # Prefer the smaller mapped area when a phase is nested in a larger estate.
    assignment = {}
    for j, g in sorted(enumerate(areas), key=lambda a: a[1].area):
        for i in tree.query(g):
            i = int(i)
            if i not in assignment and g.intersection(shapes[i]).area / shapes[i].area >= .6:
                assignment[i] = j
                neighborhoods[j]['buildings'].append(i)
    for n in neighborhoods:
        if n['name'] in ('沃德嘉园','苏通花苑'):
            n['photoStyle']={'沃德嘉园':'wode-ochre','苏通花苑':'sutong-cream'}[n['name']]
        n['buildings'].sort()
        n['labelHeight'] = round(max([buildings[i]['height'] for i in n['buildings']] or [12]) + 7, 1)

    # A place label is not silently treated as the name of the nearest unrelated building.
    # Exact named building polygons and source POI points remain distinguishable.
    named_sites = []
    housing_names = {n['name'] for n in neighborhoods}
    def site_kind(tags, category='unknown'):
        amenity = tags.get('amenity', '')
        if amenity in ('hospital', 'clinic', 'doctors', 'pharmacy'): return 'hospital'
        if amenity in ('school', 'college', 'university', 'kindergarten'): return 'school'
        if tags.get('shop') or category == 'commercial': return 'commercial'
        if tags.get('office') == 'government' or amenity in ('townhall', 'police', 'courthouse', 'fire_station'): return 'government'
        if tags.get('tourism') in ('museum', 'gallery') or amenity in ('library', 'theatre', 'arts_centre'): return 'culture'
        if amenity == 'bank': return 'bank'
        if tags.get('railway') == 'station' or amenity == 'bus_station': return 'station'
        if tags.get('leisure') in ('park', 'garden', 'nature_reserve'): return 'park'
        if tags.get('leisure') in ('pitch', 'track', 'sports_centre', 'stadium'): return 'sports'
        return category if category in ('industrial', 'office', 'civic') else 'building'
    def add_site(ident, name, kind, point, indices, source_scope, source='OSM',label_scope=None):
        name = name.strip()
        if not name or name in housing_names or not CORE.covers(point): return
        existing = next((s for s in named_sites if s['id'] == ident or (s['name'] == name and Point(s['x'], s['z']).distance(point) < 65)), None)
        if existing:
            if existing['kind'] in ('building', 'civic') and kind != 'building': existing['kind'] = kind
            return
        nearby = [int(i) for i in tree.query(point.buffer(35)) if shapes[int(i)].distance(point) < 35]
        roof = max([buildings[i]['height'] for i in indices + nearby] or [12])
        named_sites.append({'id': ident, 'name': name, 'kind': kind, 'x': round(point.x, 1), 'z': round(point.y, 1),
                            'labelHeight': round(roof + 6, 1), 'buildings': indices, 'source': source, 'scope': source_scope,
                            **({'labelScope':label_scope} if label_scope else {})})
    for i, b in enumerate(buildings):
        if b['name']:
            add_site(b['id'], b['name'], site_kind({}, b['category']), shapes[i].representative_point(), [i], 'building', b['source'],b.get('labelScope'))
    pois = load('osm_pois.json')
    for e in pois['elements']:
        t = e.get('tags', {})
        center = e.get('center', e)
        if not t.get('name') or 'lon' not in center: continue
        p = world(Point(center['lon'], center['lat']))
        matches = [int(i) for i in tree.query(p) if shapes[int(i)].covers(p)]
        add_site(f"{e['type']}/{e['id']}", t.get('name:zh') or t['name'], site_kind(t), p, matches, 'place')

    water_shapes = [world(osm_geometry(e)) for e in water['elements']]
    for p in load('reviewed-water.json')['polygons']:
        water_shapes.append(Polygon(p['rings'][0], p['rings'][1:]))
    water_mask = unary_union([g for g in water_shapes if not g.is_empty])
    widths = {'motorway': 26, 'trunk': 24, 'primary': 20, 'secondary': 16, 'tertiary': 12,
              'residential': 7, 'unclassified': 8, 'service': 4.5, 'living_street': 6,
              'motorway_link': 9, 'trunk_link': 9, 'primary_link': 9, 'secondary_link': 8, 'tertiary_link': 8}
    path_widths = {'footway': 2, 'cycleway': 2.5, 'path': 1.8, 'pedestrian': 4, 'steps': 1.5, 'track': 3, 'bridleway': 2}
    road_shapes, path_records = [], []
    for e in roads['elements']:
        t = e.get('tags', {})
        if t.get('area') == 'yes' or t.get('tunnel') == 'yes' or t.get('covered') == 'yes':
            continue
        g = line(e).intersection(CORE)
        if g.is_empty:
            continue
        kind = t.get('highway')
        if kind in widths:
            tagged_width, lanes = number(t.get('width')), number(t.get('lanes'))
            w = tagged_width if tagged_width and tagged_width > 2 else max(widths[kind], lanes * 3.5 + 1.4) if lanes else widths[kind]
            road_shapes.append(g.buffer(min(50, max(3, w))/2 + .5))
        elif kind in path_widths:
            w = number(t.get('width')) or path_widths[kind]
            # Bridge elevations cannot be recovered from a centreline: keep them map-only.
            if t.get('bridge') in ('yes', 'viaduct'):
                continue
            path_records.append((e, g.buffer(min(8, max(1, w))/2, cap_style='flat', join_style='mitre')))
    road_mask = unary_union(road_shapes)
    blocked = unary_union([building_mask, road_mask, water_mask])
    surfaces, path_shapes = [], []
    for e, g in path_records:
        g = g.difference(blocked)
        encoded = encode(g)
        if encoded:
            path_shapes.append(g)
            surfaces.append({'id': f"way/{e['id']}", 'kind': 'path', 'polygons': encoded})
    path_mask = unary_union(path_shapes)
    paving_mask = unary_union([blocked, path_mask])
    for p in load('reviewed-water.json').get('plazas', []):
        encoded = encode(Polygon(p['outer']).difference(paving_mask))
        if encoded:
            surfaces.append({'id':p['id'],'name':p['name'],'kind':'plaza','source':'ReviewedImagery',
                             'imageAcquired':'2021-12-10','appearanceSource':'dated-image-footprint; paving colour estimated','polygons':encoded})
    # Housing land is a contextual ground layer, not a claim that its entire yard is paved.
    # Keep street/path/building/water geometry clear; mapped greenery is drawn above it.
    residential_ground = unary_union(areas).difference(paving_mask)
    encoded = encode(residential_ground)
    if encoded:
        surfaces.append({'id': 'osm-residential-areas', 'kind': 'residential-ground',
                         'sourceIds': [n['id'] for n in neighborhoods],
                         'appearanceSource': 'landuse-display-estimate', 'polygons': encoded})
    reviewed_surfaces = load('reviewed-district-surfaces.json')
    replaced_surface_ids={ident for s in reviewed_surfaces['surfaces'] for ident in s.get('replacesSourceSurfaceIds',[])}
    seen = set()
    for e in urban['elements'] + land['elements']:
        key = (e['type'], e['id'])
        if key in seen:
            continue
        seen.add(key)
        if f"{e['type']}/{e['id']}" in replaced_surface_ids:continue
        t = e.get('tags', {})
        kind = ('soccer' if t.get('sport')=='soccer' else 'basketball' if t.get('sport')=='basketball' else 'sports-ground') if t.get('leisure')=='pitch' else 'running-track' if t.get('leisure')=='track' else 'parking' if t.get('amenity') == 'parking' else 'plaza' if t.get('highway') == 'pedestrian' else 'green' if (
            t.get('landuse') in ('grass', 'meadow') or t.get('natural') in ('scrub', 'grassland') or
            t.get('leisure') == 'garden' or t.get('landcover') in ('grass', 'trees')) else None
        if not kind:
            continue
        source_shape=world(osm_geometry(e)).intersection(CORE)
        if kind=='running-track':
            source_shape=source_shape.difference(source_shape.buffer(-7))
        g = source_shape.difference(paving_mask)
        encoded = encode(g)
        if encoded:
            surfaces.append({'id': f"{e['type']}/{e['id']}", 'kind': kind, 'polygons': encoded,
                **({'sport':t.get('sport','unknown'),'appearanceSource':'mapped-outline; ground colour/track width are display estimates'} if t.get('leisure') in ('pitch','track') else {})})
    # Only source barriers are shown; gate points and street/path intersections remain open.
    gates = [world(Point(e['lon'], e['lat'])).buffer(3) for e in urban['elements']
             if e['type'] == 'node' and 'lon' in e and (e.get('tags', {}).get('barrier') or e.get('tags', {}).get('entrance'))]
    openings = unary_union([road_mask, path_mask.buffer(1), *gates])
    barriers = []
    for e in urban['elements']:
        t = e.get('tags', {})
        if e['type'] != 'way' or t.get('barrier') not in ('wall', 'fence', 'hedge', 'retaining_wall'):
            continue
        g = line(e).intersection(CORE).difference(openings)
        height = number(t.get('height'))
        for seg in ([g] if g.geom_type == 'LineString' else getattr(g, 'geoms', [])):
            if seg.geom_type == 'LineString' and seg.length > .8:
                barriers.append({'id': f"way/{e['id']}", 'kind': t['barrier'], 'height': min(5, height or 1.6),
                                 'heightSource': 'osm-height' if height else 'display-estimate',
                                 'points': [round(v, 1) for xy in seg.coords for v in xy]})
    for s in reviewed_surfaces['surfaces']:
        g=Polygon(s['rings'][0],s['rings'][1:]).intersection(CORE).difference(paving_mask)
        encoded=encode(g)
        if encoded:
            surfaces.append({k:s[k] for k in ('id','kind','name','sourceSiteId')}|{'source':'ReviewedImagery',
                'imageAcquired':s.get('imageAcquired',reviewed_surfaces['reference']['imageAcquired']),
                **({k:s[k] for k in ('referenceRetrievedAt','referenceId')} if 'referenceId' in s else {}),
                **({'widthEstimate':s['widthEstimate']} if 'widthEstimate' in s else {}),
                'geometryMethod':s['geometryMethod'],
                'appearanceSource':s.get('appearanceSource','dated-image-outline; colours and exact dimensions approximate; sport and lane count unconfirmed'),
                'polygons':encoded})
    audit = {'neighborhoods': len(neighborhoods), 'associatedBuildings': len(assignment),
             'namedSites': len(named_sites), 'namedSiteKinds': dict(Counter(n['kind'] for n in named_sites)),
             'surfaces': dict(Counter(s['kind'] for s in surfaces)), 'barriers': len(barriers),
             'snapshots': {k: s.get('osm3s', {}).get('timestamp_osm_base') for k, s in [('land', land), ('roads', roads), ('urban', urban), ('pois', pois)]},
             'limitations': ['小区名称、范围和步道来自开放地图，缺失的道路和围墙不做虚构补全。',
                             '统一立面配色和住宅用地底色为示意，不能代表逐栋外立面或院内铺装实况。',
                             '小区标注为导航图层，并非真实楼顶招牌。']}
    result = {'buildingExtractSha256': hashlib.sha256(raw).hexdigest(), 'neighborhoods': neighborhoods, 'namedSites': named_sites,
              'surfaces': surfaces, 'barriers': barriers, 'audit': audit}
    (DATA / 'urban-context.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    (DATA / 'urban-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
