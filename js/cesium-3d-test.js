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

const taipei = CesiumLib.Cartesian3.fromDegrees(121.5654, 25.0330, 950);
const cameraViews = {
  overview: {
    destination: CesiumLib.Cartesian3.fromDegrees(121.5654, 25.0330, 5200),
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
    destination: CesiumLib.Cartesian3.fromDegrees(121.5568, 25.0409, 1850),
    orientation: {
      heading: CesiumLib.Math.toRadians(118),
      pitch: CesiumLib.Math.toRadians(-34),
      roll: 0
    }
  }
};

const eventSites = [
  { name: "信義區積淹水", lon: 121.5638, lat: 25.0341, height: 520, level: "高", color: CesiumLib.Color.CRIMSON },
  { name: "大安區路樹倒伏", lon: 121.5436, lat: 25.0267, height: 330, level: "中", color: CesiumLib.Color.ORANGE },
  { name: "松山車站周邊通報", lon: 121.5787, lat: 25.0495, height: 420, level: "中高", color: CesiumLib.Color.GOLD },
  { name: "南港排水巡查", lon: 121.6072, lat: 25.0531, height: 260, level: "低", color: CesiumLib.Color.CYAN }
];

const landmarkRoundBuilding = {
  name: "圓形建物高度測試",
  lon: 121.5666,
  lat: 25.0348,
  height: 220,
  radius: 86,
  floors: 68
};

const TAIPEI_BUILDING_LAYER =
  "https://arcgis.tpgos.gov.taipei/arcgis/rest/services/DO/NEW_RENEWAL_DO_V3/MapServer/56/query";
const REAL_BUILDING_BOUNDS = {
  xmin: 121.5350,
  ymin: 25.0000,
  xmax: 121.6100,
  ymax: 25.0600
};
const REAL_BUILDING_GRID = { columns: 12, rows: 12 };
const MAX_REAL_BUILDINGS = 6000;
const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";

let radarFrames = [];
let radarHost = "";
let radarFrameIndex = 0;
let radarLayer = null;
let radarTimer = null;

const testBuildings = [
  { name: "市府塔樓 A", lon: 121.5640, lat: 25.0343, width: 0.00030, depth: 0.00024, height: 96, floors: 30 },
  { name: "市府塔樓 B", lon: 121.5650, lat: 25.0346, width: 0.00026, depth: 0.00030, height: 128, floors: 40 },
  { name: "信義商辦 1", lon: 121.5660, lat: 25.0339, width: 0.00036, depth: 0.00022, height: 72, floors: 22 },
  { name: "信義商辦 2", lon: 121.5632, lat: 25.0331, width: 0.00022, depth: 0.00028, height: 48, floors: 15 },
  { name: "防災中心", lon: 121.5624, lat: 25.0340, width: 0.00024, depth: 0.00022, height: 36, floors: 11 },
  { name: "住宅群 A", lon: 121.5618, lat: 25.0328, width: 0.00018, depth: 0.00020, height: 28, floors: 9 },
  { name: "住宅群 B", lon: 121.5657, lat: 25.0327, width: 0.00020, depth: 0.00020, height: 32, floors: 10 },
  { name: "避難據點", lon: 121.5668, lat: 25.0348, width: 0.00028, depth: 0.00018, height: 22, floors: 7 },
  { name: "高樓示範", lon: 121.5673, lat: 25.0333, width: 0.00024, depth: 0.00024, height: 180, floors: 56 },
  { name: "低樓層街廓", lon: 121.5629, lat: 25.0321, width: 0.00036, depth: 0.00018, height: 18, floors: 5 }
];

viewer.entities.add({
  name: "半透明淹水測試面",
  polygon: {
    hierarchy: CesiumLib.Cartesian3.fromDegreesArray([
      121.5352, 25.0188,
      121.5751, 25.0174,
      121.5906, 25.0398,
      121.5604, 25.0552,
      121.5268, 25.0419
    ]),
    material: CesiumLib.Color.DODGERBLUE.withAlpha(0.32),
    outline: true,
    outlineColor: CesiumLib.Color.WHITE.withAlpha(0.72),
    extrudedHeight: 42,
    height: 8
  }
});

