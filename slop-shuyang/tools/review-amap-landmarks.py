"""Local JS-API review with a server-side security-code proxy.

Pass {key, securityCode} as one JSON line on stdin. No credentials are stored or
logged. This is for the provided Web/JS key, not a Web Service API key.
"""
import json, sys, re
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qsl, urlencode
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tools/data/shuyang/landmark-amap-observations.json'
MAP_OUT = ROOT / 'tools/data/shuyang/map-view-observations.json'
# Official JS API security-proxy routes. Hosts cannot be supplied by a client.
UPSTREAMS = {
    **{p: 'https://restapi.amap.com/'+p for p in ('v3/place/text','v3/place/detail','v5/place/text','v5/place/detail')},
    'v4/map/styles': 'https://webapi.amap.com/v4/map/styles',
    'v3/vectormap': 'https://fmap01.amap.com/v3/vectormap',
}
MAP_PAGE = r'''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>沭阳在线地图核对</title>
<style>html,body{height:100%;margin:0;font:14px "Microsoft YaHei",sans-serif;background:#17232c;color:#f5f7f9}
header{box-sizing:border-box;height:100px;padding:10px 16px}h1{font-size:18px;margin:0 0 7px}button{padding:5px 12px;margin-right:8px;cursor:pointer}
#map{height:calc(100% - 100px)}#status{margin-left:12px}small{display:block;margin-top:7px;color:#c8d5df}</style>
<header><h1>沭阳在线地图核对</h1><button id="standard">标准地图</button><button id="satellite">卫星影像</button>
<label><input id="labels" type="checkbox">卫星路网标注</label><button id="save">保存当前核对范围</button><span id="status">正在加载地图…</span>
<small>官方在线图层，拍摄日期未公开。查询时间不作为影像拍摄时间，不自动等同于2026实景。</small></header><main id="map"></main>
<script>(async()=>{
const status=document.getElementById('status');
const clean=e=>String(e?.message||e).replace(/[a-fA-F0-9]{32}/g,'[凭据已隐去]');
try{
 const cfg=await(await fetch('/config')).json();
 window._AMapSecurityConfig={serviceHost:location.origin+'/_AMapService'};
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(cfg.key);s.onload=resolve;s.onerror=()=>reject(Error('地图服务加载失败'));document.head.append(s)});
 const normal=AMap.createDefaultLayer(),satellite=new AMap.TileLayer.Satellite(),roadNet=new AMap.TileLayer.RoadNet();
 const map=new AMap.Map('map',{center:cfg.mapCenter||[118.799,34.102],zoom:18,viewMode:'2D',rotation:0,pitch:0,layers:[normal]});
 let layer='standard';window.reviewMap=map;
 const apply=()=>{map.setLayers(layer==='satellite'?[satellite,...(document.getElementById('labels').checked?[roadNet]:[])]:[normal]);status.textContent='正在切换图层…';};
 document.getElementById('standard').onclick=()=>{layer='standard';apply()};
 document.getElementById('satellite').onclick=()=>{layer='satellite';apply()};
 document.getElementById('labels').onchange=()=>{if(layer==='satellite')apply()};
 map.on('complete',()=>{status.textContent='地图已加载，可核对建筑与道路';});
 for(const tile of [normal,satellite,roadNet])tile.on('complete',()=>{status.textContent='地图已加载，可核对建筑与道路';});
 document.getElementById('save').onclick=async()=>{
  const b=map.getBounds(),size=map.getSize(),center=map.getCenter();
  const data={provider:'AMap JS API official layers',coordinates:'GCJ-02',queriedAt:new Date().toISOString(),
   imageAcquired:null,dateNote:'Provider does not expose image acquisition date; retrieval time is not acquisition time.',
   layer,center:[center.lng,center.lat],zoom:map.getZoom(),rotation:map.getRotation(),pitch:map.getPitch(),
   size:[size.width,size.height],bounds:{southWest:[b.getSouthWest().lng,b.getSouthWest().lat],northEast:[b.getNorthEast().lng,b.getNorthEast().lat]}};
  const r=await fetch('/map-capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  status.textContent=r.ok?'已保存不含凭据的核对范围':'保存失败';
 };
}catch(e){status.textContent='地图核对失败：'+clean(e)}
})();</script></html>'''
PAGE = r'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>沭阳地标资料核对</title>
<style>body{font:16px "Microsoft YaHei",sans-serif;background:#13212b;color:#e8f0f3;padding:24px}article{margin:14px 0;padding:16px;border:1px solid #526570;border-radius:8px}a{color:#a9deff}img{max-width:260px;max-height:180px;margin:8px}p{line-height:1.6}</style>
<h1>沭阳地标资料核对</h1><p>通过高德地图 JS API 查询指定地标。安全密钥仅保存在本地代理进程中。</p>
<p id="status">正在加载高德地图服务…</p><main id="results"></main><footer>地点资料 © 高德地图；照片权利归原作者。本页用于建筑外形参考。</footer>
<script>
(async()=>{
 const cfg=await(await fetch('/config')).json();
 window._AMapSecurityConfig={serviceHost:location.origin+'/_AMapService'};
 let stage='加载SDK';
 try {
  await new Promise((resolve,reject)=>{let s=document.createElement('script');s.src='https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(cfg.key)+'&plugin=AMap.PlaceSearch';s.onload=resolve;s.onerror=()=>reject(Error('SDK_LOAD_FAILED'));document.head.append(s)});
  stage='加载地点检索插件';
  await new Promise(resolve=>AMap.plugin('AMap.PlaceSearch',resolve));
  stage='创建地点检索';
  const search=new AMap.PlaceSearch({city:'沭阳县',citylimit:true,pageSize:5,extensions:'all'});
  const records=[];
  for(const query of cfg.queries || ['沭阳大润发','沭阳吾悦广场','江苏省沭阳高级中学','沭阳虞姬公园','沭阳沭水之阳','沭阳老服装厂']) {
   stage='检索地点';
   document.querySelector('#status').textContent='正在核对：'+query;
   const r=await new Promise(resolve=>search.search(query,(status,result)=>resolve({status,result})));
   const pois=(r.result?.poiList?.pois||[]).map(p=>({id:p.id,name:p.name,address:p.address,city:p.cityname,district:p.adname,
    location:p.location?{lng:p.location.lng,lat:p.location.lat}:null,type:p.type,photos:(p.photos||[]).map(x=>({url:x.url,title:x.title||''}))}));
   records.push({query,queriedAt:new Date().toISOString(),status:r.status,info:typeof r.result==='string'?r.result:r.result?.info,pois});
   const article=document.createElement('article');const h=document.createElement('h2');h.textContent=query;article.append(h);
   for(const p of pois){const t=document.createElement('p');t.textContent=p.name+' · '+p.address;article.append(t);for(const photo of p.photos.slice(0,3)){const a=document.createElement('a');a.href=photo.url;a.target='_blank';a.rel='noopener';a.textContent='参考照片 '+(photo.title||'');article.append(a);const im=document.createElement('img');im.src=photo.url;im.alt=p.name+'参考照片';article.append(im)}}
   if(!pois.length){const t=document.createElement('p');t.textContent='状态：'+r.status+' / '+(records.at(-1).info||'无匹配');article.append(t)}
   document.querySelector('#results').append(article);
   const saved=await fetch('/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([records.at(-1)])});
   if(!saved.ok)throw Error('地点资料保存失败，HTTP '+saved.status);
   if(/(?:DAILY.*LIMIT|QUOTA|INVALID_USER|USERKEY_PLAT_NOMATCH)/i.test(records.at(-1).info||'')){
    document.querySelector('#status').textContent='已停止：地图服务返回配额或鉴权限制，现有资料已保留。';return;
   }
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  document.querySelector('#status').textContent='核对结束，已保存不含密钥的地点资料。';
 } catch(e) {
  const diagnostic=(e.stack||e.message||String(e)).replace(/[a-fA-F0-9]{32}/g,'[凭据已隐去]');
  document.querySelector('#status').textContent='服务核对失败（'+stage+'）：'+diagnostic;
 }
})();
</script></html>'''


def read_credentials(stream):
    # Windows pipes otherwise use the locale encoding (e.g. CP936). Node sends
    # UTF-8 JSON; mojibake can contain lone surrogates that break encodeURI in JS.
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8', errors='strict')
    credentials = json.loads(stream.readline())
    if not all(re.fullmatch('[a-fA-F0-9]{32}', credentials.get(k, '')) for k in ('key', 'securityCode')):
        raise SystemExit('Expected Web JS key and securityCode on stdin.')
    for q in credentials.get('queries') or []:
        if not isinstance(q,str): raise ValueError('Queries must be strings.')
        q.encode('utf-8',errors='strict')
    return credentials


def main():
    credentials = read_credentials(sys.stdin)
    if credentials.get('skipCompleted') and OUT.exists():
        completed={r['query'] for r in json.loads(OUT.read_bytes()).get('queries',[]) if r.get('status')=='complete'}
        credentials['queries']=[q for q in credentials.get('queries',[]) if q not in completed]
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def send(self, data, mime='application/json', status=200):
            self.send_response(status); self.send_header('Content-Type', mime)
            self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(data)
        def do_GET(self):
            u = urlsplit(self.path)
            if u.path == '/': return self.send(PAGE.encode(), 'text/html; charset=utf-8')
            if u.path == '/map': return self.send(MAP_PAGE.encode(), 'text/html; charset=utf-8')
            if u.path == '/config': return self.send(json.dumps({'key': credentials['key'],'queries':credentials.get('queries'),'mapCenter':credentials.get('mapCenter')}).encode())
            if u.path.startswith('/_AMapService/'):
                endpoint = u.path[len('/_AMapService/'):]
                if endpoint not in UPSTREAMS:
                    return self.send(b'{"error":"unsupported endpoint"}', status=403)
                params = [(k,v) for k,v in parse_qsl(u.query) if k not in ('jscode',)]
                params.append(('jscode', credentials['securityCode']))
                try:
                    proxy = credentials.get('proxy')
                    r = requests.get(UPSTREAMS[endpoint], params=params, timeout=40,
                                     proxies={'http':proxy,'https':proxy} if proxy else None)
                    return self.send(r.content, r.headers.get('Content-Type','application/json'), r.status_code)
                except requests.RequestException:
                    return self.send(b'{"error":"upstream unavailable"}', status=502)
            return self.send(b'{}', status=404)
        def do_POST(self):
            if self.path not in ('/capture','/map-capture'): return self.send(b'{}', status=404)
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size < 2_000_000: return self.send(b'{}', status=400)
            data = self.rfile.read(size)
            # Never persist either credential, even if an upstream error echoes it.
            if any(credentials[k].encode() in data for k in ('key','securityCode')): return self.send(b'{"error":"credential rejected"}', status=400)
            try: records = json.loads(data)
            except ValueError: return self.send(b'{}', status=400)
            if self.path == '/map-capture':
                if not isinstance(records,dict) or records.get('coordinates')!='GCJ-02':return self.send(b'{}',status=400)
                previous=json.loads(MAP_OUT.read_bytes()).get('views',[]) if MAP_OUT.exists() else []
                MAP_OUT.write_text(json.dumps({'provider':'AMap JS API','views':previous+[records]},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
                return self.send(b'{"ok":true}')
            previous=json.loads(OUT.read_bytes()).get('queries',[]) if OUT.exists() else []
            merged={r['query']:r for r in previous};merged.update({r['query']:r for r in records})
            OUT.write_text(json.dumps({'provider':'AMap JS API','coordinates':'GCJ-02','queries':list(merged.values())},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            self.send(b'{"ok":true}')
    print('Landmark review: http://127.0.0.1:8124/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8124), Handler).serve_forever()


if __name__ == '__main__': main()
