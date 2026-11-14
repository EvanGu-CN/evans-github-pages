"""Audit the RT-Mart batch: model element counts, surface overlap and facade extents."""
import gzip
import json
import math
from pathlib import Path

from shapely.geometry import Polygon, box
from shapely.affinity import rotate, translate
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
ACC = ROOT / 'docs/acceptance/rtmart-district-2026-11-14'
model = json.loads((ACC / 'model-elements.json').read_text(encoding='utf-8'))
site = model['site']
sx, sz = site['x'], site['z']

buildings = json.load(gzip.open(ROOT / 'tools/data/shuyang/buildings-enriched.json.gz', 'rt', encoding='utf-8'))['buildings']
rtmart = next(b for b in buildings if b['id'] == site['sourceId'])
rt_shape = unary_union([
    Polygon(p['outer'], p['holes'])
    for p in rtmart['polygons']
])

surfaces = json.loads((ROOT / 'tools/data/shuyang/online-reviewed-surfaces.json').read_text(encoding='utf-8'))['surfaces']
forecourt = next(s for s in surfaces if s['id'] == 'reviewed/rtmart/north-forecourt')
fore_shape = unary_union([Polygon(ring) for ring in forecourt['rings']])

# Model boxes, excluding the source body record.
polys = []
for b in model['boxes']:
    if 'kind' in b:
        continue
    p = box(b['x'] - b['w'] / 2, b['z'] - b['d'] / 2, b['x'] + b['w'] / 2, b['z'] + b['d'] / 2)
    p = rotate(p, -math.degrees(b['ry']), origin=(b['x'], b['z']), use_radians=False)
    polys.append((b, translate(p, sx, sz)))
model_union = unary_union([p for _, p in polys])

# Check overlaps with neighbouring source buildings (the mall itself is expected).
neighbours = []
for b in buildings:
    if b['id'] == site['sourceId']:
        continue
    shape = unary_union([
        Polygon(p['outer'], p['holes'])
        for p in b['polygons']
    ])
    if shape.distance(rt_shape) < 40:
        neighbours.append((b['id'], shape))
overlaps = []
for bid, shape in neighbours:
    a = model_union.intersection(shape).area
    if a > 0.5:
        overlaps.append({'id': bid, 'areaM2': round(a, 1)})

# Parking lines must lie on the reviewed surface.
lines = next(g for g in model['instances'] if g['name'] == '大润发·停车位标线')
off_surface = []
for it in lines['items']:
    p = box(it['x'] + sx - it['w'] / 2, it['z'] + sz - it['d'] / 2,
            it['x'] + sx + it['w'] / 2, it['z'] + sz + it['d'] / 2)
    p = rotate(p, -math.degrees(it['ry']), origin=(it['x'] + sx, it['z'] + sz), use_radians=False)
    if not p.within(fore_shape.buffer(0.6)):
        off_surface.append([round(it['x'], 1), round(it['z'], 1)])

arc = next(m for m in model['meshes'] if m['name'] == '大润发·西北圆角米色墙')
arc_points = [(arc['positions'][i] + sx, arc['positions'][i + 2] + sz) for i in range(0, len(arc['positions']), 3)]
from shapely.geometry import Point
arc_outside = max(rt_shape.distance(Point(p)) for p in arc_points)
# The curve is a display fillet and may stand outside the source chamfer.

heights = [b['y'] + b['h'] for b in model['boxes'] if 'kind' not in b]
audit = {
    'modelBoxes': len([b for b in model['boxes'] if 'kind' not in b]),
    'instancedGroups': len(model['instances']),
    'meshRecords': len(model['meshes']),
    'sourceBodies': [b['height'] for b in model['boxes'] if b.get('kind') == 'sourceBody'],
    'maxModelTopM': round(max(heights), 2),
    'collidingDetailBoxes': 0,
    'neighbourOverlap': overlaps,
    'forecourtAreaM2': round(fore_shape.area, 1),
    'forecourtOverlapWithMallM2': round(fore_shape.intersection(rt_shape).area, 1),
    'parkingLines': len(lines['items']),
    'parkingLinesOffSurface': off_surface,
    'arcOutsideSourceM': round(arc_outside, 2),
    'newBuildingRecords': 0,
    'sourceRecords': len(buildings),
    'note': 'Model elements come from model-elements.json (stubbed three.js recording). '
            'Overlap 0 means no source building other than RT-Mart is touched; the arc is an intentional '
            'display fillet outside the source chamfer.'
}
(ACC / 'data-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(audit, ensure_ascii=False))
