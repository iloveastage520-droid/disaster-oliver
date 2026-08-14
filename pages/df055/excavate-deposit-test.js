
let viewer;
let data;
let transport;
let beforePrimitive;
let afterPrimitive;
let debrisPrimitive;
let frontEntity;
let flowLineEntity;
let arrowEntity;
let pointEntities = [];
let particleEntities = [];
let textureEntities = [];
let debrisBlockEntities = [];
let debrisBlobEntities = [];
let debrisConnectorEntities = [];
let stableBlobPool = [];
let stableTexturePool = [];
let stableFrontReady = false;
let valleyRibbonPrimitive;
let valleyEdgeRibbonPrimitive;
let depositionMoundEntity;
let depositionFanEntity;
let buildingEntities = [];
let currentTime = 300;
let showAfter = true;
let multiplier = 1;
let playTimer = null;
let particleClock = 0;
let lastTerrainSecond = null;
let rafId = null;

const KEY_TIMES = [150, 300, 450, 600];
const TOTAL_VOLUME = 7680;

const ui = {
  before: document.getElementById('beforeBtn'),
  after: document.getElementById('afterBtn'),
  toggle: document.getElementById('toggleBtn'),
  top: document.getElementById('topBtn'),
  oblique: document.getElementById('obliqueBtn'),
  mult: document.getElementById('multiplierSelect'),
  mode: document.getElementById('modeLabel'),
  erosion: document.getElementById('erosionVolume'),
  moving: document.getElementById('movingVolume'),
  dep: document.getElementById('depositionVolume'),
  maxE: document.getElementById('maxErosion'),
  maxD: document.getElementById('maxDeposition'),
  status: document.getElementById('status'),
  play: document.getElementById('playBtn'),
  pause: document.getElementById('pauseBtn'),
  reset: document.getElementById('resetBtn'),
  time: document.getElementById('timeSlider'),
  timeLabel: document.getElementById('timeLabel')
};

function status(msg) { if (ui.status) ui.status.textContent = msg; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smoothstep(t) { const x = clamp01(t); return x * x * (3 - 2 * x); }
function nearestKeyTime(t) { return KEY_TIMES.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a, KEY_TIMES[0]); }
function frameForTime(t) { const kt = nearestKeyTime(t); return transport.frames.find((f) => f.time === kt) || transport.frames[0]; }

function interpolatedFrame(t) {
  const frames = transport.frames;
  if (t <= frames[0].time) return frames[0];
  if (t >= frames[frames.length - 1].time) return frames[frames.length - 1];
  let a = frames[0];
  let b = frames[1];
  for (let i = 0; i < frames.length - 1; i++) {
    if (t >= frames[i].time && t <= frames[i + 1].time) {
      a = frames[i];
      b = frames[i + 1];
      break;
    }
  }
  const f = (t - a.time) / Math.max(1, b.time - a.time);
  const mapA = new Map(a.cells.map((c) => [`${c.row},${c.col}`, c]));
  const mapB = new Map(b.cells.map((c) => [`${c.row},${c.col}`, c]));
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  const cells = [];
  for (const key of keys) {
    const ca = mapA.get(key);
    const cb = mapB.get(key);
    const ref = cb || ca;
    const depth = (ca?.depth || 0) * (1 - f) + (cb?.depth || 0) * f;
    if (depth <= 0.035) continue;
    cells.push({
      row: ref.row,
      col: ref.col,
      x: ref.x,
      y: ref.y,
      lon: ref.lon,
      lat: ref.lat,
      terrain_z: ref.terrain_z,
      depth,
      velocity_x: (ca?.velocity_x || 0) * (1 - f) + (cb?.velocity_x || 0) * f,
      velocity_y: (ca?.velocity_y || 0) * (1 - f) + (cb?.velocity_y || 0) * f,
      velocity: (ca?.velocity || 0) * (1 - f) + (cb?.velocity || 0) * f,
      concentration: (ca?.concentration || cb?.concentration || 0.4),
      deposition_proxy: (ca?.deposition_proxy || 0) * (1 - f) + (cb?.deposition_proxy || 0) * f,
      progress_m: (ca?.progress_m ?? cb?.progress_m ?? 0) * (1 - f) + (cb?.progress_m ?? ca?.progress_m ?? 0) * f,
      lateral_m: (ca?.lateral_m ?? cb?.lateral_m ?? 0) * (1 - f) + (cb?.lateral_m ?? ca?.lateral_m ?? 0) * f
    });
  }
  const maxDepth = Math.max(0, ...cells.map((c) => c.depth));
  const maxVelocity = Math.max(0, ...cells.map((c) => c.velocity));
  const front = cells.length ? cells.reduce((best, c) => c.progress_m > best.progress_m ? c : best, cells[0]) : null;
  return { time: Math.round(t), wet_count: cells.length, max_depth: maxDepth, max_velocity: maxVelocity, front, cells };
}

function volumeScales() {
  const eroded = TOTAL_VOLUME * smoothstep(currentTime / 260);
  const deposited = TOTAL_VOLUME * smoothstep((currentTime - 220) / 380);
  return {
    eroded,
    deposited,
    moving: Math.max(0, eroded - deposited)
  };
}

function movingScale() {
  const base = clamp01(volumeScales().moving / (TOTAL_VOLUME * 0.58));
  const fade = currentTime < 500 ? 1 : smoothstep((620 - currentTime) / 120);
  const support = 0.16 * fade;
  return clamp01(base + support);
}

function timeScales() {
  const v = volumeScales();
  return {
    erosion: clamp01(v.eroded / TOTAL_VOLUME),
    deposition: clamp01(v.deposited / TOTAL_VOLUME)
  };
}

