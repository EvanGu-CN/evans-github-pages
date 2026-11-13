"""Refresh the complete city frame, validate all responses, then replace snapshots.

No synthetic roads/buildings are added. Construction and planned features remain
source records and are filtered by the offline build, not treated as open roads.
"""
import concurrent.futures, hashlib, json, os, sys
from pathlib import Path
from datetime import datetime, timezone
import requests

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data/shuyang'
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
BBOX = '34.08,118.72,34.175,118.85'


def query(selectors, mode='geom tags'):
    return '[out:json][timeout:180];\n(\n' + '\n'.join(f'  {s}({BBOX});' for s in selectors) + f'\n);\nout {mode};\n'


QUERIES = {
    'roads': query(['way["highway"]']),
    'buildings': query(['way["building"]', 'relation["building"]']),
    'building_parts': query(['way["building:part"]', 'relation["building:part"]']),
    'landmark_sites': query(['way["amenity"="school"]["name"="江苏省沭阳高级中学"]']),
    'land': query(['way["leisure"]', 'relation["leisure"]', 'way["landuse"]', 'relation["landuse"]', 'way["natural"~"wood|scrub|grassland|heath|beach"]']),
    'places': query(['nwr["place"]'], 'center tags'),
    'pois': query(['nwr["name"]["amenity"]', 'nwr["name"]["shop"]', 'nwr["name"]["office"]',
                   'nwr["name"]["tourism"]', 'nwr["name"]["historic"]', 'nwr["name"]["leisure"]',
                   'nwr["name"]["building"]', 'nwr["name"]["railway"="station"]'], 'center tags'),
    'urban_features': query(['way["barrier"~"wall|fence|hedge|retaining_wall"]', 'node["barrier"~"gate|lift_gate|entrance|bollard"]',
                             'node["entrance"]', 'way["amenity"="parking"]', 'way["highway"="pedestrian"]["area"="yes"]',
                             'way["landuse"="grass"]', 'way["natural"="scrub"]', 'way["leisure"="garden"]',
                             'way["landcover"~"grass|trees"]'])
}


def download(item):
    name, q = item
    session = requests.Session()
    previous = DATA / f'osm_{name}.json'
    old = json.loads(previous.read_bytes()) if previous.exists() else None
    minimum = (old or {}).get('osm3s', {}).get('timestamp_osm_base', '')
    if not minimum:
        minimum = json.loads((DATA / 'osm_roads.json').read_bytes()).get('osm3s', {}).get('timestamp_osm_base', '')
    for endpoint in ENDPOINTS:
        try:
            response = session.post(endpoint, data={'data': q}, timeout=210,
                                    headers={'User-Agent': 'Shuyang-city-open-data/1.0'})
            response.raise_for_status()
            payload = response.json()
            if payload.get('remark') or not isinstance(payload.get('elements'), list):
                raise ValueError(str(payload.get('remark', 'invalid response')))
            stamp = payload.get('osm3s', {}).get('timestamp_osm_base', '')
            if stamp < minimum:
                raise ValueError(f'Stale mirror {stamp}; keeping minimum snapshot {minimum}')
            print(name, len(payload['elements']), payload.get('osm3s', {}).get('timestamp_osm_base'), flush=True)
            raw = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()
            return name, raw, {'features': len(payload['elements']), 'timestamp': payload.get('osm3s', {}).get('timestamp_osm_base'),
                               'sha256': hashlib.sha256(raw).hexdigest(), 'endpoint': endpoint}
        except (requests.RequestException, ValueError) as e:
            print(name, endpoint, type(e).__name__, str(e)[:160], flush=True)
    if old:
        raw = previous.read_bytes()
        print(name, 'keeping newer local snapshot', minimum, flush=True)
        return name, raw, {'features': len(old['elements']), 'timestamp': minimum,
                           'sha256': hashlib.sha256(raw).hexdigest(), 'status': 'retained-newer-local'}
    raise RuntimeError('No fresh valid response for '+name+'; snapshots were not replaced.')


def main():
    selected = {k:v for k,v in QUERIES.items() if not sys.argv[1:] or k in sys.argv[1:]}
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(download, selected.items()):
            results.append(result)
    # Stage all responses only after every requested query has passed validation.
    for name, raw, meta in results:
        (DATA / f'osm_{name}.json.tmp').write_bytes(raw)
    for name, raw, meta in results:
        (DATA / f'osm_{name}.json.tmp').replace(DATA / f'osm_{name}.json')
        if meta.get('status') != 'retained-newer-local':
            (DATA / f'q_{name}.overpassql').write_text(selected[name], encoding='utf-8')
    previous_manifest = DATA / 'osm-refresh.json'
    snapshots = json.loads(previous_manifest.read_bytes()).get('snapshots', {}) if previous_manifest.exists() else {}
    snapshots.update({name:meta for name,raw,meta in results})
    manifest = {'retrievedAt': datetime.now(timezone.utc).isoformat(), 'requestedBoundsWgs84': [118.72,34.08,118.85,34.175],
                'license': 'ODbL 1.0', 'attribution': '© OpenStreetMap contributors',
                'snapshots': snapshots}
    (DATA / 'osm-refresh.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
