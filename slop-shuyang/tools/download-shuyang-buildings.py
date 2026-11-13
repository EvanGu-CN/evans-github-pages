"""Download a pinned Overture release with the exact simulation extent.

PyArrow's S3 client requires an explicit proxy (HTTPS_PROXY alone isn't enough).
Only bounding-box intersecting rows are saved. No keys or account are required.
"""
import os, json, math, io, sys
import overturemaps.core as core
import pyarrow.fs as fs
import pyarrow.parquet as pq
import pyarrow.compute as pc
import requests
from pathlib import Path
from shapely import from_wkb
from shapely.geometry import mapping

data = Path(__file__).resolve().parent / 'data/shuyang'
lat, lon = 34.1285, 118.7740
kx, ky = 111320 * math.cos(math.radians(lat)), 110574
bounds = [lon-3200/kx, lat-5000/ky, lon+3400/kx, lat+2400/ky]
proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
core._s3_filesystem = lambda *a, **kw: fs.S3FileSystem(
    anonymous=True, region='us-west-2', connect_timeout=20, request_timeout=60,
    **({'proxy_options': proxy} if proxy else {}))
print('Querying pinned Overture 2026-10-21.0', bounds, flush=True)
from overturemaps.models import BBox
files = core._get_files_from_stac('buildings', 'building', BBox(xmin=bounds[0], ymin=bounds[1], xmax=bounds[2], ymax=bounds[3]), '2026-10-21.0')
if files is None:
    raise SystemExit('STAC index unavailable; refusing a planet-wide scan.')


class AzureRangeFile(io.RawIOBase):
    """Read the official Azure mirror with HTTP byte ranges, without S3 credentials."""
    def __init__(self, path):
        self.url = 'https://overturemapswestus2.blob.core.windows.net/' + path.split('/', 1)[1]
        self.session = requests.Session()
        # SHUYANG_DATA_PROXY is optional; direct Azure access is usually faster in China.
        self.session.trust_env = False
        if os.environ.get('SHUYANG_DATA_PROXY'):
            self.session.proxies = {'https': os.environ['SHUYANG_DATA_PROXY']}
        response = self.session.head(self.url, timeout=30)
        response.raise_for_status()
        self.size, self.pos = int(response.headers['Content-Length']), 0

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos+offset if whence == 1 else self.size+offset
        return self.pos
    def read(self, n=-1):
        n = self.size-self.pos if n < 0 else min(n, self.size-self.pos)
        if n <= 0: return b''
        response = self.session.get(self.url, headers={'Range': f'bytes={self.pos}-{self.pos+n-1}'}, timeout=90)
        response.raise_for_status()
        if response.status_code != 206 or len(response.content) != n:
            raise IOError('Mirror did not honor the requested byte range.')
        self.pos += n
        return response.content


def batches():
    if '--azure' not in sys.argv:
        dataset, expression = core._prepare_query('building', bbox=bounds, release='2026-10-21.0')
        columns = [c for c in ['id', 'geometry', 'names', 'height', 'num_floors', 'class', 'subtype',
                              'roof_shape', 'roof_height', 'min_height', 'is_underground', 'confidence', 'sources']
                   if c in dataset.schema.names]
        yield from dataset.to_batches(columns=columns, filter=expression, batch_size=4096)
        return
    for filename in files:
        print('Reading mirror metadata', filename.rsplit('/',1)[-1], flush=True)
        pf = pq.ParquetFile(AzureRangeFile(filename))
        columns = [c for c in ['id', 'geometry', 'names', 'height', 'num_floors', 'class', 'subtype',
                              'roof_shape', 'roof_height', 'min_height', 'is_underground', 'confidence', 'sources', 'bbox']
                   if c in pf.schema_arrow.names]
        for j in range(pf.metadata.num_row_groups):
            rg = pf.metadata.row_group(j)
            stats = {rg.column(k).path_in_schema: rg.column(k).statistics for k in range(rg.num_columns)}
            if stats['bbox.xmin'].min > bounds[2] or stats['bbox.xmax'].max < bounds[0] or stats['bbox.ymin'].min > bounds[3] or stats['bbox.ymax'].max < bounds[1]:
                continue
            print('Reading intersecting row group', j, flush=True)
            table = pf.read_row_group(j, columns=columns)
            expression = ((pc.field('bbox','xmin') < bounds[2]) & (pc.field('bbox','xmax') > bounds[0]) &
                          (pc.field('bbox','ymin') < bounds[3]) & (pc.field('bbox','ymax') > bounds[1]))
            yield from table.filter(expression).to_batches()

features = []
for batch in batches():
    for r in batch.to_pylist():
        g = from_wkb(r.pop('geometry'))
        features.append({'type': 'Feature', 'geometry': mapping(g), 'properties': r})
    print('Downloaded', len(features), 'buildings', flush=True)
if not features:
    raise SystemExit('Empty download; existing extract left intact.')
target = data / 'overture-buildings.geojson'
tmp = target.with_suffix('.tmp')
tmp.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
tmp.replace(target)
print('Saved', target, flush=True)