function mixColor(a, b, t) {
  const x = clamp01(t);
  return new Cesium.Color(
    a.red * (1 - x) + b.red * x,
    a.green * (1 - x) + b.green * x,
    a.blue * (1 - x) + b.blue * x,
    1
  );
}

function cellColor(cell, after) {
  const base = Cesium.Color.fromBytes(62, 76, 66, 255);
  if (!after) return base;
  const erosionTint = Cesium.Color.fromBytes(98, 61, 35, 255);
  const depTint = Cesium.Color.fromBytes(128, 86, 46, 255);
  const e = Math.min(1, Math.abs(cell.erosion_dz || 0) / Math.max(0.001, Math.abs(data.deltaRange.maxErosionDepth || 1)));
  const d = Math.min(1, Math.abs(cell.deposition_dz || 0) / Math.max(0.001, Math.abs(data.deltaRange.maxDepositionHeight || 1)));
  if (e > d && e > 0.02) return mixColor(base, erosionTint, 0.62 * e);
  if (d > 0.02) return mixColor(base, depTint, 0.80 * d);
  return base;
}

function terrainHeightAtCell(cell) {
  const scales = timeScales();
  return cell.original_z + ((cell.erosion_dz || 0) * scales.erosion + (cell.deposition_dz || 0) * scales.deposition) * multiplier;
}

function terrainAtLonLat(lon, lat) {
  let best = data.terrain[0];
  let bestD = Infinity;
  for (const cell of data.terrain) {
    const dx = cell.lon - lon;
    const dy = cell.lat - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = cell; }
  }
  return terrainHeightAtCell(best);
}

function makeTerrainPrimitive(after) {
  const rows = data.meta.ny;
  const cols = data.meta.nx;
  const positions = [];
  const colors = [];
  const indices = [];
  for (const cell of data.terrain) {
    const z = after ? terrainHeightAtCell(cell) + 1 : cell.original_z + 1;
    const p = Cesium.Cartesian3.fromDegrees(cell.lon, cell.lat, z);
    positions.push(p.x, p.y, p.z);
    const c = cellColor(cell, after);
    colors.push(c.red, c.green, c.blue, 1);
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  let geom = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array(positions) }),
      color: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 4, values: new Float32Array(colors) })
    },
    indices: new Uint32Array(indices),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions)
  });
  geom = Cesium.GeometryPipeline.computeNormal(geom);
  return new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry: geom }),
    appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false, closed: false }),
    asynchronous: false
  });
}

function rebuildTerrain() {
  if (beforePrimitive) viewer.scene.primitives.remove(beforePrimitive);
  if (afterPrimitive) viewer.scene.primitives.remove(afterPrimitive);
  beforePrimitive = makeTerrainPrimitive(false);
  afterPrimitive = makeTerrainPrimitive(true);
  viewer.scene.primitives.add(beforePrimitive);
  viewer.scene.primitives.add(afterPrimitive);
  beforePrimitive.show = !showAfter;
  afterPrimitive.show = showAfter;
}

function debrisColor(depth, maxDepth) {
  const t = clamp01(depth / Math.max(0.1, Math.min(maxDepth, 8)));
  const shallow = Cesium.Color.fromBytes(154, 138, 114, 225);
  const deep = Cesium.Color.fromBytes(51, 37, 29, 242);
  return mixColor(shallow, deep, t);
}


function expandedRenderCells(frame) {
  const src = new Map(frame.cells.map((c) => [`${c.row},${c.col}`, c]));
  const out = new Map(src);
  const neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const cell of renderCells) {
    for (const [dr, dc] of neighbors) {
      const nr = cell.row + dr;
      const nc = cell.col + dc;
      const key = `${nr},${nc}`;
      if (out.has(key)) continue;
      const opposite = src.get(`${cell.row - dr},${cell.col - dc}`);
      if (!opposite) continue;
      const terrainCell = data.terrain.find((t) => t.row === nr && t.col === nc);
      if (!terrainCell) continue;
      const depth = Math.min(cell.depth, opposite.depth) * 0.45;
      if (depth <= 0.05) continue;
      out.set(key, {
        row: nr, col: nc, x: terrainCell.x, y: terrainCell.y, lon: terrainCell.lon, lat: terrainCell.lat,
        terrain_z: terrainCell.original_z, depth,
        velocity_x: (cell.velocity_x + opposite.velocity_x) * 0.5,
        velocity_y: (cell.velocity_y + opposite.velocity_y) * 0.5,
        velocity: (cell.velocity + opposite.velocity) * 0.5,
        concentration: (cell.concentration + opposite.concentration) * 0.5,
        deposition_proxy: 0,
        progress_m: (cell.progress_m + opposite.progress_m) * 0.5,
        lateral_m: (cell.lateral_m + opposite.lateral_m) * 0.5,
        filler: true
      });
    }
  }
  return [...out.values()];
}

function flowProfileFactor(cell, frame) {
  const vals = frame.cells.map((c) => c.progress_m);
  const minP = Math.min(...vals);
  const maxP = Math.max(...vals);
  const f = (cell.progress_m - minP) / Math.max(1, maxP - minP);
  const front = Math.exp(-Math.pow((f - 0.92) / 0.18, 2));
  const body = Math.sin(Math.PI * clamp01(f));
  const tail = smoothstep(f / 0.22);
  return 0.35 + 0.72 * body * tail + 0.80 * front;
}

