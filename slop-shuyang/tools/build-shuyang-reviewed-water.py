"""Convert reviewed, dated image-pixel shoreline traces into the city's metre frame.

The source photograph is a local research reference, not a distributed texture.
The retained vectors and source metadata make this conversion reproducible.
"""
import json, math, hashlib
from pathlib import Path
from shapely.geometry import Polygon

DATA = Path(__file__).resolve().parent / 'data' / 'shuyang'


def main():
    raw = (DATA / 'nanhu-water-traces.json').read_bytes()
    data = json.loads(raw)
    ref = data['reference']
    x0, y0, x1, y1 = ref['extent3857']
    width, height = ref['imageSize']
    kx = 111320 * math.cos(math.radians(34.1285))

    def world(p):
        mx = x0 + p[0] / width * (x1 - x0)
        my = y1 - p[1] / height * (y1 - y0)
        lon = math.degrees(mx / 6378137)
        lat = math.degrees(2 * math.atan(math.exp(my / 6378137)) - math.pi / 2)
        return [round((lon - 118.7740) * kx, 1), round(-(lat - 34.1285) * 110574, 1)]

    polygons = []
    for i, p in enumerate(data['polygons']):
        rings = [[world(v) for v in r] for r in p['rings']]
        g = Polygon(rings[0], rings[1:])
        assert g.is_valid and g.area > 100, 'Invalid reviewed water geometry'
        polygons.append({'id': f'reviewed/nanhu/water/{i+1}', 'name': '南湖',
                         'kind': 'lake', 'source': 'ReviewedImagery',
                         'imageAcquired': ref['imageAcquired'],
                         'area': round(g.area), 'rings': rings})
    plazas = [{'id':p['id'],'name':p['name'],'outer':[world(v) for v in p['pixels']]} for p in data.get('plazas',[])]
    result = {'reference': ref, 'traceSha256': hashlib.sha256(raw).hexdigest(), 'polygons': polygons,
              'plazas':plazas,'southArrival':world(data['southArrivalPixels']), 'lakeView':world(data['lakeViewPixels'])}
    (DATA / 'reviewed-water.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    print(json.dumps({'waterPolygons': len(polygons), 'islandHoles': sum(len(p['rings'])-1 for p in polygons),
                      'waterArea': sum(p['area'] for p in polygons), 'imageAcquired': ref['imageAcquired']}))


if __name__ == '__main__':
    main()
