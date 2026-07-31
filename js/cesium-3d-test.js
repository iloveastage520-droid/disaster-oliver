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
const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";

let radarFrames = [];
let radarHost = "";
let radarFrameIndex = 0;
let radarLayer = null;
let radarTimer = null;
let simulatedRadarEntities = [];
let realBuildingEntities = [];

function flyToView(viewName) {
  viewer.camera.flyTo({
    ...cameraViews[viewName],
    duration: 1.4
  });
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
});

flyToView("overview");
loadRealBuildings();
loadRadarLayer();
addSimulatedRadar();
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
  if (height >= 120) return CesiumLib.Color.fromCssColorString("#f97316");
  if (height >= 70) return CesiumLib.Color.fromCssColorString("#facc15");
  if (height >= 35) return CesiumLib.Color.fromCssColorString("#38bdf8");
  return CesiumLib.Color.fromCssColorString("#34d399");
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
  } catch (error) {
    setRealBuildingStatus("讀取失敗");
    showCesiumError(`真實建物資料讀取失敗：${error.message}`);
  }
}

async function fetchRealBuildingGeojson() {
  const seen = new Set();
  const features = [];
  const cellWidth = (REAL_BUILDING_BOUNDS.xmax - REAL_BUILDING_BOUNDS.xmin) / REAL_BUILDING_GRID.columns;
  const cellHeight = (REAL_BUILDING_BOUNDS.ymax - REAL_BUILDING_BOUNDS.ymin) / REAL_BUILDING_GRID.rows;

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
      let data;
      try {
        data = await queryRealBuildingCell({ xmin, ymin, xmax, ymax });
      } catch (error) {
        console.warn("Skip building cell", { xmin, ymin, xmax, ymax }, error);
        continue;
      }
      data.features.forEach((feature) => {
        const key = feature.properties?.OBJECTID || feature.id;
        if (key == null || seen.has(key) || features.length >= MAX_REAL_BUILDINGS) return;
        seen.add(key);
        features.push(feature);
      });
      setRealBuildingStatus(`${features.length} 棟`);
      if (features.length >= MAX_REAL_BUILDINGS) return { type: "FeatureCollection", features };
    }
  }

  return { type: "FeatureCollection", features };
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
  return viewer.entities.add({
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
      material: buildingColor(height).withAlpha(0.58),
      outline: true,
      outlineColor: CesiumLib.Color.WHITE.withAlpha(0.26)
    },
    position: CesiumLib.Cartesian3.fromDegrees(center.lon, center.lat, height + 5)
  });
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
    { lon: 121.5635, lat: 25.0338, width: 0.026, depth: 0.018, level: "extreme", color: "#a855f7", alpha: 0.34, top: 280 },
    { lon: 121.5585, lat: 25.0378, width: 0.038, depth: 0.022, level: "heavy", color: "#ef4444", alpha: 0.30, top: 230 },
    { lon: 121.5725, lat: 25.0300, width: 0.036, depth: 0.020, level: "heavy", color: "#ef4444", alpha: 0.28, top: 210 },
    { lon: 121.5480, lat: 25.0415, width: 0.030, depth: 0.018, level: "moderate", color: "#facc15", alpha: 0.26, top: 170 }
  ];
  simulatedRadarEntities = cells.map((cell) => viewer.entities.add({
    name: `假雷達強回波 ${cell.level}`,
    rectangle: {
      coordinates: CesiumLib.Rectangle.fromDegrees(
        cell.lon - cell.width / 2,
        cell.lat - cell.depth / 2,
        cell.lon + cell.width / 2,
        cell.lat + cell.depth / 2
      ),
      height: cell.top,
      extrudedHeight: 0,
      material: CesiumLib.Color.fromCssColorString(cell.color).withAlpha(cell.alpha),
      outline: true,
      outlineColor: CesiumLib.Color.WHITE.withAlpha(0.28)
    },
    show: simulatedRadarToggle.checked
  }));
}