function makeDebrisPrimitive(frame) {
  const moveScale = movingScale();
  if (moveScale < 0.04 || !frame.cells.length) return null;
  const rows = data.meta.ny;
  const cols = data.meta.nx;
  const renderCells = expandedRenderCells(frame);
  const cellMap = new Map(renderCells.map((c) => [`${c.row},${c.col}`, c]));
  const cornerIndex = new Map();
  const positions = [];
  const colors = [];
  const indices = [];
  const maxDepth = frame.max_depth || 1;

  function interpCell(row, col) {
    const candidates = [
      cellMap.get(`${row},${col}`),
      cellMap.get(`${row - 1},${col}`),
      cellMap.get(`${row},${col - 1}`),
      cellMap.get(`${row - 1},${col - 1}`)
    ].filter(Boolean);
    if (!candidates.length) return null;
    const avg = { lon: 0, lat: 0, depth: 0, velocity: 0, progress_m: 0, lateral_m: 0 };
    for (const c of candidates) {
      avg.lon += c.lon; avg.lat += c.lat; avg.depth += c.depth; avg.velocity += c.velocity; avg.progress_m += c.progress_m || 0; avg.lateral_m += c.lateral_m || 0;
    }
    avg.lon /= candidates.length; avg.lat /= candidates.length; avg.depth /= candidates.length; avg.velocity /= candidates.length; avg.progress_m /= candidates.length; avg.lateral_m /= candidates.length;
    return avg;
  }

  function vertex(row, col) {
    const key = `${row},${col}`;
    if (cornerIndex.has(key)) return cornerIndex.get(key);
    const sample = interpCell(row, col);
    if (!sample) return -1;
    const lon = sample.lon + (col - Math.round(col)) * 0;
    const lat = sample.lat + (row - Math.round(row)) * 0;
    const profile = flowProfileFactor(sample, frame);
    const visualDepth = (Math.min(sample.depth, 3.0) * 1.55 + 0.35) * profile * (0.35 + moveScale * 0.65);
    const z = terrainAtLonLat(lon, lat) + visualDepth;
    const p = Cesium.Cartesian3.fromDegrees(lon, lat, z);
    const idx = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    const c = debrisColor(sample.depth, maxDepth);
    colors.push(c.red, c.green, c.blue, 0.72 + 0.18 * moveScale);
    cornerIndex.set(key, idx);
    return idx;
  }

  for (const cell of frame.cells) {
    const r = cell.row;
    const c = cell.col;
    const a = vertex(r, c);
    const b = vertex(r, c + 1);
    const c0 = vertex(r + 1, c);
    const d = vertex(r + 1, c + 1);
    if (a >= 0 && b >= 0 && c0 >= 0 && d >= 0) {
      indices.push(a, c0, b, b, c0, d);
    }
  }
  if (!positions.length || !indices.length) return null;
  let geom = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array(positions) }),
      color: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 4, values: new Float32Array(colors) })
    },
    indices: new Uint32Array(indices),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions)
  });
  geom = Cesium.GeometryPipeline.computeNormal(geom);
  return new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry: geom }),
    appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: true, closed: false }),
    asynchronous: false
  });
}
function clearTransport() {
  if (debrisPrimitive) { viewer.scene.primitives.remove(debrisPrimitive); debrisPrimitive = null; }
  particleEntities.forEach((e) => viewer.entities.remove(e));
  textureEntities.forEach((e) => viewer.entities.remove(e));
  debrisBlockEntities.forEach((e) => viewer.entities.remove(e));
  debrisBlobEntities.forEach((e) => viewer.entities.remove(e));
  debrisConnectorEntities.forEach((e) => viewer.entities.remove(e));
  stableBlobPool.forEach((e) => e.show = false);
  stableTexturePool.forEach((e) => e.show = false);
  if (frontEntity) frontEntity.show = false;
  if (depositionMoundEntity) depositionMoundEntity.show = false;
  if (depositionFanEntity) depositionFanEntity.show = false;
  if (valleyRibbonPrimitive) { viewer.scene.primitives.remove(valleyRibbonPrimitive); valleyRibbonPrimitive = null; }
  if (valleyEdgeRibbonPrimitive) { viewer.scene.primitives.remove(valleyEdgeRibbonPrimitive); valleyEdgeRibbonPrimitive = null; }
  particleEntities = [];
  textureEntities = [];
  debrisBlockEntities = [];
  debrisBlobEntities = [];
  debrisConnectorEntities = [];
  if (frontEntity) { viewer.entities.remove(frontEntity); frontEntity = null; }
  if (flowLineEntity) { viewer.entities.remove(flowLineEntity); flowLineEntity = null; }
}

function addFlowTexture(frame) {
  const cells = expandedRenderCells(frame).filter((c) => c.velocity > 0.05 && !c.filler).sort((a, b) => b.velocity - a.velocity).slice(0, 14);
  for (const cell of cells) {
    const speed = Math.hypot(cell.velocity_x, cell.velocity_y) || 1;
    const ux = cell.velocity_x / speed;
    const uy = cell.velocity_y / speed;
    const len = 12 + Math.min(18, cell.velocity * 5);
    const lonM = 1 / (111320 * Math.cos(cell.lat * Math.PI / 180));
    const latM = 1 / 110540;
    const p1 = [cell.lon - ux * len * 0.5 * lonM, cell.lat - uy * len * 0.5 * latM];
    const p2 = [cell.lon + ux * len * 0.5 * lonM, cell.lat + uy * len * 0.5 * latM];
    const z1 = terrainAtLonLat(p1[0], p1[1]) + Math.min(cell.depth, 3) * 2.2 + 1.2;
    const z2 = terrainAtLonLat(p2[0], p2[1]) + Math.min(cell.depth, 3) * 2.2 + 1.2;
    textureEntities.push(viewer.entities.add({
      polyline: {
        positions: [Cesium.Cartesian3.fromDegrees(p1[0], p1[1], z1), Cesium.Cartesian3.fromDegrees(p2[0], p2[1], z2)],
        width: 2,
        material: Cesium.Color.fromBytes(150, 112, 82, 85),
        clampToGround: false
      }
    }));
  }
}