eventSites.forEach((site) => {
  viewer.entities.add({
    name: site.name,
    description: `災情等級：${site.level}<br>測試高度：${site.height}m`,
    position: CesiumLib.Cartesian3.fromDegrees(site.lon, site.lat, site.height + 40),
    cylinder: {
      length: site.height,
      topRadius: 42,
      bottomRadius: 42,
      material: site.color.withAlpha(0.72),
      outline: true,
      outlineColor: CesiumLib.Color.WHITE.withAlpha(0.48)
    },
    label: {
      text: site.name,
      font: "15px sans-serif",
      fillColor: CesiumLib.Color.WHITE,
      outlineColor: CesiumLib.Color.BLACK,
      outlineWidth: 3,
      style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new CesiumLib.Cartesian2(0, -24),
      verticalOrigin: CesiumLib.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    point: {
      pixelSize: 10,
      color: site.color,
      outlineColor: CesiumLib.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
});

const buildingEntities = testBuildings.map((building) => {
  const coordinates = rectangleDegrees(
    building.lon,
    building.lat,
    building.width,
    building.depth
  );
  return viewer.entities.add({
    name: building.name,
    description: `樓層：${building.floors}F<br>估算高度：${building.height}m`,
    polygon: {
      hierarchy: CesiumLib.Cartesian3.fromDegreesArray(coordinates),
      height: 0,
      extrudedHeight: building.height,
      material: buildingColor(building.height).withAlpha(0.78),
      outline: true,
      outlineColor: CesiumLib.Color.WHITE.withAlpha(0.38)
    },
    label: {
      text: `${building.height}m`,
      font: "13px sans-serif",
      fillColor: CesiumLib.Color.WHITE,
      outlineColor: CesiumLib.Color.BLACK,
      outlineWidth: 3,
      style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new CesiumLib.Cartesian2(0, -12),
      verticalOrigin: CesiumLib.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    position: CesiumLib.Cartesian3.fromDegrees(building.lon, building.lat, building.height + 8)
  });
});
let realBuildingEntities = [];

const roundBuildingEntity = viewer.entities.add({
  name: landmarkRoundBuilding.name,
  description: [
    "幾何：圓形 cylinder",
    `高度：${landmarkRoundBuilding.height}m`,
    `半徑：${landmarkRoundBuilding.radius}m`,
    `估算樓層：${landmarkRoundBuilding.floors}F`
  ].join("<br>"),
  position: CesiumLib.Cartesian3.fromDegrees(
    landmarkRoundBuilding.lon,
    landmarkRoundBuilding.lat,
    landmarkRoundBuilding.height / 2
  ),
  cylinder: {
    length: landmarkRoundBuilding.height,
    topRadius: landmarkRoundBuilding.radius,
    bottomRadius: landmarkRoundBuilding.radius,
    material: CesiumLib.Color.fromCssColorString("#a855f7").withAlpha(0.78),
    outline: true,
    outlineColor: CesiumLib.Color.WHITE.withAlpha(0.62)
  },
  label: {
    text: "圓形建物 220m",
    font: "15px sans-serif",
    fillColor: CesiumLib.Color.WHITE,
    outlineColor: CesiumLib.Color.BLACK,
    outlineWidth: 3,
    style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new CesiumLib.Cartesian2(0, -16),
    verticalOrigin: CesiumLib.VerticalOrigin.BOTTOM,
    disableDepthTestDistance: Number.POSITIVE_INFINITY
  }
});

viewer.entities.add({
  name: "應變巡查路徑",
  polyline: {
    positions: CesiumLib.Cartesian3.fromDegreesArrayHeights([
      121.5436, 25.0267, 80,
      121.5638, 25.0341, 120,
      121.5787, 25.0495, 100,
      121.6072, 25.0531, 90
    ]),
    width: 5,
    material: new CesiumLib.PolylineGlowMaterialProperty({
      glowPower: 0.18,
      color: CesiumLib.Color.LIME
    })
  }
});

function flyToView(viewName) {
  viewer.camera.flyTo({
    ...cameraViews[viewName],
    duration: 1.4
  });
}

document.querySelectorAll("[data-camera]").forEach((button) => {
  button.addEventListener("click", () => flyToView(button.dataset.camera));
});

let spinning = false;
const spinToggle = document.querySelector("#cesium-spin-toggle");
spinToggle.checked = false;
spinToggle.addEventListener("change", () => {
  spinning = spinToggle.checked;
});

const buildingToggle = document.querySelector("#cesium-building-toggle");
buildingToggle.addEventListener("change", () => {
  buildingEntities.forEach((entity) => {
    entity.show = buildingToggle.checked;
  });
  roundBuildingEntity.show = buildingToggle.checked;
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

viewer.clock.onTick.addEventListener(() => {
  if (!spinning) return;
  viewer.scene.camera.rotate(taipei, -0.00018);
});

flyToView("overview");
loadRealBuildings();
loadRadarLayer();
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

function rectangleDegrees(centerLon, centerLat, width, depth) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    centerLon - halfWidth, centerLat - halfDepth,
    centerLon + halfWidth, centerLat - halfDepth,
    centerLon + halfWidth, centerLat + halfDepth,
    centerLon - halfWidth, centerLat + halfDepth
  ];
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
    name: `信義區真實建物 ${properties.NO || properties.OBJECTID || ""}`,
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
