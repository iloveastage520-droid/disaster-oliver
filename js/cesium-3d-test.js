const CesiumLib = window.Cesium;

window.addEventListener("error", (event) => {
  showCesiumError(`Cesium 場景錯誤：${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || String(event.reason || "unknown error");
  showCesiumError(`Cesium 非同步載入錯誤：${message}`);
});

if (!CesiumLib) {
  showCesiumError("CesiumJS 載入失敗，請確認瀏覽器可以連到 cdnjs.cloudflare.com。");
  throw new Error("CesiumJS is not available.");
}

CesiumLib.Ion.defaultAccessToken = "";

const viewer = new CesiumLib.Viewer("cesium-container", {
  animation: false,
  baseLayer: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: true,
  sceneModePicker: false,
  selectionIndicator: true,
  timeline: false,
  navigationHelpButton: false,
  shouldAnimate: true,
  terrainProvider: new CesiumLib.EllipsoidTerrainProvider()
});

viewer.imageryLayers.removeAll();
viewer.imageryLayers.addImageryProvider(new CesiumLib.UrlTemplateImageryProvider({
  url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
  credit: "Google hybrid satellite",
  maximumLevel: 19
}));

viewer.scene.backgroundColor = CesiumLib.Color.fromCssColorString("#07111f");
viewer.scene.globe.depthTestAgainstTerrain = false;
viewer.scene.globe.enableLighting = false;
viewer.scene.globe.baseColor = CesiumLib.Color.fromCssColorString("#102033");
viewer.scene.skyAtmosphere.show = true;
viewer.scene.postProcessStages.fxaa.enabled = true;
if (viewer.scene.postProcessStages.bloom) {
  viewer.scene.postProcessStages.bloom.enabled = false;
}

const cameraViews = {
  overview: {
    destination: CesiumLib.Cartesian3.fromDegrees(121.5750, 25.0400, 9200),
    orientation: {
      heading: CesiumLib.Math.toRadians(0),
      pitch: CesiumLib.Math.toRadians(-58),
      roll: 0
    }
  },
  low: {
    destination: CesiumLib.Cartesian3.fromDegrees(121.5442, 25.0197, 1350),
    orientation: {
      heading: CesiumLib.Math.toRadians(48),
      pitch: CesiumLib.Math.toRadians(-22),
      roll: 0
    }
  },
  tower: {
    destination: CesiumLib.Cartesian3.fromDegrees(121.5700, 25.0400, 2600),
    orientation: {
      heading: CesiumLib.Math.toRadians(118),
      pitch: CesiumLib.Math.toRadians(-34),
      roll: 0
    }
  }
};

const TAIPEI_BUILDING_LAYER =
  "https://arcgis.tpgos.gov.taipei/arcgis/rest/services/DO/NEW_RENEWAL_DO_V3/MapServer/56/query";
const REAL_BUILDING_BOUNDS = {
  xmin: 121.5000,
  ymin: 24.9600,
  xmax: 121.6500,
  ymax: 25.1000
};
const REAL_BUILDING_GRID = { columns: 24, rows: 24 };
const MAX_REAL_BUILDINGS = 18000;
const BUILDING_QUERY_CONCURRENCY = 10;
const BUILDING_RAIN_TINT_LIMIT = 2600;
const SIMULATED_CLOUD_BOTTOM = 1550;
const SIMULATED_CLOUD_TOP = 1680;
const WIND_VECTOR = { lon: 0.0027, lat: 0.00055 };
const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";

let radarFrames = [];
let radarHost = "";
let radarFrameIndex = 0;
let radarLayer = null;
let radarTimer = null;
let simulatedRadarEntities = [];
let radarCloudEntities = [];
let floodOverlayEntities = [];
let simulatedRadarTimer = null;
let simulatedRadarFrame = 0;
let windEntities = [];
let realBuildingEntities = [];

function flyToView(viewName) {
  viewer.camera.flyTo({
    ...cameraViews[viewName],
    duration: 1.4
  });
}

function setCameraView(viewName) {
  viewer.camera.setView(cameraViews[viewName]);
}

document.querySelectorAll("[data-camera]").forEach((button) => {
  button.addEventListener("click", () => flyToView(button.dataset.camera));
});

const realBuildingToggle = document.querySelector("#cesium-real-building-toggle");
realBuildingToggle.addEventListener("change", async () => {
  if (realBuildingToggle.checked && realBuildingEntities.length === 0) {
    await loadRealBuildings();
    return;
  }
  realBuildingEntities.forEach((entity) => {
    entity.show = realBuildingToggle.checked;
  });
});

const radarToggle = document.querySelector("#cesium-radar-toggle");
const radarPlay = document.querySelector("#cesium-radar-play");
const simulatedRadarToggle = document.querySelector("#cesium-simulated-radar-toggle");
const windToggle = document.querySelector("#cesium-wind-toggle");
radarToggle.addEventListener("change", async () => {
  if (radarToggle.checked && !radarLayer) {
    await loadRadarLayer();
    return;
  }
  if (radarLayer) radarLayer.show = radarToggle.checked;
  if (!radarToggle.checked) stopRadarPlayback();
});
radarPlay.addEventListener("click", async () => {
  if (!radarLayer) await loadRadarLayer();
  if (radarTimer) {
    stopRadarPlayback();
    return;
  }
  startRadarPlayback();
});
simulatedRadarToggle.addEventListener("change", () => {
  if (!simulatedRadarEntities.length) addSimulatedRadar();
  simulatedRadarEntities.forEach((entity) => {
    entity.show = simulatedRadarToggle.checked;
  });
  radarCloudEntities.forEach((entity) => {
    entity.show = simulatedRadarToggle.checked;
  });
  floodOverlayEntities.forEach((entity) => {
    entity.show = simulatedRadarToggle.checked;
  });
  if (simulatedRadarToggle.checked) {
    startSimulatedRadarAnimation();
  } else {
    stopSimulatedRadarAnimation();
  }
});
windToggle.addEventListener("change", () => {
  windEntities.forEach((entity) => {
    entity.show = windToggle.checked;
  });
});

setCameraView("low");
loadRealBuildings();
loadRadarLayer();
addSimulatedRadar();
addWindIndicators();
startSimulatedRadarAnimation();
setTimeout(checkCesiumCanvas, 2500);

function showCesiumError(message) {
  const container = document.querySelector("#cesium-container");
  if (!container) return;
  const panel = document.createElement("div");
  panel.className = "cesium-error-panel";
  panel.textContent = message;
  container.append(panel);
}

function checkCesiumCanvas() {
  const canvas = document.querySelector("#cesium-container canvas");
  if (!canvas) {
    showCesiumError("Cesium canvas 沒有建立，請重新整理或確認瀏覽器支援 WebGL。");
    return;
  }
  const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!context) {
    showCesiumError("瀏覽器沒有啟用 WebGL，Cesium 3D 地圖無法顯示。");
  }
}

function buildingColor(height) {
  if (height >= 120) return CesiumLib.Color.fromCssColorString("#f8fafc");
  if (height >= 70) return CesiumLib.Color.fromCssColorString("#e5e7eb");
  if (height >= 35) return CesiumLib.Color.fromCssColorString("#cbd5e1");
  return CesiumLib.Color.fromCssColorString("#94a3b8");
}

function radarGlowColor(dbz) {
  if (dbz >= 55) return CesiumLib.Color.fromCssColorString("#c084fc");
  if (dbz >= 45) return CesiumLib.Color.fromCssColorString("#fb7185");
  if (dbz >= 35) return CesiumLib.Color.fromCssColorString("#fde047");
  return CesiumLib.Color.fromCssColorString("#4ade80");
}

async function loadRealBuildings() {
  setRealBuildingStatus("讀取中");
  try {
    const data = await fetchRealBuildingGeojson();
    realBuildingEntities = data.features
      .map((feature) => addRealBuilding(feature))
      .filter(Boolean);
    realBuildingEntities.forEach((entity) => {
      entity.show = realBuildingToggle.checked;
    });
    setRealBuildingStatus(`${realBuildingEntities.length} 棟`);
    updateSimulatedRadarFrame();
  } catch (error) {
    setRealBuildingStatus("讀取失敗");
    showCesiumError(`真實建物資料讀取失敗：${error.message}`);
  }
}

async function fetchRealBuildingGeojson() {
  const seen = new Set();
  const features = [];
  const cells = buildBuildingCells();
  let nextCellIndex = 0;

  async function worker() {
    while (nextCellIndex < cells.length && features.length < MAX_REAL_BUILDINGS) {
      const cell = cells[nextCellIndex];
      nextCellIndex += 1;
      let data;
      try {
        data = await queryRealBuildingCell(cell);
      } catch (error) {
        console.warn("Skip building cell", cell, error);
        continue;
      }
      data.features.forEach((feature) => {
        const key = feature.properties?.OBJECTID || feature.id;
        if (key == null || seen.has(key) || features.length >= MAX_REAL_BUILDINGS) return;
        seen.add(key);
        features.push(feature);
      });
      setRealBuildingStatus(`${features.length} 棟`);
    }
  }

  const workers = Array.from(
    { length: Math.min(BUILDING_QUERY_CONCURRENCY, cells.length) },
    () => worker()
  );
  await Promise.all(workers);

  return { type: "FeatureCollection", features };
}

function buildBuildingCells() {
  const cells = [];
  const cellWidth = (REAL_BUILDING_BOUNDS.xmax - REAL_BUILDING_BOUNDS.xmin) / REAL_BUILDING_GRID.columns;
  const cellHeight = (REAL_BUILDING_BOUNDS.ymax - REAL_BUILDING_BOUNDS.ymin) / REAL_BUILDING_GRID.rows;
  const centerLon = (REAL_BUILDING_BOUNDS.xmin + REAL_BUILDING_BOUNDS.xmax) / 2;
  const centerLat = (REAL_BUILDING_BOUNDS.ymin + REAL_BUILDING_BOUNDS.ymax) / 2;

  for (let column = 0; column < REAL_BUILDING_GRID.columns; column += 1) {
    for (let row = 0; row < REAL_BUILDING_GRID.rows; row += 1) {
      const xmin = REAL_BUILDING_BOUNDS.xmin + cellWidth * column;
      const xmax = column === REAL_BUILDING_GRID.columns - 1
        ? REAL_BUILDING_BOUNDS.xmax
        : xmin + cellWidth;
      const ymin = REAL_BUILDING_BOUNDS.ymin + cellHeight * row;
      const ymax = row === REAL_BUILDING_GRID.rows - 1
        ? REAL_BUILDING_BOUNDS.ymax
        : ymin + cellHeight;
      const lon = (xmin + xmax) / 2;
      const lat = (ymin + ymax) / 2;
      cells.push({
        xmin,
        ymin,
        xmax,
        ymax,
        distance: Math.hypot(lon - centerLon, lat - centerLat)
      });
    }
  }

  return cells.sort((a, b) => a.distance - b.distance);
}

async function queryRealBuildingCell(bounds) {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "OBJECTID,NO,Height,Floor,樓層註記,屋頂高程,出入口高程",
    returnGeometry: "true",
    geometryType: "esriGeometryEnvelope",
    geometry: `${bounds.xmin},${bounds.ymin},${bounds.xmax},${bounds.ymax}`,
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    f: "geojson"
  });
  const response = await fetch(`${TAIPEI_BUILDING_LAYER}?${params.toString()}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "ArcGIS query error");
  if (!Array.isArray(data.features)) throw new Error("ArcGIS response missing features");
  return data;
}

function addRealBuilding(feature) {
  const ring = feature.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const properties = feature.properties || {};
  const height = parseBuildingHeight(properties);
  const center = polygonCenter(ring);
  const baseColor = buildingColor(height);
  const entity = viewer.entities.add({
    name: `真實建物 ${properties.NO || properties.OBJECTID || ""}`,
    description: [
      `高度：${height.toFixed(1)}m`,
      `樓層：${properties.Floor ?? "無資料"}`,
      `樓層註記：${properties["樓層註記"] || "無資料"}`
    ].join("<br>"),
    polygon: {
      hierarchy: CesiumLib.Cartesian3.fromDegreesArray(ring.flat()),
      height: 0,
      extrudedHeight: height,
      material: baseColor,
      outline: true,
      outlineColor: CesiumLib.Color.WHITE.withAlpha(0.34)
    },
    position: CesiumLib.Cartesian3.fromDegrees(center.lon, center.lat, height + 5)
  });
  entity.realBuildingMeta = { center, height };
  return entity;
}

function parseBuildingHeight(properties) {
  const directHeight = Number.parseFloat(properties.Height);
  if (Number.isFinite(directHeight) && directHeight > 0) return directHeight;

  const roof = Number.parseFloat(properties["屋頂高程"]);
  const entrance = Number.parseFloat(properties["出入口高程"]);
  if (Number.isFinite(roof) && Number.isFinite(entrance) && roof > entrance) {
    return roof - entrance;
  }

  const floor = Number.parseFloat(properties.Floor);
  if (Number.isFinite(floor) && floor > 0) return floor * 3.2;

  const floorNote = String(properties["樓層註記"] || "").match(/\d+/);
  if (floorNote) return Number.parseFloat(floorNote[0]) * 3.2;

  return 9.6;
}

function polygonCenter(ring) {
  const total = ring.reduce((acc, coordinate) => ({
    lon: acc.lon + coordinate[0],
    lat: acc.lat + coordinate[1]
  }), { lon: 0, lat: 0 });
  return {
    lon: total.lon / ring.length,
    lat: total.lat / ring.length
  };
}

function setRealBuildingStatus(text) {
  const element = document.querySelector("#cesium-real-building-status");
  if (element) element.textContent = text;
}

async function loadRadarLayer() {
  setRadarStatus("載入中");
  radarPlay.disabled = true;
  try {
    if (!radarFrames.length) await fetchRadarFrames();
    radarFrameIndex = radarFrames.length - 1;
    setRadarFrame(radarFrameIndex);
    radarLayer.show = radarToggle.checked;
  } catch (error) {
    radarToggle.checked = false;
    setRadarStatus("讀取失敗");
    showCesiumError(`雷達回波讀取失敗：${error.message}`);
  } finally {
    radarPlay.disabled = false;
  }
}

async function fetchRadarFrames() {
  const response = await fetch(`${RAINVIEWER_API}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  radarFrames = (data.radar?.past || []).slice(-8);
  radarHost = data.host || "";
  if (!radarFrames.length || !radarHost) throw new Error("No radar frames");
}

function setRadarFrame(index) {
  if (!radarFrames.length) return;
  radarFrameIndex = (index + radarFrames.length) % radarFrames.length;
  const frame = radarFrames[radarFrameIndex];
  const provider = new CesiumLib.UrlTemplateImageryProvider({
    url: `${radarHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
    credit: "Radar © RainViewer",
    minimumLevel: 0,
    maximumLevel: 7
  });
  if (radarLayer) viewer.imageryLayers.remove(radarLayer, false);
  radarLayer = viewer.imageryLayers.addImageryProvider(provider);
  radarLayer.alpha = 0.58;
  radarLayer.brightness = 1.12;
  radarLayer.show = radarToggle.checked;
  setRadarStatus(`${formatRadarTime(frame.time)} (${radarFrameIndex + 1}/${radarFrames.length})`);
}

function startRadarPlayback() {
  radarToggle.checked = true;
  if (radarLayer) radarLayer.show = true;
  radarPlay.textContent = "暫停雷達";
  radarTimer = window.setInterval(() => {
    setRadarFrame(radarFrameIndex + 1);
  }, 900);
}

function stopRadarPlayback() {
  if (radarTimer) {
    window.clearInterval(radarTimer);
    radarTimer = null;
  }
  radarPlay.textContent = "播放雷達";
}

function setRadarStatus(text) {
  const element = document.querySelector("#cesium-radar-status");
  if (element) element.textContent = text;
}

function formatRadarTime(epochSeconds) {
  if (!epochSeconds) return "無時間";
  return new Date(epochSeconds * 1000).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function addSimulatedRadar() {
  if (simulatedRadarEntities.length) return;
  const cells = [
    { lon: 121.5450, lat: 25.0338, width: 0.026, depth: 0.018, level: "extreme", dbz: 58, color: "#a855f7", alpha: 0.34, top: 280, speed: 0.0027 },
    { lon: 121.5385, lat: 25.0378, width: 0.038, depth: 0.022, level: "heavy", dbz: 48, color: "#ef4444", alpha: 0.30, top: 230, speed: 0.0030 },
    { lon: 121.5525, lat: 25.0300, width: 0.036, depth: 0.020, level: "heavy", dbz: 44, color: "#ef4444", alpha: 0.28, top: 210, speed: 0.0023 },
    { lon: 121.5280, lat: 25.0415, width: 0.030, depth: 0.018, level: "moderate", dbz: 36, color: "#facc15", alpha: 0.26, top: 170, speed: 0.0033 },
    { lon: 121.5350, lat: 25.0268, width: 0.052, depth: 0.014, level: "rainband", dbz: 28, color: "#22c55e", alpha: 0.20, top: 150, speed: 0.0025 }
  ];
  simulatedRadarEntities = cells.flatMap((cell, index) => {
    const blobs = [
      { lonOffset: 0, latOffset: 0, scale: 1 },
      { lonOffset: -0.006, latOffset: 0.003, scale: 0.72 },
      { lonOffset: 0.007, latOffset: -0.002, scale: 0.64 }
    ];
    return blobs.map((blob, blobIndex) => {
      const radarMeta = { ...cell, index, blob, blobIndex };
      const entity = viewer.entities.add({
      name: `假雷達強回波 ${cell.level}`,
      rectangle: {
        coordinates: simulatedRadarRectangle(radarMeta, blob, 0),
        height: SIMULATED_CLOUD_TOP,
        extrudedHeight: SIMULATED_CLOUD_BOTTOM,
        material: CesiumLib.Color.fromCssColorString(cell.color).withAlpha(cell.alpha),
        outline: true,
        outlineColor: CesiumLib.Color.WHITE.withAlpha(0.28)
      },
      show: simulatedRadarToggle.checked
    });
      entity.simulatedRadarCell = radarMeta;
      const cloud = viewer.entities.add({
        name: `假回波雲霧 ${cell.level}`,
        position: simulatedRadarCloudPosition(radarMeta, blob, 0),
        billboard: {
          image: radarCloudSvg(cell.dbz),
          width: cloudPixelSize(cell, blob) * 1.22,
          height: cloudPixelSize(cell, blob) * 0.70,
          color: CesiumLib.Color.WHITE.withAlpha(cloudAlpha(cell.dbz, cell.alpha)),
          horizontalOrigin: CesiumLib.HorizontalOrigin.CENTER,
          verticalOrigin: CesiumLib.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        show: simulatedRadarToggle.checked
      });
      cloud.simulatedRadarCell = entity.simulatedRadarCell;
      radarCloudEntities.push(cloud);

      const flood = viewer.entities.add({
        name: `地面淹水藍色疊圖 ${cell.level}`,
        rectangle: {
          coordinates: simulatedRadarFloodRectangle(radarMeta, blob, 0),
          height: 3,
          material: floodOverlayColor(cell.dbz, cell.alpha),
          outline: true,
          outlineColor: CesiumLib.Color.fromCssColorString("#bae6fd").withAlpha(0.24)
        },
        show: simulatedRadarToggle.checked
      });
      flood.simulatedRadarCell = entity.simulatedRadarCell;
      floodOverlayEntities.push(flood);
      return entity;
    });
  });
  updateSimulatedRadarFrame();
}

function startSimulatedRadarAnimation() {
  if (simulatedRadarTimer) return;
  simulatedRadarTimer = window.setInterval(() => {
    simulatedRadarFrame += 1;
    updateSimulatedRadarFrame();
  }, 520);
}

function stopSimulatedRadarAnimation() {
  if (!simulatedRadarTimer) return;
  window.clearInterval(simulatedRadarTimer);
  simulatedRadarTimer = null;
}

function updateSimulatedRadarFrame() {
  const activeCells = [];
  simulatedRadarEntities.forEach((entity) => {
    const cell = entity.simulatedRadarCell;
    const phase = simulatedRadarFrame + cell.index * 2;
    const alphaPulse = cell.alpha + (phase % 4) * 0.045;
    const bounds = simulatedRadarBounds(cell, phase);
    activeCells.push({
      ...bounds,
      cell,
      color: radarGlowColor(cell.dbz),
      alpha: alphaPulse,
      cloudBottom: SIMULATED_CLOUD_BOTTOM,
      cloudTop: SIMULATED_CLOUD_TOP
    });
    entity.rectangle.coordinates = simulatedRadarRectangle(cell, cell.blob, phase);
    entity.rectangle.material = CesiumLib.Color
      .fromCssColorString(cell.color)
      .withAlpha(Math.min(alphaPulse * (cell.blobIndex ? 0.78 : 1), 0.48));
  });
  radarCloudEntities.forEach((entity) => {
    const cell = entity.simulatedRadarCell;
    const phase = simulatedRadarFrame + cell.index * 2;
    const alphaPulse = Math.sin((phase + cell.blobIndex * 4) * 0.25) * 0.05;
    entity.position = simulatedRadarCloudPosition(cell, cell.blob, phase);
    entity.billboard.image = radarCloudSvg(cell.dbz);
    entity.billboard.width = cloudPixelSize(cell, cell.blob) * (1.10 + cell.dbz / 180);
    entity.billboard.height = cloudPixelSize(cell, cell.blob) * (0.62 + cell.dbz / 260);
    entity.billboard.color = CesiumLib.Color.WHITE.withAlpha(
      Math.min(0.68, cloudAlpha(cell.dbz, cell.alpha) + alphaPulse)
    );
    entity.show = simulatedRadarToggle.checked;
  });
  floodOverlayEntities.forEach((entity) => {
    const cell = entity.simulatedRadarCell;
    const phase = simulatedRadarFrame + cell.index * 2;
    const floodPulse = Math.sin((phase + cell.blobIndex * 5) * 0.18) * 0.04;
    const intensity = Math.max(0.35, Math.min(1, cell.dbz / 58));
    entity.rectangle.coordinates = simulatedRadarFloodRectangle(cell, cell.blob, phase, intensity);
    entity.rectangle.material = floodOverlayColor(cell.dbz, Math.max(0.10, cell.alpha + floodPulse));
    entity.rectangle.outlineColor = CesiumLib.Color
      .fromCssColorString(cell.dbz >= 45 ? "#e0f2fe" : "#bae6fd")
      .withAlpha(0.16 + intensity * 0.20);
    entity.show = simulatedRadarToggle.checked;
  });
  updateBuildingRadarGlow(activeCells);
  viewer.scene.requestRender();
}

function simulatedRadarBounds(cell, phase) {
  const center = simulatedRadarCenter(cell, phase);
  const scale = cell.blob?.scale || 1;
  const lonOffset = cell.blob?.lonOffset || 0;
  const latOffset = cell.blob?.latOffset || 0;
  const lon = center.lon + lonOffset;
  const lat = center.lat + latOffset;
  const width = cell.width * scale;
  const depth = cell.depth * scale;
  return {
    west: lon - width / 2,
    south: lat - depth / 2,
    east: lon + width / 2,
    north: lat + depth / 2
  };
}

function simulatedRadarCenter(cell, phase) {
  const drift = (phase * cell.speed) % 0.055;
  const wave = Math.sin((phase + cell.index * 3) * 0.42) * 0.0018;
  return {
    lon: cell.lon + drift * (WIND_VECTOR.lon / 0.0027),
    lat: cell.lat + drift * (WIND_VECTOR.lat / 0.0027) + wave
  };
}

function simulatedRadarCellCenter(cell, blob, phase) {
  const center = simulatedRadarCenter(cell, phase);
  return {
    lon: center.lon + blob.lonOffset,
    lat: center.lat + blob.latOffset
  };
}

function simulatedRadarRectangle(cell, blob, phase) {
  const center = simulatedRadarCellCenter(cell, blob, phase);
  const halfSize = Math.max(cell.width, cell.depth) * blob.scale / 2;
  return CesiumLib.Rectangle.fromDegrees(
    center.lon - halfSize,
    center.lat - halfSize,
    center.lon + halfSize,
    center.lat + halfSize
  );
}

function simulatedRadarCloudPosition(cell, blob, phase) {
  const center = simulatedRadarCellCenter(cell, blob, phase);
  const blobIndex = Number.isFinite(cell.blobIndex) ? cell.blobIndex : 0;
  return CesiumLib.Cartesian3.fromDegrees(
    center.lon,
    center.lat,
    SIMULATED_CLOUD_TOP + 170 + blobIndex * 12
  );
}

function simulatedRadarFloodRectangle(cell, blob, phase, intensity = 0.7) {
  const center = simulatedRadarCellCenter(cell, blob, phase);
  const halfSize = Math.max(cell.width, cell.depth) * blob.scale * (0.34 + intensity * 0.12);
  return CesiumLib.Rectangle.fromDegrees(
    center.lon - halfSize,
    center.lat - halfSize,
    center.lon + halfSize,
    center.lat + halfSize
  );
}

function degreesToMeters(degrees) {
  return degrees * 111000;
}

function cloudPixelSize(cell, blob) {
  return Math.max(74, Math.min(210, degreesToMeters(Math.max(cell.width, cell.depth) * blob.scale) * 0.072));
}

function cloudAlpha(dbz, baseAlpha) {
  const intensity = Math.max(0, Math.min(1, (dbz - 24) / 34));
  return baseAlpha + 0.12 + intensity * 0.24;
}

function floodOverlayColor(dbz, alpha) {
  const intensity = Math.max(0, Math.min(1, (dbz - 24) / 34));
  const color = dbz >= 45 ? "#60a5fa" : "#38bdf8";
  return CesiumLib.Color.fromCssColorString(color).withAlpha(0.10 + intensity * 0.16 + alpha * 0.18);
}

function radarCloudSvg(dbz) {
  const tint = radarGlowCssColor(dbz);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="150" viewBox="0 0 260 150">
    <defs>
      <filter id="soft"><feGaussianBlur stdDeviation="7"/></filter>
      <radialGradient id="cloud" cx="48%" cy="46%" r="66%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.92"/>
        <stop offset="54%" stop-color="#dbeafe" stop-opacity="0.60"/>
        <stop offset="100%" stop-color="#94a3b8" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="rain" cx="52%" cy="58%" r="52%">
        <stop offset="0%" stop-color="${tint}" stop-opacity="0.76"/>
        <stop offset="100%" stop-color="${tint}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <g filter="url(#soft)">
      <ellipse cx="78" cy="84" rx="58" ry="28" fill="url(#cloud)"/>
      <ellipse cx="126" cy="68" rx="73" ry="39" fill="url(#cloud)"/>
      <ellipse cx="178" cy="84" rx="62" ry="30" fill="url(#cloud)"/>
      <ellipse cx="138" cy="94" rx="96" ry="35" fill="url(#rain)"/>
      <ellipse cx="138" cy="104" rx="112" ry="20" fill="#bae6fd" fill-opacity="0.12"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function radarGlowCssColor(dbz) {
  if (dbz >= 55) return "#c084fc";
  if (dbz >= 45) return "#fb7185";
  if (dbz >= 35) return "#fde047";
  return "#4ade80";
}

function addWindIndicators() {
  if (windEntities.length) return;
  const anchors = [
    [121.540, 25.026],
    [121.552, 25.033],
    [121.565, 25.039],
    [121.578, 25.046],
    [121.590, 25.031]
  ];
  windEntities = anchors.flatMap(([lon, lat], index) => {
    const start = CesiumLib.Cartesian3.fromDegrees(lon, lat, SIMULATED_CLOUD_TOP + 170);
    const end = CesiumLib.Cartesian3.fromDegrees(lon + 0.010, lat + 0.0024, SIMULATED_CLOUD_TOP + 170);
    const line = viewer.entities.add({
      name: "高空風向",
      polyline: {
        positions: [start, end],
        width: 4,
        material: CesiumLib.Color.fromCssColorString("#bae6fd").withAlpha(0.72)
      },
      show: windToggle.checked
    });
    const label = viewer.entities.add({
      name: "風向箭頭",
      position: end,
      label: {
        text: "→",
        font: "700 20px sans-serif",
        fillColor: CesiumLib.Color.fromCssColorString("#e0f2fe"),
        outlineColor: CesiumLib.Color.BLACK.withAlpha(0.45),
        outlineWidth: 2,
        style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new CesiumLib.Cartesian2(index % 2 ? 8 : 0, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      show: windToggle.checked
    });
    return [line, label];
  });
}

function updateBuildingRadarGlow(activeCells) {
  realBuildingEntities.slice(0, BUILDING_RAIN_TINT_LIMIT).forEach((entity) => {
    const meta = entity.realBuildingMeta;
    if (!meta) return;
    const hit = activeCells.find((bounds) => (
      meta.center.lon >= bounds.west &&
      meta.center.lon <= bounds.east &&
      meta.center.lat >= bounds.south &&
      meta.center.lat <= bounds.north
    ));
    const glowStrength = hit ? Math.min(1, Math.max(0.2, hit.cell.dbz / 60)) : 0;
    entity.polygon.outlineColor = hit
      ? hit.color.withAlpha(0.58 + glowStrength * 0.32)
      : CesiumLib.Color.WHITE.withAlpha(0.34);
  });
}