function addParticles(frame) {
  const cells = frame.cells.filter((c) => c.velocity > 0.03);
  const count = Math.min(42, Math.max(12, Math.round(cells.length * 1.25 * Math.max(0.25, movingScale()))));
  for (let k = 0; k < count; k++) {
    const cell = cells[k % cells.length] || frame.cells[k % frame.cells.length];
    if (!cell) continue;
    const lon = cell.lon + (Math.sin(k * 12.99) * 0.5) * 0.00012;
    const lat = cell.lat + (Math.cos(k * 7.23) * 0.5) * 0.00010;
    const z = terrainAtLonLat(lon, lat) + Math.min(cell.depth, 3) * 2.2 + 3.0;
    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, z),
      ellipsoid: {
        radii: new Cesium.Cartesian3(5.8, 3.6, 1.6),
        material: Cesium.Color.fromBytes(70, 42, 28, 220)
      }
    });
    ent._baseCell = cell;
    ent._phase = k * 0.37;
    particleEntities.push(ent);
  }
}

function updateAnimatedParticles() {
  particleClock += 0.018;
  if (viewer && data && transport && showAfter) { makeValleyRibbon(interpolatedFrame(currentTime)); updateDepositionVisual(); }
  for (const ent of particleEntities) {
    const cell = ent._baseCell;
    const speed = Math.hypot(cell.velocity_x, cell.velocity_y) || 1;
    const ux = cell.velocity_x / speed;
    const uy = cell.velocity_y / speed;
    const adv = ((particleClock + ent._phase) % 1 - 0.5) * 18;
    const side = Math.sin((particleClock + ent._phase) * 8) * 4;
    const lonM = 1 / (111320 * Math.cos(cell.lat * Math.PI / 180));
    const latM = 1 / 110540;
    const lon = cell.lon + (ux * adv - uy * side) * lonM;
    const lat = cell.lat + (uy * adv + ux * side) * latM;
    ent.position = Cesium.Cartesian3.fromDegrees(lon, lat, terrainAtLonLat(lon, lat) + Math.min(cell.depth, 3) * 2.2 + 3.2);
  }
  viewer.scene.requestRender();
  rafId = requestAnimationFrame(updateAnimatedParticles);
}


function addDebrisBlocks(frame) {
  const moveScale = movingScale();
  if (moveScale < 0.03 || !frame.cells.length) return;
  const cells = expandedRenderCells(frame).filter((c) => c.depth > 0.04);
  const maxDepth = Math.max(0.1, frame.max_depth || 1);
  for (const cell of cells) {
    const profile = flowProfileFactor(cell, frame);
    const h = Math.max(2.5, (Math.min(cell.depth, 3.0) * 2.8 + 1.2) * profile * (0.45 + moveScale));
    const z = terrainAtLonLat(cell.lon, cell.lat) + h * 0.5 + 3.0;
    const deep = clamp01(cell.depth / Math.min(maxDepth, 8));
    const material = Cesium.Color.fromBytes(
      Math.round(92 - deep * 35),
      Math.round(56 - deep * 20),
      Math.round(34 - deep * 12),
      cell.filler ? 155 : 225
    );
    debrisBlockEntities.push(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(cell.lon, cell.lat, z),
      box: {
        dimensions: new Cesium.Cartesian3(cell.filler ? 18 : 23, cell.filler ? 18 : 23, h),
        material,
        outline: false
      }
    }));
  }
}



function addDebrisConnector(frame) {
  const moveScale = Math.max(0.25, movingScale());
  if (moveScale < 0.05 || frame.cells.length < 2) return;
  const ordered = [...frame.cells]
    .filter((c) => c.depth > 0.05)
    .sort((a, b) => a.progress_m - b.progress_m);
  const sampled = ordered.filter((_, i) => i % 2 === 0 || i === ordered.length - 1);
  if (sampled.length < 2) return;
  const positions = sampled.map((c) => Cesium.Cartesian3.fromDegrees(
    c.lon,
    c.lat,
    terrainAtLonLat(c.lon, c.lat) + 5 + Math.min(c.depth, 3) * 1.2
  ));
  debrisConnectorEntities.push(viewer.entities.add({
    polylineVolume: {
      positions,
      shape: [
        new Cesium.Cartesian2(-10, -2),
        new Cesium.Cartesian2(-6, 3),
        new Cesium.Cartesian2(0, 5),
        new Cesium.Cartesian2(6, 3),
        new Cesium.Cartesian2(10, -2)
      ],
      material: Cesium.Color.fromBytes(88, 52, 32, Math.round(150 + 60 * moveScale)),
      cornerType: Cesium.CornerType.ROUNDED
    }
  }));
}


function ensureStablePools() {
  if (stableBlobPool.length) return;
  for (let i = 0; i < 90; i++) {
    stableBlobPool.push(viewer.entities.add({
      show: false,
      position: Cesium.Cartesian3.fromDegrees(data.controls.C2.lon, data.controls.C2.lat, data.controls.C2.z + 10),
      ellipsoid: {
        radii: new Cesium.Cartesian3(1, 1, 1),
        material: Cesium.Color.fromBytes(80, 48, 30, 220),
        outline: false
      }
    }));
  }
  for (let i = 0; i < 18; i++) {
    stableTexturePool.push(viewer.entities.add({
      show: false,
      polyline: {
        positions: [],
        width: 2,
        material: Cesium.Color.fromBytes(150, 112, 82, 85),
        clampToGround: false
      }
    }));
  }
  frontEntity = viewer.entities.add({
    show: false,
    position: Cesium.Cartesian3.fromDegrees(data.controls.C2.lon, data.controls.C2.lat, data.controls.C2.z + 20),
    ellipsoid: {
      radii: new Cesium.Cartesian3(44, 32, 8),
      material: Cesium.Color.fromBytes(51, 37, 29, 245),
      outline: false
    }
  });
  stableFrontReady = true;
}


