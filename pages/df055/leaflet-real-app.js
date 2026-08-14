const ui = {
  depth: document.getElementById('layerDepth'),
  velocity: document.getElementById('layerVelocity'),
  concentration: document.getElementById('layerConcentration'),
  deposition: document.getElementById('layerDeposition'),
  officialDf055: document.getElementById('layerOfficialDf055'),
  points: document.getElementById('layerPoints'),
  arrows: document.getElementById('showArrows'),
  slider: document.getElementById('timeSlider'),
  play: document.getElementById('playBtn'),
  pause: document.getElementById('pauseBtn'),
  reset: document.getElementById('resetBtn'),
  speed: document.getElementById('speedSelect'),
  timeLabel: document.getElementById('timeLabel'),
  frameLabel: document.getElementById('frameLabel'),
  maxDepth: document.getElementById('maxDepth'),
  maxVelocity: document.getElementById('maxVelocity'),
  affectedArea: document.getElementById('affectedArea'),
  movingArea: document.getElementById('movingArea'),
  queryBox: document.getElementById('queryBox'),
};

let demo, map, canvasLayer, pointLayer;
let frameIndex = 0;
let timer = null;
let playing = false;
let activeByKey = new Map();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function twd97ToWgs84(x, y) {
  const a = 6378137.0, b = 6356752.314245, lon0 = 121 * Math.PI / 180, k0 = 0.9999, dx = 250000;
  const e = Math.sqrt(1 - (b * b) / (a * a));
  const e2 = e * e, e1sq = e2 / (1 - e2), xAdj = x - dx, m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const fp = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sinfp = Math.sin(fp), cosfp = Math.cos(fp), tanfp = Math.tan(fp);
  const c1 = e1sq * cosfp * cosfp, t1 = tanfp * tanfp;
  const r1 = a * (1 - e2) / Math.pow(1 - e2 * sinfp * sinfp, 1.5);
  const n1 = a / Math.sqrt(1 - e2 * sinfp * sinfp);
  const d = xAdj / (n1 * k0);
  const lat = fp - (n1 * tanfp / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * e1sq) * d ** 4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * e1sq - 3 * c1 * c1) * d ** 6 / 720);
  const lon = lon0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * e1sq + 24 * t1 * t1) * d ** 5 / 120) / cosfp;
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}
function latLng(x, y) { const p = twd97ToWgs84(x, y); return L.latLng(p.lat, p.lon); }

function depthColor(depth) {
  const t = clamp(depth / demo.meta.depthColorCap, 0, 1);
  const stops = [[255,243,164],[245,167,66],[217,53,28],[94,11,16]];
  const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
  const c0 = stops[i], c1 = stops[i + 1];
  return `rgba(${Math.round(lerp(c0[0], c1[0], f))},${Math.round(lerp(c0[1], c1[1], f))},${Math.round(lerp(c0[2], c1[2], f))},0.82)`;
}
function terrainColor(cell) {
  const low = [80,95,82], mid = [124,119,92], high = [120,112,105];
  const t = cell.elev, mix = t < 0.58 ? t / 0.58 : (t - 0.58) / 0.42;
  const a = t < 0.58 ? low : mid, b = t < 0.58 ? mid : high;
  const shade = 0.40 + cell.shade * 0.42;
  return `rgb(${Math.round(lerp(a[0], b[0], mix) * shade)},${Math.round(lerp(a[1], b[1], mix) * shade)},${Math.round(lerp(a[2], b[2], mix) * shade)})`;
}
function terrainAlpha(cell) {
  const m = demo.meta;
  const edge = Math.min((cell.x - m.xmin) / m.dx, (m.xmax - cell.x) / m.dx, (cell.y - m.ymin) / m.dy, (m.ymax - cell.y) / m.dy);
  return clamp(edge / 5, 0.05, 0.46);
}

const CanvasLayer = L.Layer.extend({
  onAdd(mapInstance) {
    this._map = mapInstance;
    this._canvas = L.DomUtil.create('canvas', 'leaflet-real-canvas');
    this._canvas.style.position = 'absolute';
    this._canvas.style.pointerEvents = 'none';
    mapInstance.getPanes().overlayPane.appendChild(this._canvas);
    mapInstance.on('move zoom resize', this._reset, this);
    this._reset();
  },
  onRemove(mapInstance) { mapInstance.getPanes().overlayPane.removeChild(this._canvas); mapInstance.off('move zoom resize', this._reset, this); },
  _reset() {
    const size = this._map.getSize();
    L.DomUtil.setPosition(this._canvas, this._map.containerPointToLayerPoint([0, 0]));
    this._canvas.width = size.x; this._canvas.height = size.y;
    drawCanvas(this._canvas.getContext('2d'));
  },
  redraw() { this._reset(); },
});

