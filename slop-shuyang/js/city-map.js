import { GEO } from './shuyang-geodata.js';
import { BUILDING_PHOTO_BY_SOURCE } from './building-photo-references.js';
import {
  ROADS,
  BLOCKS,
  PARKS,
  NEIGHBORHOODS,
  LANDMARKS,
  LANDMARK_SITES,
  ISLAND_BOUNDS,
  WATER_POLYGONS,
  getLocationLabel,
  isTypingInField
} from './city-config.js';

// 沭阳城区纯矢量地图（A 方案）：小地图与全屏街道图。
// 图层：水面/河道、街区、公园、全部道路与步道、铁路、实测建筑、地标、POI、路名、
// 社区/村庄、比例尺与 OSM 署名。数据与 3D 场景同源，不依赖外部瓦片。

const FONT = '"Microsoft YaHei", "PingFang SC", Inter, -apple-system, sans-serif';
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 4.5;
const RADAR_SCALE = 0.32;
const INDEX_CELL = 500;

function externalMapLinks(name = '沭阳县') {
  const q = name.trim() || '沭阳县';
  return {
    amap: `https://uri.amap.com/search?keyword=${encodeURIComponent(q)}&city=${encodeURIComponent('沭阳县')}&view=map&src=shuyang-city&callnative=0`,
    baidu: `https://api.map.baidu.com/place/search?query=${encodeURIComponent(q)}&region=${encodeURIComponent('沭阳县')}&output=html&src=webapp.shuyang-city`
  };
}

// World headings: zero faces south, +π/2 east; map north stays at the top.
function headingDirection(heading = 0) {
  const directions = ['南', '东南', '东', '东北', '北', '西北', '西', '西南'];
  return directions[((Math.round(heading / (Math.PI / 4)) % 8) + 8) % 8];
}

const C = {
  land: '#121820',
  water: '#173c55',
  waterEdge: '#24506c',
  block: '#1a2129',
  blockEdge: '#222b35',
  park: '#1c3527',
  parkEdge: '#2a4a36',
  building: '#343d49',
  buildingTall: '#4b5766',
  buildingEdge: '#1b222b',
  road: '#4a545f',
  roadMajor: '#707b88',
  highway: '#b9853d',
  roadEdge: '#252d36',
  path: '#37414a',
  rail: '#59636d',
  bridge: '#c08a3e',
  landmark: '#ffd36b',
  player: '#ffc21a',
  route: '#ffc21a',
  text: '#e3e9ef',
  textDim: 'rgba(210,220,230,0.62)',
  roadText: 'rgba(190,202,214,0.72)',
  waterText: 'rgba(130,190,225,0.72)'
};

const flatBBox = (flat) => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    if (flat[i] < x0) x0 = flat[i];
    if (flat[i] > x1) x1 = flat[i];
    if (flat[i + 1] < z0) z0 = flat[i + 1];
    if (flat[i + 1] > z1) z1 = flat[i + 1];
  }
  return [x0, z0, x1, z1];
};
const ringBBox = (ring) => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of ring) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.z < z0) z0 = p.z;
    if (p.z > z1) z1 = p.z;
  }
  return [x0, z0, x1, z1];
};
const ringCentroid = (ring) => {
  let x = 0, z = 0;
  for (const p of ring) { x += p.x; z += p.z; }
  return { x: x / ring.length, z: z / ring.length };
};
const flatCentroid = (flat, id) => {
  const b = flatBBox(flat);
  if (id === undefined) return { x: (b[0] + b[2]) / 2, z: (b[1] + b[3]) / 2 };
  return { x: flat[id * 2], z: flat[id * 2 + 1] };
};
const pointAt = (flat, t) => {
  const n = flat.length / 2;
  const i = Math.max(0, Math.min(n - 2, Math.floor(t * (n - 1))));
  return { x: flat[i * 2], z: flat[i * 2 + 1], nx: flat[(i + 1) * 2], nz: flat[(i + 1) * 2 + 1] };
};