function valleyPoint(t) {
  const pts = [data.controls.C2, data.controls.C1, data.controls.valleyBottom];
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len });
    total += len;
  }
  let dist = clamp01(t) * total;
  for (const seg of segs) {
    if (dist <= seg.len) {
      const f = dist / Math.max(1, seg.len);
      return {
        lon: seg.a.lon + (seg.b.lon - seg.a.lon) * f,
        lat: seg.a.lat + (seg.b.lat - seg.a.lat) * f,
        x: seg.a.x + (seg.b.x - seg.a.x) * f,
        y: seg.a.y + (seg.b.y - seg.a.y) * f
      };
    }
    dist -= seg.len;
  }
  const last = pts[pts.length - 1];
  return { lon: last.lon, lat: last.lat, x: last.x, y: last.y };
}

function makeValleyRibbon(frame) {
  if (valleyRibbonPrimitive) {
    viewer.scene.primitives.remove(valleyRibbonPrimitive);
    valleyRibbonPrimitive = null;
  }
  const move = movingScale();
  if (move < 0.04) return;
  const cells = frame.cells.filter((c) => c.depth > 0.05);
  if (!cells.length) return;
  const progresses = cells.map((c) => c.progress_m);
  const maxProgress = Math.max(...progresses);
  const totalLen = Math.hypot(data.controls.C1.x - data.controls.C2.x, data.controls.C1.y - data.controls.C2.y)
    + Math.hypot(data.controls.valleyBottom.x - data.controls.C1.x, data.controls.valleyBottom.y - data.controls.C1.y);
  const head = clamp01((maxProgress + 45) / Math.max(1, totalLen));
  const tail = clamp01(head - (0.22 + 0.30 * move));
  const steps = 52;
  const positions = [];
  const colors = [];
  const indices = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const along = tail + (head - tail) * f;
    const p = valleyPoint(along);
    const prev = valleyPoint(Math.max(0, along - 0.012));
    const next = valleyPoint(Math.min(1, along + 0.012));
    const dx = next.lon - prev.lon;
    const dy = next.lat - prev.lat;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const body = Math.sin(Math.PI * f);
    const front = Math.exp(-Math.pow((f - 0.91) / 0.16, 2));
    const tailThin = smoothstep(f / 0.22);
    const widthDeg = (0.00025 + 0.00034 * body + 0.00018 * front) * (0.84 + 0.50 * move);
    const wave = 1.0 + 0.10 * Math.sin(i * 0.85 - currentTime * 0.12) + 0.06 * Math.sin(i * 1.7 - currentTime * 0.21);
    const thickness = (5.4 + 7.8 * body + 14.0 * front) * (0.62 + 0.72 * move) * tailThin * wave;
    const colorT = clamp01(0.35 + front * 0.45 + body * 0.2);
    const ramp = colorT < 0.55 ? colorT / 0.55 : (colorT - 0.55) / 0.45;
    const c = colorT < 0.55
      ? Cesium.Color.fromBytes(
          Math.round(138 + (105 - 138) * ramp),
          Math.round(122 + (78 - 122) * ramp),
          Math.round(96 + (56 - 96) * ramp),
          230
        )
      : Cesium.Color.fromBytes(
          Math.round(105 + (48 - 105) * ramp),
          Math.round(78 + (38 - 78) * ramp),
          Math.round(56 + (31 - 56) * ramp),
          228
        );
    for (const side of [-1, 1]) {
      const wiggle = Math.sin(i * 1.35 - currentTime * 0.08 + side * 1.7) * 0.000020 + Math.sin(i * 2.25 - currentTime * 0.13) * 0.000008;
      const lon = p.lon + nx * side * widthDeg + nx * wiggle;
      const lat = p.lat + ny * side * widthDeg + ny * wiggle;
      const z = terrainAtLonLat(lon, lat) + 3.5 + thickness;
      const cart = Cesium.Cartesian3.fromDegrees(lon, lat, z);
      positions.push(cart.x, cart.y, cart.z);
      colors.push(c.red, c.green, c.blue, c.alpha);
    }
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  let geom = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array(positions) }),
      color: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 4, values: new Float32Array(colors) })
    },
    indices: new Uint32Array(indices),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions)
  });
  geom = Cesium.GeometryPipeline.computeNormal(geom);
  valleyRibbonPrimitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry: geom }),
    appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: true, closed: false }),
    asynchronous: false
  });
  viewer.scene.primitives.add(valleyRibbonPrimitive);
  makeValleyEdgeFeather(tail, head, steps);
}

function makeValleyEdgeFeather(tail, head, steps) {
  const positions = [];
  const colors = [];
  const indices = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const along = tail + (head - tail) * f;
    const p = valleyPoint(along);
    const prev = valleyPoint(Math.max(0, along - 0.012));
    const next = valleyPoint(Math.min(1, along + 0.012));
    const dx = next.lon - prev.lon;
    const dy = next.lat - prev.lat;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const body = Math.sin(Math.PI * f);
    const front = Math.exp(-Math.pow((f - 0.91) / 0.16, 2));
    const tailThin = smoothstep(f / 0.22);
    const inner = (0.00023 + 0.00030 * body + 0.00016 * front) * 1.03;
    const outer = inner + (0.00013 + 0.00009 * body);
    const zBase = terrainAtLonLat(p.lon, p.lat) + 3.1 + (2.0 + 3.5 * body + 4.0 * front) * tailThin;
    const c = Cesium.Color.fromBytes(108, 88, 72, Math.round(105 + 45 * body));
    for (const side of [-1, 1]) {
      for (const width of [inner, outer]) {
        const lon = p.lon + nx * side * width;
        const lat = p.lat + ny * side * width;
        const cart = Cesium.Cartesian3.fromDegrees(lon, lat, zBase);
        positions.push(cart.x, cart.y, cart.z);
        colors.push(c.red, c.green, c.blue, width === outer ? 0.12 : c.alpha);
      }
    }
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 4;
    const b = a + 4;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
  }
  if (!positions.length) return;
  let geom = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array(positions) }),
      color: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 4, values: new Float32Array(colors) })
    },
    indices: new Uint32Array(indices),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions)
  });
  geom = Cesium.GeometryPipeline.computeNormal(geom);
  valleyEdgeRibbonPrimitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry: geom }),
    appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: true, closed: false }),
    asynchronous: false
  });
  viewer.scene.primitives.add(valleyEdgeRibbonPrimitive);
}


