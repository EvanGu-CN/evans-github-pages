"""Add inter-row planting strips inside 沃德嘉园 so the residential base is not bare.

Each strip sits in the outer half of the yard in front of a mapped row building
(3.6-6.2 m clear of the facade), beyond the hedge/apron band js/wode-district.js
builds next to the wall, so the two layers never overlap.
Strips are clipped against every source building and against each other, so no two
coplanar green polygons overlap (which would z-fight) and nothing covers a facade.

Coordinates are written as pixels of the reviewed frame `amap-wode-rtmart-20261113`,
the same way the corridor review stored its surfaces; the pipeline converts them
back to metres. No building footprint is added or replaced.
"""
import gzip
import json
import math
import runpy
from pathlib import Path

from shapely import make_valid
from shapely.affinity import rotate, translate
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'tools/data/shuyang'

helpers = runpy.run_path(str(ROOT / 'tools/enrich-shuyang-buildings.py'))
w2g = runpy.run_path(str(ROOT / 'tools/china-coordinates.py'))['wgs84_to_gcj02']
LAT, LON, KX, KY = helpers['LAT'], helpers['LON'], helpers['KX'], helpers['KY']

traces_path = DATA / 'online-district-traces.json'
traces = json.loads(traces_path.read_bytes())
ref = next(r for r in traces['additionalReferences'] if r['id'] == 'amap-wode-rtmart-20261113')
(west, south), (east, north) = ref['bounds']['southWest'], ref['bounds']['northEast']
W, H = ref['size']
ox, oy = ref['mapOffset']
my0 = math.log(math.tan(math.pi / 4 + math.radians(north) / 2))
my1 = math.log(math.tan(math.pi / 4 + math.radians(south) / 2))


def to_pixel(x, z):
    lon = LON + x / KX
    lat = LAT - z / KY
    glon, glat = w2g(lon, lat)
    mx = math.log(math.tan(math.pi / 4 + math.radians(glat) / 2))
    return [round((glon - west) / (east - west) * W + ox, 1),
            round((my0 - mx) / (my0 - my1) * H + oy, 1)]


buildings = json.loads(gzip.decompress((DATA / 'buildings-enriched.json.gz').read_bytes()))['buildings']
urban = json.loads((DATA / 'urban-context.json').read_bytes())
hood = next(n for n in urban['neighborhoods'] if '沃德' in n['name'])
ring = hood['polygons'][0]['outer']
hood_poly = Polygon([(ring[i], ring[i + 1]) for i in range(0, len(ring), 2)])

# Only the row buildings the district module details get strips: residential
# storey blocks with a long axis, inside the estate boundary.
shapes = {}
for b in buildings:
    if b['category'] not in ('residential', 'house') or b['height'] < 8:
        continue
    g = make_valid(unary_union([Polygon(p['outer'], p['holes']) for p in b['polygons']]))
    if g.is_empty:
        continue
    if not hood_poly.contains(g.centroid):
        continue
    rect = g.minimum_rotated_rectangle
    pts = list(rect.exterior.coords)[:-1]
    if len(pts) != 4:
        continue
    edges = [(pts[(i + 1) % 4][0] - pts[i][0], pts[(i + 1) % 4][1] - pts[i][1]) for i in range(4)]
    lens = [math.hypot(dx, dz) for dx, dz in edges]
    if max(lens) < 16 or min(lens) < 5:
        continue
    shapes[b['id']] = (g, rect, max(lens))

print('row buildings', len(shapes))

# Perimeter band already has its own planting; strips must not overlap it.
perimeter = []
for s in traces['surfaces']:
    if s['id'].startswith('reviewed/wode/perimeter-'):
        perimeter.append(Polygon(s['rings'][0]))
perimeter_union = unary_union(perimeter) if perimeter else None

STRIP_DEPTH = 2.6
STRIP_CLEAR = 3.6  # outside the hedge/apron band built by js/wode-district.js
blocked = unary_union([g.buffer(0.25) for g, _, _ in shapes.values()])
written = []
strips = []
for bid, (g, rect, long_len) in shapes.items():
    pts = list(rect.exterior.coords)[:-1]
    # Long axis = edge 0-1 (shapely orders the rectangle consistently enough).
    best = None
    for i in range(4):
        j = (i + 1) % 4
        dx, dz = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
        L = math.hypot(dx, dz)
        if not best or L > best[0]:
            best = (L, i, j, dx / L, dz / L)
    _, i, j, ux, uz = best
    vx, vz = -uz, ux
    cx = (pts[i][0] + pts[j][0]) / 2
    cz = (pts[i][1] + pts[j][1]) / 2
    width = min(abs(pts[(i + 2) % 4][0] - pts[i][0]) * abs(ux) + abs(pts[(i + 2) % 4][1] - pts[i][1]) * abs(uz), 30)
    for side in (1, -1):
        # rect centred between the wall and STRIP_CLEAR+STRIP_DEPTH outboard
        mid = STRIP_CLEAR + STRIP_DEPTH / 2
        px_, pz_ = cx + vx * side * mid, cz + vz * side * mid
        strip = box(-best[0] / 2 + 1, -STRIP_DEPTH / 2, best[0] / 2 - 1, STRIP_DEPTH / 2)
        strip = rotate(strip, math.degrees(math.atan2(uz, ux)), origin=(0, 0), use_radians=False)
        strip = translate(strip, px_, pz_)
        strip = make_valid(strip.difference(blocked))
        if perimeter_union is not None:
            strip = strip.difference(perimeter_union)
        for prev in written:
            if strip.is_empty:
                break
            strip = strip.difference(prev)
        if strip.is_empty:
            continue
        parts = list(strip.geoms) if strip.geom_type == 'MultiPolygon' else [strip]
        for part in parts:
            if part.area < 25:
                continue
            written.append(part)
            strips.append((bid, side, part))

print('strips', len(strips), 'area', round(sum(p.area for _, _, p in strips), 1))

traces['surfaces'] = [s for s in traces['surfaces'] if not s['id'].startswith('reviewed/wode/row-green')]
for idx, (bid, side, part) in enumerate(strips):
    traces['surfaces'].append({
        'id': f'reviewed/wode/row-green-{idx:03d}',
        'kind': 'green',
        'name': '沃德嘉园楼间绿化',
        'sourceSiteId': bid,
        'referenceId': 'amap-wode-rtmart-20261113',
        'rings': [[to_pixel(x, z) for x, z in part.exterior.coords[:-1]]],
        'appearanceSource': 'Strip geometry derived from mapped row footprints and the AMap native screenshot 2026-11-13; the planting depth is a display estimate, species and kerb unknown, capture date unpublished.'
    })
traces_path.write_text(json.dumps(traces, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print('surfaces', len(traces['surfaces']))
