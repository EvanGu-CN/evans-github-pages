"""Clip the official CNBH 2020 GeoTIFF using HTTP ranges; save no regional archive.

Optional proxy: GDAL_HTTP_PROXY=host:port. Pixel size is 10 m, not height accuracy.
"""
import os, json
from pathlib import Path
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
import requests

DATA = Path(__file__).resolve().parent / 'data/shuyang'
FILE = 'CNBH10m_X119Y35.tif'
URL = f'https://zenodo.org/api/records/7923866/files/{FILE}/content'
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
os.environ.setdefault('GDAL_HTTP_TIMEOUT', '45')
with rasterio.open('/vsicurl/' + URL) as source:
    # Slightly expanded WGS84 bounds contain the rotated UTM crop of the core.
    bounds = transform_bounds('EPSG:4326', source.crs, 118.739, 34.083, 118.811, 34.151)
    window = from_bounds(*bounds, source.transform).round_offsets().round_lengths()
    a = source.read(1, window=window)
    profile = source.profile
    profile.update(width=a.shape[1], height=a.shape[0], transform=source.window_transform(window), compress='deflate')
    with rasterio.open(DATA / 'cnbh-2020-core.tif', 'w', **profile) as output:
        output.write(a, 1)
response = requests.get('https://zenodo.org/api/records/7923866', timeout=45)
response.raise_for_status()
record = response.json()
meta = {k: record['metadata'].get(k) for k in ['title', 'creators', 'license', 'doi', 'publication_date']}
meta['file'] = next(f for f in record['files'] if f['key'] == FILE)
(DATA / 'cnbh-source.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print('Saved 10 m CNBH crop in', source.crs, a.shape)