function ensureDepositionEntities() {
  if (depositionMoundEntity && depositionFanEntity) return;
  const vb = data.controls.valleyBottom;
  const c1 = data.controls.C1;
  const lon = (vb.lon * 0.62 + c1.lon * 0.38);
  const lat = (vb.lat * 0.62 + c1.lat * 0.38);
  depositionFanEntity = viewer.entities.add({
    show: false,
    position: Cesium.Cartesian3.fromDegrees(lon, lat, terrainAtLonLat(lon, lat) + 2),
    ellipsoid: {
      radii: new Cesium.Cartesian3(1, 1, 1),
      material: Cesium.Color.fromBytes(122, 93, 66, 120),
      outline: false
    }
  });
  depositionMoundEntity = viewer.entities.add({
    show: false,
    position: Cesium.Cartesian3.fromDegrees(lon, lat, terrainAtLonLat(lon, lat) + 3),
    ellipsoid: {
      radii: new Cesium.Cartesian3(1, 1, 1),
      material: Cesium.Color.fromBytes(96, 70, 50, 165),
      outline: false
    }
  });
}

function updateDepositionVisual() {
  ensureDepositionEntities();
  const dep = clamp01(volumeScales().deposited / TOTAL_VOLUME);
  if (dep < 0.04) {
    depositionMoundEntity.show = false;
    depositionFanEntity.show = false;
    return;
  }
  const vb = data.controls.valleyBottom;
  const c1 = data.controls.C1;
  const lon = (vb.lon * 0.62 + c1.lon * 0.38);
  const lat = (vb.lat * 0.62 + c1.lat * 0.38);
  const z = terrainAtLonLat(lon, lat);
  const grow = Math.sqrt(clamp01(dep)) * (0.82 + 0.18 * smoothstep(dep));
  depositionFanEntity.position = Cesium.Cartesian3.fromDegrees(lon, lat, z + 1.8 + grow * 1.8);
  depositionFanEntity.ellipsoid.radii = new Cesium.Cartesian3(28 + 92 * grow, 20 + 70 * grow, 0.8 + 5.8 * grow);
  depositionFanEntity.ellipsoid.material = Cesium.Color.fromBytes(132, 102, 72, Math.round(70 + 70 * grow));
  depositionFanEntity.show = true;

  depositionMoundEntity.position = Cesium.Cartesian3.fromDegrees(lon + 0.00010, lat - 0.00005, z + 2.2 + grow * 4.0);
  depositionMoundEntity.ellipsoid.radii = new Cesium.Cartesian3(14 + 54 * grow, 10 + 40 * grow, 0.8 + 8.2 * grow);
  depositionMoundEntity.ellipsoid.material = Cesium.Color.fromBytes(96, 70, 50, Math.round(95 + 95 * grow));
  depositionMoundEntity.show = true;
}

function updateStableDebris(frame) {
  ensureStablePools();
  makeValleyRibbon(frame);
  updateDepositionVisual();
  const moveScale = Math.max(0.35, movingScale());
  const cells = frame.cells.filter((c) => c.depth > 0.05 && c.velocity > 0.02).sort((a, b) => b.progress_m - a.progress_m).slice(0, 1);
  const maxDepth = Math.max(0.1, frame.max_depth || 1);
  const minP = Math.min(...frame.cells.map((c) => c.progress_m));
  const maxP = Math.max(...frame.cells.map((c) => c.progress_m));

  for (let i = 0; i < stableBlobPool.length; i++) {
    const ent = stableBlobPool[i];
    const cell = cells[i];
    if (!cell) { ent.show = false; continue; }
    const f = (cell.progress_m - minP) / Math.max(1, maxP - minP);
    const front = Math.exp(-Math.pow((f - 0.92) / 0.20, 2));
    const body = 0.55 + 0.45 * Math.sin(Math.PI * clamp01(f));
    const depthFactor = clamp01(cell.depth / Math.min(maxDepth, 8));
    const z = terrainAtLonLat(cell.lon, cell.lat) + 7 + depthFactor * 10 + front * 8;
    const rx = 1.2 + depthFactor * 0.8 + front * 1.2;
    const ry = 0.9 + depthFactor * 0.6 + front * 0.9;
    const rz = (0.3 + depthFactor * 0.4 + front * 0.6) * body * moveScale;
    ent.position = Cesium.Cartesian3.fromDegrees(cell.lon, cell.lat, z);
    ent.ellipsoid.radii = new Cesium.Cartesian3(rx, ry, Math.max(3, rz));
    const br = depthFactor < 0.55 ? depthFactor / 0.55 : (depthFactor - 0.55) / 0.45;
    ent.ellipsoid.material = depthFactor < 0.55
      ? Cesium.Color.fromBytes(
          Math.round(154 + (109 - 154) * br),
          Math.round(138 + (79 - 138) * br),
          Math.round(114 + (54 - 114) * br),
          150
        )
      : Cesium.Color.fromBytes(
          Math.round(109 + (51 - 109) * br),
          Math.round(79 + (37 - 79) * br),
          Math.round(54 + (29 - 54) * br),
          165
        );
    ent.show = true;
  }

  const textureCells = [];
  for (let i = 0; i < stableTexturePool.length; i++) {
    const ent = stableTexturePool[i];
    const cell = textureCells[i];
    if (!cell) { ent.show = false; continue; }
    const speed = Math.hypot(cell.velocity_x, cell.velocity_y) || 1;
    const ux = cell.velocity_x / speed;
    const uy = cell.velocity_y / speed;
    const len = 12 + Math.min(18, cell.velocity * 5);
    const lonM = 1 / (111320 * Math.cos(cell.lat * Math.PI / 180));
    const latM = 1 / 110540;
    const phase = (particleClock * 20) % 10;
    const p1 = [cell.lon - ux * (len * 0.5 - phase) * lonM, cell.lat - uy * (len * 0.5 - phase) * latM];
    const p2 = [cell.lon + ux * (len * 0.5 + phase) * lonM, cell.lat + uy * (len * 0.5 + phase) * latM];
    const z1 = terrainAtLonLat(p1[0], p1[1]) + Math.min(cell.depth, 3) * 2.2 + 1.2;
    const z2 = terrainAtLonLat(p2[0], p2[1]) + Math.min(cell.depth, 3) * 2.2 + 1.2;
    ent.polyline.positions = [Cesium.Cartesian3.fromDegrees(p1[0], p1[1], z1), Cesium.Cartesian3.fromDegrees(p2[0], p2[1], z2)];
    ent.show = true;
  }

  if (frame.front && frontEntity) {
    const f = frame.front;
    frontEntity.position = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, terrainAtLonLat(f.lon, f.lat) + Math.min(f.depth, 3) * 2.2 + 9);
    frontEntity.show = true;
  }
  viewer.scene.requestRender();
}

