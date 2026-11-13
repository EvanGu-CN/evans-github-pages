"""Local visual QA overlay; the imagery stays in ignored reference storage."""
import json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'tools/data/shuyang/wuyue-roof-traces.json').read_bytes())
items=[]
for g in data['groups']:
 observations=[]
 for i,r in enumerate(g.get('runs',[])):
  ax,ay,bx,by,d=r;L=math.hypot(bx-ax,by-ay);nx=-(by-ay)/L*d;ny=(bx-ax)/L*d
  points=[(ax,ay),(bx,by),(bx+nx,by+ny),(ax+nx,ay+ny)]
  observations.append((str(i+1),points))
 for outline in g.get('outlines',[]):observations.append((outline['id'],outline['pixels']))
 for ident,points in observations:
  ax,ay=points[0]
  items.append(f'<g><polygon points="'+ ' '.join(f'{x:.1f},{y:.1f}' for x,y in points)+f'"/><text x="{ax}" y="{ay+8}">{g["id"]}-{ident}</text></g>')
html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>吾悦片区屋顶描摹核对</title>
<style>body{margin:0;background:#12191c;color:white;font:14px sans-serif}header{position:sticky;top:0;background:#13212b;padding:10px;z-index:2}svg{width:1536px;height:1536px}polygon{fill:#ff303022;stroke:#ff304b;stroke-width:1.5}text{font-size:10px;fill:white;paint-order:stroke;stroke:#111;stroke-width:2px}input:not(:checked)~svg g{display:none}</style>
<header>吾悦片区屋顶逐条核对 · 影像拍摄于2021-01-29，服务发布2026.R05 · 红框须与真实屋顶重合，庭院/阴影不能当建筑</header>
<input type="checkbox" checked id="show"><label for="show">显示描摹</label><svg viewBox="0 0 1536 1536"><image href="../../../tools/data/shuyang/reference/wuyue-20210129.jpg" width="1536" height="1536"/>'''+''.join(items)+'</svg></html>'
out=ROOT/'docs/acceptance/wuyue-district-2026-11-13/roof-review.html';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(html,encoding='utf8');print(out)
