"""Check estate membership and ensure mapped ground does not intersect buildings."""
import gzip, json
from pathlib import Path
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree

DATA = Path(__file__).resolve().parent / 'data/shuyang'


def polygon(p):
    ring = lambda flat: list(zip(flat[::2], flat[1::2]))
    return Polygon(ring(p['outer']), [ring(h) for h in p['holes']])


def main():
    urban = json.loads((DATA / 'urban-context.json').read_bytes())
    rows = json.loads(gzip.decompress((DATA / 'buildings-enriched.json.gz').read_bytes()))['buildings']
    buildings = [unary_union([Polygon(p['outer'], p['holes']) for p in b['polygons']]) for b in rows]
    tree = STRtree(buildings)
    assigned, ratios = set(), []
    for n in urban['neighborhoods']:
        geom = unary_union([polygon(p) for p in n['polygons']])
        assert geom.is_valid and geom.covers(Point(n['x'], n['z'])), n['name']
        for i in n['buildings']:
            ratio = geom.intersection(buildings[i]).area / buildings[i].area
            assert ratio > .599, (n['name'], i, ratio)
            assert i not in assigned, (n['name'], i)
            assigned.add(i)
            ratios.append(ratio)
    max_overlap = 0
    for s in urban['surfaces']:
        for p in s['polygons']:
            geom = polygon(p)
            assert geom.is_valid, s['id']
            for i in tree.query(geom):
                max_overlap = max(max_overlap, geom.intersection(buildings[int(i)]).area)
    assert max_overlap < .1, max_overlap
    print(json.dumps({'namedNeighborhoods': len(urban['neighborhoods']), 'assignedBuildings': len(assigned),
                      'minimumMembershipCoverage': min(ratios), 'maximumSurfaceBuildingOverlapM2': max_overlap,
                      'buildingExtractSha256': urban['buildingExtractSha256'], 'snapshots': urban['audit']['snapshots']}, indent=2))


if __name__ == '__main__':
    main()