function addDebrisBlobs(frame) {
  const moveScale = Math.max(0.35, movingScale());
  if (!frame.cells.length) return;
  const cells = frame.cells.filter((c) => c.depth > 0.05);
  const maxDepth = Math.max(0.1, frame.max_depth || 1);
  const minP = Math.min(...cells.map((c) => c.progress_m));
  const maxP = Math.max(...cells.map((c) => c.progress_m));
  for (const cell of cells) {
    const f = (cell.progress_m - minP) / Math.max(1, maxP - minP);
    const front = Math.exp(-Math.pow((f - 0.92) / 0.20, 2));
    const body = 0.55 + 0.45 * Math.sin(Math.PI * clamp01(f));
    const depthFactor = clamp01(cell.depth / Math.min(maxDepth, 8));
    const z = terrainAtLonLat(cell.lon, cell.lat) + 7 + depthFactor * 10 + front * 8;
    const rx = 1.2 + depthFactor * 0.8 + front * 1.2;
    const ry = 0.9 + depthFactor * 0.6 + front * 0.9;
    const rz = (0.3 + depthFactor * 0.4 + front * 0.6) * body * moveScale;
    const material = Cesium.Color.fromBytes(
      Math.round(86 - depthFactor * 36),
      Math.round(52 - depthFactor * 20),
      Math.round(33 - depthFactor * 10),
      238
    );
    debrisBlobEntities.push(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(cell.lon, cell.lat, z),
      ellipsoid: {
        radii: new Cesium.Cartesian3(rx, ry, Math.max(3, rz)),
        material,
        outline: false
      }
    }));
  }
}

function updateTransport() {
  if (!showAfter) { clearTransport(); return; }
  const frame = interpolatedFrame(currentTime);
  updateReadout(frame);
  updateStableDebris(frame);
  return;

  if (frame.front) {
    const f = frame.front;
    frontEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(f.lon, f.lat, terrainAtLonLat(f.lon, f.lat) + Math.min(f.depth, 3) * 2.2 + 9),
      ellipsoid: {
        radii: new Cesium.Cartesian3(44, 32, 8),
        material: Cesium.Color.fromBytes(51, 37, 29, 245),
        outline: false
      }
    });
  }

  // Official presentation mode: no debug centerline or wet-cell outlines.
  viewer.scene.requestRender();
}

function updateReadout(frame = interpolatedFrame(currentTime)) {
  const v = volumeScales();
  ui.erosion.textContent = `${Math.round(v.eroded).toLocaleString()} m\u00b3`;
  if (ui.moving) ui.moving.textContent = `${Math.round(v.moving).toLocaleString()} m\u00b3`;
  ui.dep.textContent = `${Math.round(v.deposited).toLocaleString()} m\u00b3`;
  ui.maxE.textContent = `${((data.deltaRange.maxErosionDepth || 0) * clamp01(v.eroded / TOTAL_VOLUME)).toFixed(2)} m`;
  ui.maxD.textContent = `+${((data.deltaRange.maxDepositionHeight || 0) * clamp01(v.deposited / TOTAL_VOLUME)).toFixed(2)} m`;
  ui.mode.textContent = `\u6a21\u64ec\u6642\u9593\uff1a${frame.time} \u79d2`;
  ui.timeLabel.textContent = `${frame.time}s`;
  ui.time.value = String(frame.time);
}

function setTime(t, rebuild = false) {
  currentTime = Math.max(150, Math.min(600, Number(t) || 300));
  showAfter = true;
  if (rebuild || lastTerrainSecond === null) {
    rebuildTerrain();
    lastTerrainSecond = currentTime;
  } else {
    beforePrimitive.show = false;
    afterPrimitive.show = true;
  }
  updateTransport();
}

function playAnimation() {
  stopAnimation();
  showAfter = true;
  if (currentTime >= 600 || currentTime < 150) setTime(150, false);
  playTimer = setInterval(() => {
    const next = currentTime + 5;
    setTime(next > 600 ? 600 : next, false);
    if (next >= 600) stopAnimation();
  }, 120);
}
function stopAnimation() { if (playTimer) { clearInterval(playTimer); playTimer = null; } }