function cellCorners(cell) {
  const m = demo.meta;
  const nw = map.latLngToContainerPoint(latLng(cell.x - m.dx / 2, cell.y + m.dy / 2));
  const se = map.latLngToContainerPoint(latLng(cell.x + m.dx / 2, cell.y - m.dy / 2));
  return { x: nw.x, y: nw.y, w: se.x - nw.x, h: se.y - nw.y };
}
function drawCanvas(ctx) {
  if (!demo || !map) return;
  const size = map.getSize(); ctx.clearRect(0, 0, size.x, size.y);
  for (const cell of demo.terrain) { const r = cellCorners(cell); ctx.globalAlpha = terrainAlpha(cell); ctx.fillStyle = terrainColor(cell); ctx.fillRect(r.x, r.y, Math.ceil(r.w) + 0.4, Math.ceil(r.h) + 0.4); }
  ctx.globalAlpha = 1;
  const frame = demo.frames[frameIndex];
  ctx.save(); ctx.shadowColor = 'rgba(255,105,26,0.22)'; ctx.shadowBlur = 8;
  for (const cell of frame.cells) { if (cell.h > 0.05) { const r = cellCorners(cell); ctx.fillStyle = 'rgba(255,92,20,0.18)'; ctx.fillRect(r.x, r.y, r.w, r.h); } }
  ctx.restore();
  for (const cell of frame.cells) {
    const r = cellCorners(cell);
    if (ui.deposition.checked && cell.dep > 0.001) { ctx.fillStyle = `rgba(110,67,33,${clamp(cell.dep / 1200, 0.12, 0.66)})`; ctx.fillRect(r.x, r.y, r.w, r.h); }
    if (ui.concentration.checked && cell.C > 0.01) { ctx.fillStyle = `rgba(54,191,150,${clamp(cell.C / 0.65, 0.08, 0.65)})`; ctx.fillRect(r.x, r.y, r.w, r.h); }
    if (ui.velocity.checked && cell.vel > 0.02) { ctx.fillStyle = `rgba(80,170,255,${clamp(cell.vel / 5, 0.12, 0.72)})`; ctx.fillRect(r.x, r.y, r.w, r.h); }
    if (ui.depth.checked && cell.h > 0.05) { ctx.fillStyle = depthColor(cell.h); ctx.fillRect(r.x, r.y, r.w, r.h); }
  }
  if (ui.arrows.checked) drawArrows(ctx, frame);
}
function drawArrows(ctx, frame) {
  ctx.save(); ctx.strokeStyle = 'rgba(235,248,255,0.92)'; ctx.fillStyle = 'rgba(235,248,255,0.92)'; ctx.lineWidth = 1.4;
  for (const cell of frame.cells) {
    if (cell.h <= 0.05 || cell.vel <= 0.1 || cell.r % 3 !== 0 || cell.c % 3 !== 0) continue;
    const p = map.latLngToContainerPoint(latLng(cell.x, cell.y)); const len = clamp(cell.vel * 7, 6, 28); const vx = cell.u / cell.vel, vy = -cell.v / cell.vel;
    const x2 = p.x + vx * len, y2 = p.y + vy * len; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
    const ang = Math.atan2(y2 - p.y, x2 - p.x); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 5 * Math.cos(ang - 0.55), y2 - 5 * Math.sin(ang - 0.55)); ctx.lineTo(x2 - 5 * Math.cos(ang + 0.55), y2 - 5 * Math.sin(ang + 0.55)); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function marker(point, color) {
  const icon = L.divIcon({ className: 'point-marker', html: `<div style="width:13px;height:13px;border:2px solid white;background:${color};border-radius:50%;box-shadow:0 1px 5px #000"></div><div class="point-label">${point.label}</div>`, iconSize: [120, 28], iconAnchor: [6, 6] });
  const ll = latLng(point.x, point.y);
  return L.marker(ll, { icon }).bindPopup(`${point.label}<br>TWD97 X ${point.x}<br>TWD97 Y ${point.y}<br>WGS84 ${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}<br>Z ${point.z} m`);
}
function updateStats(frame) {
  ui.timeLabel.textContent = frame.time;
  ui.frameLabel.textContent = `frame ${frameIndex} / ${demo.frames.length - 1}`;
  ui.maxDepth.textContent = `${frame.stats.maxDepth.toFixed(2)} m`;
  ui.maxVelocity.textContent = `${frame.stats.maxVelocity.toFixed(2)} m/s`;
  ui.affectedArea.textContent = `${Math.round(frame.stats.affectedArea).toLocaleString()} m2`;
  ui.movingArea.textContent = `${Math.round(frame.stats.movingArea).toLocaleString()} m2`;
}
function refresh() {
  activeByKey = new Map(demo.frames[frameIndex].cells.map((cell) => [`${cell.r},${cell.c}`, cell]));
  canvasLayer.redraw(); updateStats(demo.frames[frameIndex]);
  if (pointLayer) ui.points.checked ? map.addLayer(pointLayer) : map.removeLayer(pointLayer);
  if (ui.officialDf055) ui.officialDf055.checked = false;
}
function setFrame(index) { frameIndex = clamp(index, 0, demo.frames.length - 1); ui.slider.value = frameIndex; refresh(); }
function play() { playing = true; if (timer) window.clearInterval(timer); timer = window.setInterval(() => setFrame(frameIndex >= demo.frames.length - 1 ? 0 : frameIndex + 1), Number(ui.speed.value)); }
function pause() { playing = false; if (timer) window.clearInterval(timer); timer = null; }

function setupMap() {
  const m = demo.meta;
  const bounds = L.latLngBounds(latLng(m.xmin - m.dx / 2, m.ymin - m.dy / 2), latLng(m.xmax + m.dx / 2, m.ymax + m.dy / 2));
  map = L.map('map', { zoomSnap: 0.25, preferCanvas: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, opacity: 0.92, attribution: '&copy; OpenStreetMap' }).addTo(map);
  map.fitBounds(bounds, { padding: [34, 34] });
  canvasLayer = new CanvasLayer().addTo(map);
  L.polyline(demo.channel.map((p) => latLng(p.x, p.y)), { color: '#4fc9ff', weight: 3, dashArray: '7 7', opacity: 0.92 }).addTo(map);
  pointLayer = L.layerGroup([marker(demo.controlPoints.C2, '#ff4d3d'), marker(demo.controlPoints.C1, '#ffd044'), marker(demo.controlPoints.valleyBottom, '#8fd3ff')]).addTo(map);
  L.rectangle(bounds, { color: '#ffffff', weight: 1, opacity: 0.55, fillOpacity: 0 }).addTo(map);
  map.on('click', (event) => {
    const ll = event.latlng; let nearest = null, best = Infinity;
    for (const cell of demo.terrain) { const p = latLng(cell.x, cell.y); const d = map.distance(ll, p); if (d < best) { best = d; nearest = cell; } }
    const hit = nearest ? activeByKey.get(`${nearest.r},${nearest.c}`) : null;
    if (!hit || hit.h <= 0.01) { ui.queryBox.innerHTML = `WGS84：${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}<br>最近 TWD97：${nearest?.x.toFixed(1)}, ${nearest?.y.toFixed(1)}<br>目前格網無明顯流動資料。`; return; }
    ui.queryBox.innerHTML = [`WGS84：${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`, `TWD97 X：${hit.x.toFixed(1)}`, `TWD97 Y：${hit.y.toFixed(1)}`, `Depth：${hit.h.toFixed(3)} m`, `Velocity：${hit.vel.toFixed(3)} m/s`, `Concentration：${hit.C.toFixed(3)}`, `Deposition proxy：${hit.dep.toFixed(2)}`].join('<br>');
  });
}
async function init() {
  if (!window.L) { ui.queryBox.textContent = 'Leaflet 或 OSM CDN 載入失敗；請確認網路。'; return; }
  demo = await fetch('data/demo-data.json').then((r) => r.json());
  ui.slider.max = demo.frames.length - 1;
  setupMap();
  ui.slider.addEventListener('input', () => setFrame(Number(ui.slider.value)));
  ui.play.addEventListener('click', play); ui.pause.addEventListener('click', pause);
  ui.speed.addEventListener('change', () => { if (playing) play(); });
  ui.reset.addEventListener('click', () => { pause(); setFrame(0); });
  for (const key of ['depth', 'velocity', 'concentration', 'deposition', 'points', 'arrows']) ui[key].addEventListener('change', refresh);
  if (ui.officialDf055) ui.officialDf055.addEventListener('change', () => { ui.officialDf055.checked = false; ui.queryBox.textContent = '水保署 DF055 官方範圍圖層暫時關閉：先恢復主地圖顯示。'; });
  const bestFrame = demo.frames.reduce((best, frame, index) => { const score = frame.stats.affectedArea + frame.stats.maxDepth * 600; return score > best.score ? { index, score } : best; }, { index: 0, score: -Infinity }).index;
  setFrame(bestFrame);
}
init().catch((error) => { console.error(error); ui.queryBox.textContent = `Leaflet demo failed: ${error.message}`; });