function makeIndex(items) {
  const grid = new Map();
  items.forEach((it, i) => {
    const [x0, z0, x1, z1] = it.bb;
    for (let ix = Math.floor(x0 / INDEX_CELL); ix <= Math.floor(x1 / INDEX_CELL); ix++) {
      for (let iz = Math.floor(z0 / INDEX_CELL); iz <= Math.floor(z1 / INDEX_CELL); iz++) {
        const k = ix * 100003 + iz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  });
  return grid;
}
function queryIndex(grid, items, rect) {
  const out = new Set();
  for (let ix = Math.floor(rect.minX / INDEX_CELL); ix <= Math.floor(rect.maxX / INDEX_CELL); ix++) {
    for (let iz = Math.floor(rect.minZ / INDEX_CELL); iz <= Math.floor(rect.maxZ / INDEX_CELL); iz++) {
      const list = grid.get(ix * 100003 + iz);
      if (list) for (const i of list) out.add(i);
    }
  }
  const result = [];
  for (const i of out) result.push(items[i]);
  return result;
}
const inRect = (bb, r) => !(bb[2] < r.minX || bb[0] > r.maxX || bb[3] < r.minZ || bb[1] > r.maxZ);

// 道路：机动车道 + 地图专用步道
const ROAD_ITEMS = ROADS.map((r) => {
  const flat = [];
  for (const p of r.pts) flat.push(p.x, p.z);
  return { flat, bb: flatBBox(flat), name: r.name, short: r.short, kind: r.kind, w: r.w, bridge: r.bridge };
});
const PATH_ITEMS = (GEO.mapPaths || []).map(([name, kind, w, bridge, flat]) => ({
  flat, bb: flatBBox(flat), name, short: name, kind, w, bridge: !!bridge
}));
const ROAD_INDEX = makeIndex(ROAD_ITEMS);
const PATH_INDEX = makeIndex(PATH_ITEMS);

// 实测建筑（不含程序化补全）
const BUILDING_ITEMS = (GEO.mapBuildings || []).map((b) => ({
  flat: b.o, holes: b.holes || [], bb: flatBBox(b.o), name: BUILDING_PHOTO_BY_SOURCE.get(b.id)?.name || b.n,
  h: BUILDING_PHOTO_BY_SOURCE.get(b.id)?.totalHeightEstimate || BUILDING_PHOTO_BY_SOURCE.get(b.id)?.displayHeight || b.h,
  aliases: BUILDING_PHOTO_BY_SOURCE.get(b.id)?.aliases || []
}));
const BUILDING_INDEX = makeIndex(BUILDING_ITEMS);

// 水体、公园、铁路
const WATER_POLYS = WATER_POLYGONS.map((rings) => ({ rings, bb: ringBBox(rings[0]) }));
const WATER_LINES = (GEO.water.lines || []).map((l) => ({ ...l, bb: flatBBox(l.pts) }));
const PARK_LABELS = PARKS.map((p) => {
  let best = null;
  for (const ring of p.rings) {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
    a = Math.abs(a / 2);
    if (!best || a > best.a) best = { ring, a };
  }
  return best ? { name: p.name, kind: p.kind, ring: best.ring, landPolygons:p.landPolygons,
    bb: ringBBox(best.ring), ...ringCentroid(best.ring) } : null;
}).filter(Boolean);
const RAIL_ITEMS = (GEO.railways || []).map(([name, kind, flat]) => ({ name, kind, flat, bb: flatBBox(flat) }));
const SPORTS_COLORS={soccer:'#31543b',basketball:'#375b68','sports-ground':'#354b3b','running-track':'#855447',
  infield:'#365d41',court:'#406d69','sport-paving':'#73594d','community-path':'#748180'};
const SPORTS_ITEMS=(GEO.urban?.surfaces||[]).filter(s=>SPORTS_COLORS[s.kind]).flatMap(s=>s.polygons.map(p=>({
  ...p,color:SPORTS_COLORS[s.kind],bb:flatBBox(p.outer)
})));
const SPORTS_INDEX=makeIndex(SPORTS_ITEMS);

const PLACES = GEO.places || [];

const POI_STYLE = {
  park: ['#79c98d', '园'], garden: ['#79c98d', '园'], nature_reserve: ['#79c98d', '园'],
  mall: ['#f0a84a', '商'], marketplace: ['#f0a84a', '市'], retail: ['#f0a84a', '商'],
  station: ['#6fb8ff', '站'], bus_station: ['#6fb8ff', '站'], railway: ['#6fb8ff', '站'],
  hospital: ['#ff6b6b', '医'], clinic: ['#ff6b6b', '医'], doctors: ['#ff6b6b', '医'],
  school: ['#b18cff', '学'], college: ['#b18cff', '学'], university: ['#b18cff', '学'], kindergarten: ['#b18cff', '学'],
  government: ['#8fa6ff', '政'], office: ['#8fa6ff', '政'], courthouse: ['#8fa6ff', '法'], police: ['#8fa6ff', '警'],
  museum: ['#d6b36a', '馆'], gallery: ['#d6b36a', '馆'], library: ['#d6b36a', '馆'], artwork: ['#ff8fb1', '景'],
  attraction: ['#ff8fb1', '景'], viewpoint: ['#ff8fb1', '景'], hotel: ['#e0b06a', '宿'], bank: ['#7fd0a0', '银'],
  commercial: ['#f0bd70', '商'], culture: ['#d6b36a', '文'], civic: ['#8fa6ff', '公'], industrial: ['#aab4c0', '厂'], building: ['#b8c9d5', '楼'],
  fuel: ['#aab4c0', '油'], place_of_worship: ['#d6b36a', '寺'], cinema: ['#f0a84a', '影'], sports: ['#79c98d', '体']
};
const MAJOR_POI = new Set(['park', 'mall', 'station', 'hospital', 'school', 'government', 'museum', 'gallery', 'library', 'hotel', 'attraction', 'artwork', 'marketplace', 'commercial', 'culture', 'civic', 'office', 'building', 'industrial','sports']);
const poiStyle = (kind) => POI_STYLE[kind] || ['#aab4c0', ''];
const CAMPUS_POIS=Object.values(LANDMARK_SITES).flatMap(s=>s.subsites||[]);
const POI_ITEMS = [...(GEO.namedSites?.length ? GEO.namedSites.map((s) => [s.name, s.kind, s.x, s.z,s.labelScope]) : GEO.pois || []),
  ...CAMPUS_POIS.map(s=>[s.name,s.kind,s.x,s.z])]
  .filter(([name, kind]) => name && kind)
  .map(([name, kind, x, z,labelScope]) => ({ name, kind, x, z,labelScope, bb: [x, z, x, z], style: poiStyle(kind) }));
const POI_INDEX = makeIndex(POI_ITEMS);
const LANDMARK_NAMES = new Set(LANDMARKS.flatMap(l => [l.name,...(LANDMARK_SITES[l.name].aliases||[])]));
const LANDMARK_SHORTS = new Set(LANDMARKS.map((l) => l.short));

const LANDMARK_COLOR = {
  mixed: '#ffd36b', civic: '#8fa6ff', culture: '#d6b36a', sports: '#79c98d',
  station: '#6fb8ff', park: '#79c98d', mall: '#f0a84a', heritage: '#e0a07a', waterfront: '#7fc7e8'
};

class CityMapSystem {
  constructor({ controllerManager, cameraSystem, allBlocks, onToggle, onTeleport }) {
    this.controllerManager = controllerManager;
    this.cameraSystem = cameraSystem;
    this.allBlocks = allBlocks || [];
    this.onToggle = onToggle;
    this.onTeleport = onTeleport;
    this.waypoint = null;
    this.isFullMapOpen = false;
    this.view = { x: 0, z: 0, zoom: 0.06 };
    this.hover = null;
    this.drag = null;
    this.lastRadar = 0;

    this.minimap = document.getElementById('minimap-canvas');
    this.minimapCard = document.getElementById('minimap-card');
    this.headingLabel = document.getElementById('minimap-heading');
    this.modal = document.getElementById('fullmap-modal');
    this.fullCanvas = document.getElementById('fullmap-canvas');
    this.fullWrap = document.getElementById('fullmap-canvas-wrap');
    this.search = document.getElementById('fullmap-search');
    this.playerInfo = document.getElementById('fullmap-player-info');
    this.hoverInfo = document.getElementById('fullmap-hover-info');
    this.counts = document.getElementById('fullmap-counts');
    this.needle = document.getElementById('map-compass-needle');
    this.updateReferences('沭阳县');

    if (this.counts) {
      this.counts.textContent = `${ROAD_ITEMS.length + PATH_ITEMS.length} 条道路 · ${GEO.buildingAudit?.buildings || BUILDING_ITEMS.length} 栋源建筑 · ${NEIGHBORHOODS.length} 个小区 · ${POI_ITEMS.length} 个具名建筑与地点`;
    }
    const suggestions = document.getElementById('neighborhood-suggestions');
    if (suggestions) for (const name of new Set([...NEIGHBORHOODS, ...(GEO.namedSites || []),...CAMPUS_POIS].map((n) => n.name))) {
      const option = document.createElement('option');
      option.value = name;
      suggestions.append(option);
    }
    this.bind();
  }

  bind() {
    const openMap = document.getElementById('btn-open-map');
    openMap?.addEventListener('click', () => this.toggleFullMap(true));
    document.getElementById('close-fullmap-btn')?.addEventListener('click', () => this.toggleFullMap(false));
    this.minimapCard?.addEventListener('click', () => this.toggleFullMap(true));
    document.getElementById('map-zoom-in')?.addEventListener('click', () => this.zoomFull(1.35));
    document.getElementById('map-zoom-out')?.addEventListener('click', () => this.zoomFull(1 / 1.35));
    document.getElementById('map-center-player')?.addEventListener('click', () => this.centerOnPlayer(0.55));
    document.getElementById('map-view-all')?.addEventListener('click', () => this.fitAll());
    this.search?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const hit = this.findPlace(this.search.value);
      this.selectedPlace = hit;
      this.selectedNeighborhood = hit?.polygons ? hit : null;
      this.updateReferences(hit?.name || this.search.value);
      if (hit) {
        this.view.x = hit.x;
        this.view.z = hit.z;
        const unit = hit.labelScope === 'building-unit';
        this.view.zoom = Math.max(unit ? .85 : .22, Math.min(unit ? 1.2 : .9, this.view.zoom * 2));
        this.renderFullMap();
      }
      if (this.hoverInfo) this.hoverInfo.textContent = hit
        ? `${hit.name || this.search.value}${hit.buildings ? ` · 已收录 ${hit.buildings.length} 栋建筑` : ''} · 点击地图传送`
        : '未找到该名称，可尝试小区全名或附近道路名';
    });

    window.addEventListener('keydown', (e) => {
      if (isTypingInField(e)) return;
      if (e.code === 'KeyM' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        this.toggleFullMap(!this.isFullMapOpen);
      } else if (e.code === 'Escape' && this.isFullMapOpen) {
        this.toggleFullMap(false);
      }
    });

    const canvas = this.fullCanvas;
    canvas?.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vz: this.view.z, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas?.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.view.x = this.drag.vx - dx / this.view.zoom;
        this.view.z = this.drag.vz - dy / this.view.zoom;
        this.renderFullMap();
      } else {
        const p = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        this.hover = p;
        if (this.hoverInfo) this.hoverInfo.textContent = `${getLocationLabel(p.x, p.z)} · 点击传送`;
      }
    });
    const end = (e) => {
      if (!this.drag) return;
      const moved = this.drag.moved;
      this.drag = null;
      if (moved < 6 && e.type === 'pointerup') {
        const rect = canvas.getBoundingClientRect();
        const p = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        this.onTeleport?.(p.x, p.z, Math.PI);
        this.toggleFullMap(false);
      }
    };
    canvas?.addEventListener('pointerup', end);
    canvas?.addEventListener('pointercancel', end);
    canvas?.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomFull(e.deltaY < 0 ? 1.18 : 1 / 1.18);
    }, { passive: false });
  }

  toggleFullMap(open) {
    if (!this.modal || open === this.isFullMapOpen) return;
    this.isFullMapOpen = open;
    this.modal.classList.toggle('hidden', !open);
    this.onToggle?.(open);
    if (open) {
      this.resizeFullCanvas();
      this.fitAll();
    }
  }

  updateReferences(name) {
    const urls = externalMapLinks(name);
    for (const [provider, label] of [['amap', '高德'], ['baidu', '百度']]) {
      const link = document.getElementById(`map-reference-${provider}`);
      if (!link) continue;
      link.href = urls[provider];
      link.title = `在${label}地图中核对：${name}`;
    }
  }

  resizeFullCanvas() {
    if (!this.fullCanvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.fullCanvas.getBoundingClientRect();
    this.fullCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.fullCanvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  fitAll() {
    if (!this.fullCanvas) return;
    const rect = this.fullCanvas.getBoundingClientRect();
    const w = ISLAND_BOUNDS.maxX - ISLAND_BOUNDS.minX;
    const h = ISLAND_BOUNDS.maxZ - ISLAND_BOUNDS.minZ;
    this.view.zoom = Math.min(rect.width / (w * 1.04), rect.height / (h * 1.04));
    this.view.x = (ISLAND_BOUNDS.minX + ISLAND_BOUNDS.maxX) / 2;
    this.view.z = (ISLAND_BOUNDS.minZ + ISLAND_BOUNDS.maxZ) / 2;
    this.renderFullMap();
  }

  centerOnPlayer(zoom) {
    const p = this.controllerManager.getActiveEntity().position;
    this.view.x = p.x;
    this.view.z = p.z;
    if (zoom) this.view.zoom = zoom;
    this.renderFullMap();
  }

  zoomFull(factor) {
    this.view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.view.zoom * factor));
    this.renderFullMap();
  }

  screenToWorld(sx, sy) {
    const rect = this.fullCanvas.getBoundingClientRect();
    return {
      x: this.view.x + (sx - rect.width / 2) / this.view.zoom,
      z: this.view.z + (sy - rect.height / 2) / this.view.zoom
    };
  }

  findPlace(text) {
    const q = (text || '').trim();
    if (!q) return null;
    const exactSite = POI_ITEMS.find((p) => p.name === q);
    if (exactSite) return exactSite;
    const exactBuilding = BUILDING_ITEMS.find(b => b.name === q || b.aliases.includes(q));
    if (exactBuilding) return {...flatCentroid(exactBuilding.flat), name:exactBuilding.name, h:exactBuilding.h};
    const neighborhood = NEIGHBORHOODS.find((n) => n.name === q || n.aliases.includes(q)) ||
      NEIGHBORHOODS.find((n) => n.name.includes(q) || n.aliases.some((a) => a.includes(q)));
    if (neighborhood) return neighborhood;
    const lm = LANDMARKS.find((l) => l.name.includes(q) || l.short.includes(q));
    if (lm) return lm;
    const park = PARK_LABELS.find((p) => p.name && p.name.includes(q));
    if (park) return park;
    const road = ROAD_ITEMS.find((r) => r.name.includes(q) || r.short.includes(q));
    if (road) return flatCentroid(road.flat, Math.floor(road.flat.length / 4));
    const poi = POI_ITEMS.find((p) => p.name.includes(q));
    if (poi) return poi;
    const building = BUILDING_ITEMS.find((b) => b.name && (b.name.includes(q) || b.aliases.some(a => a.includes(q))));
    if (building) return { ...flatCentroid(building.flat), name: building.name, h:building.h };
    const place = PLACES.find(([name]) => name.includes(q));
    if (place) return { x: place[2], z: place[3], name: place[0] };
    return null;
  }

  projector(ctx, canvas, view) {
    const dpr = canvas.width / (canvas.clientWidth || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ox = w / 2 - view.x * view.zoom;
    const oy = h / 2 - view.z * view.zoom;
    return {
      w, h, zoom: view.zoom,
      x: (wx) => wx * view.zoom + ox,
      y: (wz) => wz * view.zoom + oy,
      rect: {
        minX: view.x - w / 2 / view.zoom, maxX: view.x + w / 2 / view.zoom,
        minZ: view.z - h / 2 / view.zoom, maxZ: view.z + h / 2 / view.zoom
      }
    };
  }

  draw(ctx, canvas, view, { radar = false } = {}) {
    const P = this.projector(ctx, canvas, view);
    const v = P.rect;
    const zoom = view.zoom;
    ctx.clearRect(0, 0, P.w, P.h);
    ctx.fillStyle = C.land;
    ctx.fillRect(0, 0, P.w, P.h);

    // 水系面
    ctx.fillStyle = C.water;
    for (const w of WATER_POLYS) {
      if (!inRect(w.bb, v)) continue;
      ctx.beginPath();
      for(const ring of w.rings){
        ctx.moveTo(P.x(ring[0].x),P.y(ring[0].z));
        for(let i=1;i<ring.length;i++)ctx.lineTo(P.x(ring[i].x),P.y(ring[i].z));
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }
    // 河道中心线
    ctx.strokeStyle = C.water;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const l of WATER_LINES) {
      if (!inRect(l.bb, v)) continue;
      ctx.lineWidth = Math.max(1, (l.w || 8) * zoom * 0.8);
      ctx.beginPath();
      ctx.moveTo(P.x(l.pts[0]), P.y(l.pts[1]));
      for (let i = 2; i < l.pts.length; i += 2) ctx.lineTo(P.x(l.pts[i]), P.y(l.pts[i + 1]));
      ctx.stroke();
    }

    // 街区底色
    if (zoom >= 0.045 && !radar) {
      ctx.fillStyle = C.block;
      for (const b of BLOCKS) {
        if (b.maxX < v.minX || b.minX > v.maxX || b.maxZ < v.minZ || b.minZ > v.maxZ) continue;
        ctx.beginPath();
        ctx.moveTo(P.x(b.poly[0].x), P.y(b.poly[0].z));
        for (let i = 1; i < b.poly.length; i++) ctx.lineTo(P.x(b.poly[i].x), P.y(b.poly[i].z));
        ctx.closePath();
        ctx.fill();
      }
    }

    // 公园
    for (const p of PARK_LABELS) {
      if (!inRect(p.bb, v)) continue;
      const ring = p.ring;
      ctx.fillStyle = C.park;
      ctx.strokeStyle = C.parkEdge;
      ctx.lineWidth = 0.6;
      for(const poly of p.landPolygons){
        ctx.beginPath();
        for(const contour of poly){
          ctx.moveTo(P.x(contour[0].x),P.y(contour[0].z));
          for(let i=1;i<contour.length;i++)ctx.lineTo(P.x(contour[i].x),P.y(contour[i].z));
          ctx.closePath();
        }
        ctx.fill('evenodd');
        if(zoom>=.12)ctx.stroke();
      }
    }

    // 来源运动场地：与3D使用相同的外环/内孔，不用整块公园底色覆盖跑道。
    if(zoom>=.1)for(const s of queryIndex(SPORTS_INDEX,SPORTS_ITEMS,v)){
      ctx.fillStyle=s.color;ctx.beginPath();
      for(const ring of [s.outer,...s.holes]){
        ctx.moveTo(P.x(ring[0]),P.y(ring[1]));
        for(let i=2;i<ring.length;i+=2)ctx.lineTo(P.x(ring[i]),P.y(ring[i+1]));
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }

    // 步道/自行车道
    if (zoom >= 0.08) {
      ctx.strokeStyle = C.path;
      ctx.lineCap = 'round';
      for (const r of queryIndex(PATH_INDEX, PATH_ITEMS, v)) {
        if (!inRect(r.bb, v)) continue;
        ctx.lineWidth = Math.max(0.45, (r.w || 2) * zoom * 0.45);
        ctx.beginPath();
        ctx.moveTo(P.x(r.flat[0]), P.y(r.flat[1]));
        for (let i = 2; i < r.flat.length; i += 2) ctx.lineTo(P.x(r.flat[i]), P.y(r.flat[i + 1]));
        ctx.stroke();
      }
    }

    // 机动车道：描边 + 填充
    const roads = queryIndex(ROAD_INDEX, ROAD_ITEMS, v);
    for (const pass of ['edge', 'fill']) {
      for (const r of roads) {
        if (!inRect(r.bb, v)) continue;
        const base = Math.max(pass === 'edge' ? 0.9 : 0.55, (r.w || 8) * zoom * (pass === 'edge' ? 1.2 : 1));
        ctx.lineWidth = base;
        ctx.strokeStyle = pass === 'edge'
          ? C.roadEdge
          : r.bridge ? C.bridge
            : (r.kind === 'motorway' || r.kind === 'trunk' || r.kind === 'primary') ? C.highway
              : (r.kind === 'secondary' || r.kind === 'tertiary') ? C.roadMajor : C.road;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(P.x(r.flat[0]), P.y(r.flat[1]));
        for (let i = 2; i < r.flat.length; i += 2) ctx.lineTo(P.x(r.flat[i]), P.y(r.flat[i + 1]));
        ctx.stroke();
      }
    }

    // 铁路
    if (zoom >= 0.1 && !radar) {
      for (const r of RAIL_ITEMS) {
        if (!inRect(r.bb, v)) continue;
        ctx.strokeStyle = C.rail;
        ctx.lineWidth = Math.max(0.8, zoom * 2.2);
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(P.x(r.flat[0]), P.y(r.flat[1]));
        for (let i = 2; i < r.flat.length; i += 2) ctx.lineTo(P.x(r.flat[i]), P.y(r.flat[i + 1]));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 实测建筑
    if (zoom >= 0.045) {
      for (const b of queryIndex(BUILDING_INDEX, BUILDING_ITEMS, v)) {
        if (!inRect(b.bb, v)) continue;
        ctx.fillStyle = b.h >= 30 ? C.buildingTall : C.building;
        ctx.strokeStyle = C.buildingEdge;
        ctx.lineWidth = 0.35;
        ctx.beginPath();
        ctx.moveTo(P.x(b.flat[0]), P.y(b.flat[1]));
        for (let i = 2; i < b.flat.length; i += 2) ctx.lineTo(P.x(b.flat[i]), P.y(b.flat[i + 1]));
        ctx.closePath();
        for (const hole of b.holes) {
          ctx.moveTo(P.x(hole[0]), P.y(hole[1]));
          for (let i = 2; i < hole.length; i += 2) ctx.lineTo(P.x(hole[i]), P.y(hole[i + 1]));
          ctx.closePath();
        }
        ctx.fill('evenodd');
        ctx.stroke();
      }
    }

    // 搜索结果显示真实小区边界，院落孔洞保持透明。
    const selected = this.selectedNeighborhood;
    if (selected && !radar) {
      ctx.beginPath();
      for (const p of selected.polygons) for (const ring of [p.outer, ...p.holes]) {
        ctx.moveTo(P.x(ring[0].x), P.y(ring[0].z));
        for (let i = 1; i < ring.length; i++) ctx.lineTo(P.x(ring[i].x), P.y(ring[i].z));
        ctx.closePath();
      }
      ctx.fillStyle = 'rgba(120,215,170,.13)'; ctx.fill('evenodd');
      ctx.strokeStyle = '#91dbb6'; ctx.lineWidth = 1.7; ctx.stroke();
    }

    // 标注（先占位，后绘制，避免叠字）
    const placed = [];
    const overlaps = (r) => placed.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
    const label = (text, x, y, size, color, weight = '600', dy = 0) => {
      if (!text || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (x < -80 || x > P.w + 80 || y < -40 || y > P.h + 40) return false;
      ctx.font = `${weight} ${size}px ${FONT}`;
      const tw = ctx.measureText(text).width;
      const r = { x: x - tw / 2 - 2, y: y - size - 1 + dy, w: tw + 4, h: size + 4 };
      if (overlaps(r)) return false;
      placed.push(r);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + dy);
      return true;
    };
    const dot = (x, y, radius, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    if (this.selectedPlace && !radar) {
      const p = this.selectedPlace;
      label(p.name || '', P.x(p.x), P.y(p.z), 13, '#fff0b5', '700', -12);
    }
    // 小区名优先于一般兴趣点，按当前视野中心排序，移动时也能辨认附近小区。
    if (zoom >= .14) {
      const visible = NEIGHBORHOODS.filter((n) => n.x >= v.minX && n.x <= v.maxX && n.z >= v.minZ && n.z <= v.maxZ)
        .sort((a, b) => (a === selected ? -1 : b === selected ? 1 : Math.hypot(a.x - view.x, a.z - view.z) - Math.hypot(b.x - view.x, b.z - view.z)));
      for (const n of visible) {
        label(n.name, P.x(n.x), P.y(n.z), radar ? 10 : Math.min(13, 10 + zoom * 3), '#a7dfbd', '600');
      }
    }

    // 地标
    if (zoom >= 0.07) {
      for (const lm of LANDMARKS) {
        if (lm.x < v.minX || lm.x > v.maxX || lm.z < v.minZ || lm.z > v.maxZ) continue;
        const x = P.x(lm.x), y = P.y(lm.z);
        const color = LANDMARK_COLOR[lm.kind] || C.landmark;
        dot(x, y, Math.max(2.6, Math.min(4.2, 3 + zoom * 3)), color);
        ctx.strokeStyle = 'rgba(10,14,18,0.8)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.6, Math.min(4.2, 3 + zoom * 3)), 0, Math.PI * 2);
        ctx.stroke();
        const size = Math.max(10, Math.min(13, 9 + zoom * 8));
        label(lm.short, x, y, size, C.text, '700', -11);
      }
    }

    // 公园名
    if (zoom >= 0.07) {
      for (const p of PARK_LABELS) {
        if (!p.name || !inRect(p.bb, v)) continue;
        const size = Math.max(9, Math.min(12, 8 + zoom * 6));
        label(p.name, P.x(p.x), P.y(p.z), size, 'rgba(150,210,165,0.82)', '600', 0);
      }
    }

    // 水体名
    if (zoom >= 0.09) {
      for (const l of WATER_LINES) {
        if (!l.name || !inRect(l.bb, v)) continue;
        const mid = pointAt(l.pts, 0.5);
        const size = Math.max(9, Math.min(13, 8 + zoom * 7));
        label(l.name, P.x(mid.x), P.y(mid.z), size, C.waterText, '700', 0);
      }
    }

    // 社区/村庄/片区名
    if (zoom <= 0.4) {
      const order = { city: 0, county: 0, town: 1, suburb: 2, quarter: 2, neighbourhood: 3, village: 4 };
      const sorted = [...PLACES].sort((a, b) => (order[a[1]] ?? 5) - (order[b[1]] ?? 5));
      for (const [name, kind, x, z] of sorted) {
        if (x < v.minX || x > v.maxX || z < v.minZ || z > v.maxZ) continue;
        if ((kind === 'neighbourhood' || kind === 'village') && zoom < 0.14) continue;
        if (kind === 'village' && zoom < 0.24) continue;
        const major = kind === 'city' || kind === 'county' || kind === 'town' || kind === 'suburb' || kind === 'quarter';
        const size = major ? Math.max(11, Math.min(15, 10 + zoom * 10)) : Math.max(9, Math.min(11, 8 + zoom * 6));
        label(name, P.x(x), P.y(z), size, major ? 'rgba(215,225,235,0.78)' : C.textDim, major ? '700' : '500', 0);
      }
    }

    // POI
    const poiZoom = zoom >= 0.24 ? 2 : zoom >= 0.13 ? 1 : 0;
    if (poiZoom > 0) {
      const visiblePois = queryIndex(POI_INDEX, POI_ITEMS, v).sort((a, b) => Math.hypot(a.x - view.x, a.z - view.z) - Math.hypot(b.x - view.x, b.z - view.z));
      for (const p of visiblePois) {
        if(p.labelScope==='building-unit'&&(radar||zoom<.75))continue;
        if (LANDMARK_NAMES.has(p.name) || LANDMARK_SHORTS.has(p.name)) continue;
        const major = MAJOR_POI.has(p.kind);
        if (poiZoom === 1 && !major && !radar) continue;
        const [color, icon] = p.style;
        const x = P.x(p.x), y = P.y(p.z);
        dot(x, y, 2.2, color);
        if (icon && zoom >= 0.16) {
          ctx.fillStyle = color;
          ctx.font = `700 8px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(icon, x, y);
        }
        if (zoom >= 0.18 || radar) {
          const size = Math.max(8, Math.min(10, 7 + zoom * 5));
          label(p.name, x, y, size, 'rgba(205,216,226,0.78)', '500', -9);
        }
      }
    }

    // 路名
    if (zoom >= 0.17 && !radar) {
      const nameRoads = roads
        .filter((r) => r.name && r.w >= 10)
        .sort((a, b) => b.w - a.w);
      const roadBoxes = [];
      const roadOverlap = (r) => roadBoxes.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
      for (const r of nameRoads) {
        if (r.w < (zoom < 0.28 ? 15 : 11)) continue;
        const mid = pointAt(r.flat, 0.5);
        const dx = mid.nx - mid.x, dz = mid.nz - mid.z;
        if (dx === 0 && dz === 0) continue;
        const angle = Math.atan2(dz, dx);
        const size = Math.max(9, Math.min(11, 8 + zoom * 5));
        ctx.font = `600 ${size}px ${FONT}`;
        const tw = ctx.measureText(r.short || r.name).width;
        const c0 = Math.abs(Math.cos(angle)), s0 = Math.abs(Math.sin(angle));
        const bw = tw * c0 + size * s0, bh = tw * s0 + size * c0;
        const rect = { x: P.x(mid.x) - bw / 2, y: P.y(mid.z) - bh / 2, w: bw, h: bh };
        if (rect.x > P.w || rect.y > P.h || rect.x + rect.w < 0 || rect.y + rect.h < 0) continue;
        if (roadOverlap(rect) || overlaps(rect)) continue;
        roadBoxes.push(rect);
        ctx.save();
        ctx.translate(P.x(mid.x), P.y(mid.z));
        ctx.rotate(angle);
        ctx.fillStyle = C.roadText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.short || r.name, 0, 0);
        ctx.restore();
      }
    }

    // 玩家 / 导航点
    const player = this.controllerManager.getActiveEntity();
    const px = P.x(player.position.x), py = P.y(player.position.z);
    if (this.waypoint) {
      ctx.strokeStyle = C.route;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(P.x(this.waypoint.x), P.y(this.waypoint.z));
      ctx.stroke();
      ctx.setLineDash([]);
      dot(P.x(this.waypoint.x), P.y(this.waypoint.z), 4, C.route);
    }
    const h = player.heading || 0;
    const fx = Math.sin(h), fz = Math.cos(h);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(fx, -fz));
    ctx.fillStyle = C.player;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.6, 5);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-4.6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 全屏地图：城区边界、比例尺、OSM 署名
    if (!radar) {
      ctx.strokeStyle = 'rgba(120,145,170,0.28)';
      ctx.setLineDash([7, 7]);
      ctx.lineWidth = 1;
      ctx.strokeRect(
        P.x(ISLAND_BOUNDS.minX), P.y(ISLAND_BOUNDS.minZ),
        (ISLAND_BOUNDS.maxX - ISLAND_BOUNDS.minX) * zoom,
        (ISLAND_BOUNDS.maxZ - ISLAND_BOUNDS.minZ) * zoom
      );
      ctx.setLineDash([]);

      const scales = [50, 100, 200, 500, 1000, 2000, 5000];
      const barM = scales.find((m) => m * zoom >= 60) || 5000;
      const barPx = barM * zoom;
      const bx = 16, by = P.h - 24;
      ctx.strokeStyle = 'rgba(220,230,240,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + barPx, by);
      ctx.moveTo(bx, by - 4);
      ctx.lineTo(bx, by + 4);
      ctx.moveTo(bx + barPx, by - 4);
      ctx.lineTo(bx + barPx, by + 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(220,230,240,0.8)';
      ctx.font = `600 10px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(barM >= 1000 ? `${barM / 1000} 千米` : `${barM} 米`, bx, by - 7);

      ctx.fillStyle = 'rgba(160,175,190,0.68)';
      ctx.font = `500 9px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('© 开放街图贡献者 · Overture地图基金会 · ODbL · CNBH-10m / Wu · CC BY 4.0', P.w - 10, P.h - 8);
    }

    if (radar) {
      const g = ctx.createRadialGradient(P.w / 2, P.h / 2, Math.min(P.w, P.h) * 0.2, P.w / 2, P.h / 2, Math.min(P.w, P.h) * 0.52);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, P.w, P.h);
    }
  }

  update() {
    if (!this.minimap) return;
    const now = performance.now();
    if (now - this.lastRadar < 110) return;
    this.lastRadar = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.minimap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (this.minimap.width !== Math.round(rect.width * dpr) || this.minimap.height !== Math.round(rect.height * dpr)) {
      this.minimap.width = Math.round(rect.width * dpr);
      this.minimap.height = Math.round(rect.height * dpr);
    }
    const ctx = this.minimap.getContext('2d');
    const p = this.controllerManager.getActiveEntity().position;
    const heading = this.controllerManager.getActiveEntity().heading || 0;
    if (this.headingLabel) this.headingLabel.textContent = `朝${headingDirection(heading)}`;
    this.draw(ctx, this.minimap, { x: p.x, z: p.z, zoom: RADAR_SCALE }, { radar: true });
    if (this.playerInfo) this.playerInfo.textContent = getLocationLabel(p.x, p.z);
  }

  renderFullMap() {
    if (!this.isFullMapOpen || !this.fullCanvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.fullCanvas.getBoundingClientRect();
    if (this.fullCanvas.width !== Math.round(rect.width * dpr) || this.fullCanvas.height !== Math.round(rect.height * dpr)) {
      this.resizeFullCanvas();
    }
    const ctx = this.fullCanvas.getContext('2d');
    this.draw(ctx, this.fullCanvas, this.view);
    const p = this.controllerManager.getActiveEntity().position;
    if (this.playerInfo) this.playerInfo.textContent = `你位于 ${getLocationLabel(p.x, p.z)}`;
  }
}

export { CityMapSystem, headingDirection, externalMapLinks };