function addPoint(label, ctrl, color) {
  pointEntities.push(viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(ctrl.lon, ctrl.lat, ctrl.z + 18),
    point: { pixelSize: 12, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
    label: { text: label, font: '14px sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -24), disableDepthTestDistance: Number.POSITIVE_INFINITY }
  }));
}


function addTestBuildings() {
  buildingEntities.forEach((e) => viewer.entities.remove(e));
  buildingEntities = [];
  const c1 = data.controls.C1;
  const vb = data.controls.valleyBottom;
  const vx = vb.lon - c1.lon;
  const vy = vb.lat - c1.lat;
  const len = Math.hypot(vx, vy) || 1;
  const nx = -vy / len;
  const ny = vx / len;
  const spots = [];

  for (let i = 0; i < 100; i++) {
    const group = Math.floor(i / 10);
    const within = i % 10;
    const f = 0.10 + group * 0.082 + (within % 3) * 0.014 + Math.sin(i * 2.13) * 0.006;
    const lane = (within % 7) - 3;
    const spread = 0.000060 + 0.000030 * Math.sin(group * 0.9 + 1.0);
    const sideOffset = lane * spread + Math.sin(i * 1.37) * 0.000030;
    spots.push({
      f: Math.max(0.08, Math.min(0.94, f)),
      sideOffset,
      w: 7.0 + (i % 5) * 1.7,
      d: 6.0 + ((i + 2) % 5) * 1.45,
      h: 4.5 + (i % 4) * 1.25,
      angle: Math.sin(i * 0.77) * 0.75
    });
  }

  for (const b of spots) {
    const lon = c1.lon + vx * b.f + nx * b.sideOffset;
    const lat = c1.lat + vy * b.f + ny * b.sideOffset;
    const z = terrainAtLonLat(lon, lat) + b.h / 2 + 0.8;
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(
      Cesium.Cartesian3.fromDegrees(lon, lat, z),
      new Cesium.HeadingPitchRoll(b.angle, 0, 0)
    );
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, z),
      orientation,
      box: {
        dimensions: new Cesium.Cartesian3(b.w, b.d, b.h),
        material: Cesium.Color.fromBytes(246, 246, 238, 224),
        outline: true,
        outlineColor: Cesium.Color.fromBytes(55, 55, 55, 120)
      }
    });
    buildingEntities.push(entity);
  }
}
function addControls() {
  addPoint('\u571f\u77f3\u6d41\u8f38\u5165\u53e3', data.controls.C2, Cesium.Color.RED);
  addPoint('\u4e0b\u6e38\u63a7\u5236\u9ede', data.controls.C1, Cesium.Color.YELLOW);
  addPoint('\u8c37\u5e95', data.controls.valleyBottom, Cesium.Color.CYAN);
}

function fly(kind) {
  const c2 = data.controls.C2;
  const c1 = data.controls.C1;
  const vb = data.controls.valleyBottom;
  const lon = (c2.lon + c1.lon + vb.lon) / 3;
  const lat = (c2.lat + c1.lat + vb.lat) / 3;
  if (kind === 'top') {
    viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, 1850), orientation: { heading: 0, pitch: Cesium.Math.toRadians(-88), roll: 0 } });
    return;
  }
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(lon - 0.0054, lat - 0.0023, 820),
    orientation: { heading: Cesium.Math.toRadians(58), pitch: Cesium.Math.toRadians(-34), roll: 0 }
  });
}

async function init() {
  status('?? DF055 transport keyframes...');
  data = await fetch('data/deformation-step-a.json').then((r) => r.json());
  transport = await fetch('data/transport-keyframes.json').then((r) => r.json());

  viewer = new Cesium.Viewer('cesiumContainer', {
    imageryProvider: false,
    baseLayerPicker: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    requestRenderMode: false
  });
  viewer.scene.globe.show = false;
  viewer.scene.backgroundColor = Cesium.Color.fromBytes(6, 10, 14);
  viewer.scene.highDynamicRange = false;
  viewer.scene.light = new Cesium.DirectionalLight({ direction: Cesium.Cartesian3.normalize(new Cesium.Cartesian3(0.45, 0.25, -1.0), new Cesium.Cartesian3()), intensity: 2.4 });

  ui.mult.value = String(multiplier);
  ui.before.addEventListener('click', () => { stopAnimation(); showAfter = false; rebuildTerrain(); clearTransport(); ui.mode.textContent = '\u707d\u524d\u539f\u59cb\u5730\u5f62'; });
  ui.after.addEventListener('click', () => { stopAnimation(); setTime(600, true); });
  ui.toggle.addEventListener('click', () => { stopAnimation(); showAfter = !showAfter; if (showAfter) setTime(currentTime); else { rebuildTerrain(); clearTransport(); } });
  ui.top.addEventListener('click', () => fly('top'));
  ui.oblique.addEventListener('click', () => fly('oblique'));
  ui.mult.addEventListener('change', () => { multiplier = Number(ui.mult.value); setTime(currentTime, true); });
  ui.play.addEventListener('click', playAnimation);
  ui.pause.addEventListener('click', stopAnimation);
  ui.reset.addEventListener('click', () => { stopAnimation(); setTime(150, true); });
  ui.time.min = '150';
  ui.time.max = '600';
  ui.time.step = '5';
  ui.time.addEventListener('input', (event) => { stopAnimation(); setTime(event.target.value, false); });

  rebuildTerrain();
  addControls();
  addTestBuildings();
  setTime(300, true);
  fly('oblique');
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(updateAnimatedParticles);
  status('Viscous debris ribbon with 100 test settlement buildings ready.');
}

init().catch((err) => {
  console.error(err);
  status(`\u8f09\u5165\u5931\u6557\uff1a${err.message}`);
});
