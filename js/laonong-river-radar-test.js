const CesiumLib = window.Cesium;

if (!CesiumLib) {
  showError("CesiumJS 載入失敗，請確認瀏覽器可以連到 cdnjs.cloudflare.com。");
  throw new Error("CesiumJS is not available.");
}

CesiumLib.Ion.defaultAccessToken = "";

const TERRAIN_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

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
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.baseColor = CesiumLib.Color.fromCssColorString("#102033");
viewer.scene.skyAtmosphere.show = true;
viewer.scene.postProcessStages.fxaa.enabled = true;
viewer.scene.verticalExaggeration = 1.8;
viewer.scene.verticalExaggerationRelativeHeight = 0;

const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
const REAL_RIVER_GEOJSON_URL = "../../data/laonong-river-real.geojson";
const REAL_FLOWLINE_GEOJSON_URL = "../../data/laonong-river-flowline.geojson";
const STORM_CLOUD_BOTTOM = 1880;
const STORM_CLOUD_TOP = 2020;
const riverPath = [
  [120.496164, 22.792963],
  [120.548365, 22.815057],
  [120.571937, 22.836640],
  [120.588151, 22.859689],
  [120.629790, 22.883004],
  [120.669060, 22.910647],
  [120.718371, 22.935944],
  [120.702934, 22.955316],
  [120.664791, 22.979320],
  [120.646661, 23.008396],
  [120.649612, 23.021050],
  [120.670247, 23.052125],
  [120.686561, 23.076032],
  [120.697794, 23.104071],
  [120.721128, 23.125375],
  [120.760705, 23.151321],
  [120.774278, 23.171384],
  [120.791482, 23.196396],
  [120.803373, 23.219192],
  [120.811851, 23.244394],
  [120.821892, 23.268931],
  [120.884274, 23.295872],
  [120.950196, 23.313969],
  [120.916827, 23.337705],
  [120.917955, 23.364215],
  [120.949396, 23.384823],
  [120.981953, 23.408527],
  [120.992766, 23.432268]
];
const cameraViews = {
  overview: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.735, 23.105, 62000),
    orientation: {
      heading: CesiumLib.Math.toRadians(34),
      pitch: CesiumLib.Math.toRadians(-48),
      roll: 0
    }
  },
  river: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.704, 23.060, 22000),
    orientation: {
      heading: CesiumLib.Math.toRadians(30),
      pitch: CesiumLib.Math.toRadians(-34),
      roll: 0
    }
  },
  village: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.656, 23.017, 8200),
    orientation: {
      heading: CesiumLib.Math.toRadians(18),
      pitch: CesiumLib.Math.toRadians(-30),
      roll: 0
    }
  }
};

let radarFrames = [];
let radarHost = "";
let radarLayer = null;
let stormFrame = 0;
let animationTimer = null;
const stormEntities = [];
const riverEntities = [];
const particleEntities = [];
const buildingEntities = [];
const markerEntities = [];
const realRiverEntities = [];
const settlementAreaEntities = [];
let riverMainEntity = null;
let riverRiskEntity = null;
let waterLevel = 0.2;
let flowlineReady = false;

const radarToggle = document.querySelector("#laonong-radar-toggle");
const stormToggle = document.querySelector("#laonong-storm-toggle");
const riverToggle = document.querySelector("#laonong-river-toggle");
const buildingToggle = document.querySelector("#laonong-building-toggle");

document.querySelectorAll("[data-camera]").forEach((button) => {
  button.addEventListener("click", () => flyToView(button.dataset.camera));
});

radarToggle.addEventListener("change", () => {
  if (radarLayer) radarLayer.show = radarToggle.checked;
});
stormToggle.addEventListener("change", updateLayerVisibility);
riverToggle.addEventListener("change", updateLayerVisibility);
buildingToggle.addEventListener("change", updateLayerVisibility);

setCameraView("overview");
setupTerrain();
loadFlowlinePath();
addRiver();
addStormBands();
addRiskMarkers();
loadRealRiverLayer();
loadRadarLayer();
animationTimer = window.setInterval(animateScenario, 430);
setTimeout(checkCanvas, 2200);

function flyToView(viewName) {
  viewer.camera.flyTo({
    ...cameraViews[viewName],
    duration: 1.3
  });
}

function setCameraView(viewName) {
  viewer.camera.setView(cameraViews[viewName]);
}

async function setupTerrain() {
  setTerrainStatus("載入中");
  if (!CesiumLib.ArcGISTiledElevationTerrainProvider) {
    setTerrainStatus("不支援");
    return;
  }
  try {
    viewer.terrainProvider = await CesiumLib.ArcGISTiledElevationTerrainProvider.fromUrl(TERRAIN_URL);
    viewer.scene.verticalExaggeration = 2.15;
    setTerrainStatus("真實地形 x2.15");
    window.setTimeout(() => setCameraView("overview"), 900);
  } catch (error) {
    setTerrainStatus("平面備援");
    console.warn("Terrain load failed", error);
  }
}

function addRiver() {
  // The visible river is loaded from real GeoJSON. This keeps simulated
  // water effects from drawing a separate centerline that can drift off-river.
  riverMainEntity = null;
  riverRiskEntity = null;
}

async function loadFlowlinePath() {
  try {
    const response = await fetch(`${REAL_FLOWLINE_GEOJSON_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const coordinates = data.features?.[0]?.geometry?.coordinates || [];
    if (coordinates.length >= 2) {
      riverPath.splice(0, riverPath.length, ...coordinates);
      flowlineReady = true;
    }
  } catch (error) {
    flowlineReady = false;
    console.warn("Laonong flowline load failed, using fallback path", error);
  }
  addRiverbankBuildings();
  addParticles();
}

function addRiverbankBuildings() {
  const settlements = [
    { name: "六龜聚落", progress: 0.33, side: -1, risk: "watch", homes: 7 },
    { name: "寶來聚落", progress: 0.43, side: 1, risk: "danger", homes: 10 },
    { name: "桃源聚落", progress: 0.60, side: -1, risk: "danger", homes: 9 },
    { name: "高中聚落", progress: 0.72, side: 1, risk: "warning", homes: 8 },
    { name: "梅山聚落", progress: 0.86, side: -1, risk: "station", homes: 6 }
  ];
  settlements.forEach((settlement, villageIndex) => {
    const anchor = pointAlongRiver(settlement.progress);
    const center = settlementCenter(anchor, settlement.side, 0.0062 + (villageIndex % 2) * 0.0014);
    const areaColor = markerColor(settlement.risk);
    const area = viewer.entities.add({
      name: `${settlement.name}影響範圍`,
      position: CesiumLib.Cartesian3.fromDegrees(center.lon, center.lat, 26),
      ellipse: {
        semiMajorAxis: 520 + settlement.homes * 28,
        semiMinorAxis: 320 + settlement.homes * 16,
        height: 24,
        material: areaColor.withAlpha(0.18),
        outline: true,
        outlineColor: areaColor.withAlpha(0.72),
        rotation: CesiumLib.Math.toRadians(20 + villageIndex * 14)
      }
    });
    area.settlementRiskColor = areaColor;
    settlementAreaEntities.push(area);

    const label = viewer.entities.add({
      name: `${settlement.name}標籤`,
      position: CesiumLib.Cartesian3.fromDegrees(center.lon, center.lat, 620),
      label: {
        text: `${settlement.name}\n${settlementRiskLabel(settlement.risk)}`,
        font: "700 14px 'Noto Sans TC', sans-serif",
        fillColor: CesiumLib.Color.WHITE,
        outlineColor: CesiumLib.Color.BLACK.withAlpha(0.68),
        outlineWidth: 4,
        style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: areaColor.withAlpha(0.44),
        backgroundPadding: new CesiumLib.Cartesian2(10, 7),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    settlementAreaEntities.push(label);

    for (let index = 0; index < settlement.homes; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const riverDistance = 0.0048 + row * 0.0010;
      const buildingCenter = {
        lon: center.lon + side * (0.00055 + (index % 3) * 0.00035),
        lat: center.lat + (row - 1.5) * 0.00072 + (index % 2) * 0.0002
      };
      const width = 0.00042 + (index % 3) * 0.00012;
      const depth = 0.00034 + (index % 2) * 0.00010;
      const floors = 1 + ((index + villageIndex) % 5);
      const height = floors * 4.2;
      const entity = viewer.entities.add({
        name: `${settlement.name} 建物 ${index + 1}`,
        polygon: {
          hierarchy: CesiumLib.Cartesian3.fromDegreesArray([
            buildingCenter.lon - width, buildingCenter.lat - depth,
            buildingCenter.lon + width, buildingCenter.lat - depth,
            buildingCenter.lon + width, buildingCenter.lat + depth,
            buildingCenter.lon - width, buildingCenter.lat + depth
          ]),
          height: 0,
          extrudedHeight: height,
          material: CesiumLib.Color.fromCssColorString("#cbd5e1"),
          outline: true,
          outlineColor: CesiumLib.Color.WHITE.withAlpha(0.36)
        },
        position: CesiumLib.Cartesian3.fromDegrees(buildingCenter.lon, buildingCenter.lat, height + 4)
      });
      entity.riverbankMeta = {
        center: buildingCenter,
        floors,
        riverDistance,
        settlement: settlement.name,
        baseOutline: CesiumLib.Color.WHITE.withAlpha(0.36)
      };
      buildingEntities.push(entity);
    }
  });
  setBuildingStatus(`${settlements.length} 聚落 / ${buildingEntities.length} 棟`);
}

function addStormBands() {
  const bands = [
    { lon: 120.500, lat: 22.805, width: 0.110, depth: 0.075, dbz: 42, color: "#f97316", alpha: 0.20, speed: 0.0022 },
    { lon: 120.615, lat: 22.930, width: 0.135, depth: 0.080, dbz: 54, color: "#ef4444", alpha: 0.23, speed: 0.0027 },
    { lon: 120.660, lat: 23.020, width: 0.145, depth: 0.085, dbz: 62, color: "#a855f7", alpha: 0.25, speed: 0.0030 },
    { lon: 120.710, lat: 23.105, width: 0.150, depth: 0.078, dbz: 48, color: "#ef4444", alpha: 0.22, speed: 0.0028 },
    { lon: 120.790, lat: 23.205, width: 0.160, depth: 0.070, dbz: 40, color: "#facc15", alpha: 0.18, speed: 0.0025 },
    { lon: 120.895, lat: 23.320, width: 0.170, depth: 0.065, dbz: 36, color: "#22c55e", alpha: 0.16, speed: 0.0022 }
  ];
  bands.forEach((band, index) => {
    const cells = [
      { lonOffset: 0, latOffset: 0, scale: 0.34, dbzShift: 0 },
      { lonOffset: -0.020, latOffset: 0.012, scale: 0.28, dbzShift: -4 },
      { lonOffset: 0.020, latOffset: -0.010, scale: 0.28, dbzShift: -3 },
      { lonOffset: -0.038, latOffset: -0.005, scale: 0.24, dbzShift: -8 },
      { lonOffset: 0.040, latOffset: 0.011, scale: 0.24, dbzShift: -7 },
      { lonOffset: -0.010, latOffset: 0.028, scale: 0.22, dbzShift: -6 },
      { lonOffset: 0.014, latOffset: -0.028, scale: 0.22, dbzShift: -5 },
      { lonOffset: -0.056, latOffset: 0.014, scale: 0.20, dbzShift: -10 },
      { lonOffset: 0.058, latOffset: -0.018, scale: 0.20, dbzShift: -11 },
      { lonOffset: -0.032, latOffset: 0.034, scale: 0.18, dbzShift: -9 },
      { lonOffset: 0.034, latOffset: 0.034, scale: 0.18, dbzShift: -10 },
      { lonOffset: 0.002, latOffset: -0.050, scale: 0.18, dbzShift: -8 }
    ];
    cells.forEach((cell, cellIndex) => {
      const cellDbz = Math.max(18, band.dbz + cell.dbzShift);
      const entity = viewer.entities.add({
        name: `格點雷達回波 ${cellDbz} dBZ`,
        rectangle: {
          coordinates: stormRectangle(band, cell, 0),
          height: STORM_CLOUD_TOP,
          extrudedHeight: STORM_CLOUD_BOTTOM,
          material: radarColor(cellDbz).withAlpha(band.alpha),
          outline: false
        }
      });
      entity.stormBand = { ...band, dbz: cellDbz, color: radarCssColor(cellDbz), index, cell, cellIndex };
      stormEntities.push(entity);
    });
  });
}

function addParticles() {
  for (let index = 0; index < 64; index += 1) {
    const point = pointAlongRiver(index / 64);
    const particle = viewer.entities.add({
      name: "河道流動粒子",
      position: CesiumLib.Cartesian3.fromDegrees(point.lon, point.lat, 85),
      point: {
        pixelSize: 7,
        color: CesiumLib.Color.fromCssColorString("#67e8f9").withAlpha(0.86),
        outlineColor: CesiumLib.Color.WHITE.withAlpha(0.38),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    particle.flowOffset = index / 64;
    particleEntities.push(particle);
  }
}

function addRiskMarkers() {
  const markers = [
    { name: "荖濃溪下游", lon: 120.548, lat: 22.815, type: "watch", detail: "水位 1.8m" },
    { name: "六龜河段", lon: 120.647, lat: 23.008, type: "station", detail: "水位 4.2m" },
    { name: "寶來河段", lon: 120.686, lat: 23.076, type: "danger", detail: "聚落高風險" },
    { name: "桃源河段", lon: 120.774, lat: 23.171, type: "danger", detail: "累積雨量 412mm" },
    { name: "高中河段", lon: 120.812, lat: 23.244, type: "warning", detail: "累積雨量 287mm" },
    { name: "梅山河段", lon: 120.918, lat: 23.364, type: "station", detail: "雨量站 256mm" },
    { name: "上游山區", lon: 120.982, lat: 23.409, type: "danger", detail: "強降雨核心" }
  ];
  markers.forEach((marker) => {
    const color = markerColor(marker.type);
    const entity = viewer.entities.add({
      name: marker.name,
      position: CesiumLib.Cartesian3.fromDegrees(marker.lon, marker.lat, 520),
      billboard: {
        image: markerPinSvg(marker.type),
        width: 34,
        height: 34,
        verticalOrigin: CesiumLib.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: `${marker.name}\n${marker.detail}`,
        font: "700 15px 'Noto Sans TC', sans-serif",
        fillColor: CesiumLib.Color.WHITE,
        outlineColor: CesiumLib.Color.BLACK.withAlpha(0.65),
        outlineWidth: 4,
        style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new CesiumLib.Cartesian2(0, -52),
        showBackground: true,
        backgroundColor: color.withAlpha(0.42),
        backgroundPadding: new CesiumLib.Cartesian2(10, 7),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        verticalOrigin: CesiumLib.VerticalOrigin.BOTTOM
      },
      point: {
        pixelSize: 8,
        color,
        outlineColor: CesiumLib.Color.WHITE.withAlpha(0.8),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    markerEntities.push(entity);
  });
}

async function loadRadarLayer() {
  setRadarStatus("載入中");
  try {
    const response = await fetch(`${RAINVIEWER_API}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    radarFrames = (data.radar?.past || []).slice(-1);
    radarHost = data.host || "";
    if (!radarFrames.length || !radarHost) throw new Error("No radar frames");
    const frame = radarFrames[0];
    radarLayer = viewer.imageryLayers.addImageryProvider(new CesiumLib.UrlTemplateImageryProvider({
      url: `${radarHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
      credit: "Radar © RainViewer",
      minimumLevel: 0,
      maximumLevel: 7
    }));
    radarLayer.alpha = 0.58;
    radarLayer.show = radarToggle.checked;
    setRadarStatus(formatRadarTime(frame.time));
  } catch (error) {
    setRadarStatus("讀取失敗");
    console.warn("Radar load failed", error);
  }
}

async function loadRealRiverLayer() {
  setRealRiverStatus("載入中");
  try {
    const dataSource = await CesiumLib.GeoJsonDataSource.load(REAL_RIVER_GEOJSON_URL, {
      clampToGround: false,
      stroke: CesiumLib.Color.fromCssColorString("#7dd3fc").withAlpha(0.95),
      fill: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.20),
      strokeWidth: 2
    });
    viewer.dataSources.add(dataSource);
    dataSource.entities.values.forEach((entity) => {
      entity.name = "真實荖濃溪水系";
      if (entity.polygon) {
        entity.polygon.height = 58;
        entity.polygon.material = CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.24);
        entity.polygon.outline = true;
        entity.polygon.outlineColor = CesiumLib.Color.fromCssColorString("#bae6fd").withAlpha(0.94);
        entity.realRiverStyle = "polygon";
      }
      if (entity.polyline) {
        entity.polyline.width = 4;
        entity.polyline.material = new CesiumLib.PolylineGlowMaterialProperty({
          glowPower: 0.22,
          taperPower: 0.8,
          color: CesiumLib.Color.fromCssColorString("#7dd3fc").withAlpha(0.92)
        });
        entity.realRiverStyle = "polyline";
      }
      realRiverEntities.push(entity);
    });
    setRealRiverStatus(`${realRiverEntities.length} 筆`);
  } catch (error) {
    setRealRiverStatus("讀取失敗");
    console.warn("Real Laonong river load failed", error);
  }
}

function animateScenario() {
  stormFrame += 1;
  const activeBands = [];
  stormEntities.forEach((entity) => {
    const band = entity.stormBand;
    const bounds = stormBounds(band, stormFrame + band.index * 8);
    const pulse = band.alpha + (stormFrame % 5) * 0.025;
    activeBands.push({
      ...bounds,
      dbz: band.dbz,
      color: CesiumLib.Color.fromCssColorString(band.color),
      cloudBottom: STORM_CLOUD_BOTTOM,
      cloudTop: STORM_CLOUD_TOP
    });
    entity.rectangle.coordinates = stormRectangle(band, band.cell, stormFrame + band.index * 8);
    entity.rectangle.material = CesiumLib.Color
      .fromCssColorString(band.color)
      .withAlpha(Math.min(pulse * (band.cellIndex ? 0.82 : 1), 0.48));
    entity.show = stormToggle.checked;
  });
  updateRiverFlood(activeBands);
  updateParticles(activeBands);
  updateBuildingGlow(activeBands);
  updateLayerVisibility();
  viewer.scene.requestRender();
}

function updateRiverFlood(activeBands) {
  const peakDbz = activeBands.reduce((max, band) => Math.max(max, band.dbz), 0);
  const targetLevel = peakDbz >= 55 ? 1 : peakDbz >= 45 ? 0.78 : peakDbz >= 35 ? 0.54 : 0.28;
  waterLevel += (targetLevel - waterLevel) * 0.08;
  const fillAlpha = 0.16 + waterLevel * 0.30;
  const outlineAlpha = 0.54 + waterLevel * 0.42;
  realRiverEntities.forEach((entity) => {
    if (entity.polygon) {
      entity.polygon.material = CesiumLib.Color
        .fromCssColorString(waterLevel > 0.75 ? "#60a5fa" : "#38bdf8")
        .withAlpha(fillAlpha);
      entity.polygon.outlineColor = CesiumLib.Color
        .fromCssColorString(waterLevel > 0.75 ? "#e0f2fe" : "#bae6fd")
        .withAlpha(outlineAlpha);
    }
    if (entity.polyline) {
      entity.polyline.width = 3 + waterLevel * 4;
    }
  });
  settlementAreaEntities.forEach((entity) => {
    if (entity.ellipse) {
      const riskColor = entity.settlementRiskColor || CesiumLib.Color.fromCssColorString("#38bdf8");
      entity.ellipse.material = riskColor.withAlpha(0.12 + waterLevel * 0.16);
      entity.ellipse.outlineColor = riskColor.withAlpha(0.48 + waterLevel * 0.34);
    }
  });
}

function updateParticles(activeBands) {
  const strongRain = activeBands.some((band) => band.dbz >= 45);
  const speed = strongRain ? 0.014 + waterLevel * 0.010 : 0.007 + waterLevel * 0.006;
  particleEntities.forEach((particle) => {
    particle.flowOffset = (particle.flowOffset + speed) % 1;
    const point = pointAlongRiver(particle.flowOffset);
    const intensity = radarAt(point, activeBands);
    particle.position = CesiumLib.Cartesian3.fromDegrees(point.lon, point.lat, 95);
    particle.point.pixelSize = intensity >= 45 ? 9 + waterLevel * 5 : 6 + waterLevel * 3;
    particle.point.color = radarColor(intensity).withAlpha(intensity ? 0.92 : 0.72);
    particle.show = riverToggle.checked;
  });
}

function updateBuildingGlow(activeBands) {
  buildingEntities.forEach((entity) => {
    const meta = entity.riverbankMeta;
    const intensity = radarAt(meta.center, activeBands);
    const floodReach = 0.004 + waterLevel * 0.010;
    const floodRisk = meta.riverDistance <= floodReach
      ? Math.min(1, (floodReach - meta.riverDistance) / floodReach + waterLevel * 0.4)
      : 0;
    const rainRisk = intensity ? intensity / 60 : 0;
    const risk = Math.max(rainRisk, floodRisk);
    const alertColor = intensity ? radarColor(intensity) : CesiumLib.Color.fromCssColorString("#60a5fa");
    entity.polygon.outlineColor = risk > 0.65
      ? alertColor.withAlpha(0.92)
      : risk > 0.32
        ? CesiumLib.Color.fromCssColorString("#facc15").withAlpha(0.84)
        : meta.baseOutline;
    entity.show = buildingToggle.checked;
  });
}

function updateLayerVisibility() {
  riverEntities.forEach((entity) => {
    entity.show = riverToggle.checked;
  });
  particleEntities.forEach((entity) => {
    entity.show = riverToggle.checked;
  });
  stormEntities.forEach((entity) => {
    entity.show = stormToggle.checked;
  });
  buildingEntities.forEach((entity) => {
    entity.show = buildingToggle.checked;
  });
  settlementAreaEntities.forEach((entity) => {
    entity.show = buildingToggle.checked;
  });
  markerEntities.forEach((entity) => {
    entity.show = riverToggle.checked;
  });
  realRiverEntities.forEach((entity) => {
    entity.show = riverToggle.checked;
  });
}

function stormBounds(band, phase) {
  const center = stormCenter(band, phase);
  const scale = band.cell?.scale || 1;
  const lonOffset = band.cell?.lonOffset || 0;
  const latOffset = band.cell?.latOffset || 0;
  const lon = center.lon + lonOffset;
  const lat = center.lat + latOffset;
  const width = band.width * scale;
  const depth = band.depth * scale;
  return {
    west: lon - width / 2,
    south: lat - depth / 2,
    east: lon + width / 2,
    north: lat + depth / 2
  };
}

function stormCenter(band, phase) {
  const drift = (phase * band.speed) % 0.220;
  const bandIndex = band.index || 0;
  const wave = Math.sin((phase + bandIndex * 4) * 0.35) * 0.004;
  return {
    lon: band.lon + drift,
    lat: band.lat + drift * 0.16 + wave
  };
}

function stormRectangle(band, cell, phase) {
  const center = stormCenter(band, phase);
  const lon = center.lon + cell.lonOffset;
  const lat = center.lat + cell.latOffset;
  const halfSize = Math.max(band.width, band.depth) * cell.scale / 2;
  return CesiumLib.Rectangle.fromDegrees(
    lon - halfSize,
    lat - halfSize,
    lon + halfSize,
    lat + halfSize
  );
}

function degreesToMeters(degrees) {
  return degrees * 111000;
}

function cloudAxisMeters(band, blob) {
  const width = degreesToMeters(band.width * blob.scale) / 2;
  const depth = degreesToMeters(band.depth * blob.scale) / 2;
  return {
    major: Math.max(width, depth),
    minor: Math.min(width, depth)
  };
}

function radarAt(point, bands) {
  const hit = bands.find((band) => (
    point.lon >= band.west &&
    point.lon <= band.east &&
    point.lat >= band.south &&
    point.lat <= band.north
  ));
  return hit ? hit.dbz : 0;
}

function radarColor(dbz) {
  if (dbz >= 55) return CesiumLib.Color.fromCssColorString("#c084fc");
  if (dbz >= 45) return CesiumLib.Color.fromCssColorString("#fb7185");
  if (dbz >= 35) return CesiumLib.Color.fromCssColorString("#fde047");
  if (dbz > 0) return CesiumLib.Color.fromCssColorString("#4ade80");
  return CesiumLib.Color.fromCssColorString("#67e8f9");
}

function radarCssColor(dbz) {
  if (dbz >= 55) return "#c084fc";
  if (dbz >= 45) return "#fb7185";
  if (dbz >= 35) return "#fde047";
  if (dbz > 0) return "#4ade80";
  return "#67e8f9";
}

function markerColor(type) {
  if (type === "danger") return CesiumLib.Color.fromCssColorString("#ef4444");
  if (type === "warning") return CesiumLib.Color.fromCssColorString("#f97316");
  if (type === "watch") return CesiumLib.Color.fromCssColorString("#facc15");
  if (type === "station") return CesiumLib.Color.fromCssColorString("#38bdf8");
  return CesiumLib.Color.fromCssColorString("#22c55e");
}

function settlementCenter(anchor, side, distance) {
  return {
    lon: anchor.lon + side * distance,
    lat: anchor.lat + side * 0.0012
  };
}

function settlementRiskLabel(type) {
  if (type === "danger") return "高風險聚落";
  if (type === "warning") return "中風險聚落";
  if (type === "watch") return "水位觀察";
  return "監測聚落";
}

function markerPinSvg(type) {
  const color = {
    danger: "#ef4444",
    warning: "#f97316",
    watch: "#facc15",
    station: "#38bdf8",
    normal: "#22c55e"
  }[type] || "#38bdf8";
  const icon = type === "station" ? "●" : "!";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <path d="M36 4 68 62H4Z" fill="${color}" fill-opacity="0.82" stroke="#fff" stroke-width="4" filter="url(#glow)"/>
    <text x="36" y="49" text-anchor="middle" font-size="34" font-family="Arial" font-weight="900" fill="#fff">${icon}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function pointAlongRiver(progress) {
  const scaled = progress * (riverPath.length - 1);
  const index = Math.min(riverPath.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const start = riverPath[index];
  const end = riverPath[index + 1];
  return {
    lon: start[0] + (end[0] - start[0]) * local,
    lat: start[1] + (end[1] - start[1]) * local
  };
}

function setRadarStatus(text) {
  const element = document.querySelector("#laonong-radar-status");
  if (element) element.textContent = text;
}

function setBuildingStatus(text) {
  const element = document.querySelector("#laonong-building-status");
  if (element) element.textContent = text;
}

function setTerrainStatus(text) {
  const element = document.querySelector("#laonong-terrain-status");
  if (element) element.textContent = text;
}

function setRealRiverStatus(text) {
  const element = document.querySelector("#laonong-real-river-status");
  if (element) element.textContent = flowlineReady ? `${text} / 流線` : text;
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

function showError(message) {
  const container = document.querySelector("#cesium-container");
  if (!container) return;
  const panel = document.createElement("div");
  panel.className = "cesium-error-panel";
  panel.textContent = message;
  container.append(panel);
}

function checkCanvas() {
  const canvas = document.querySelector("#cesium-container canvas");
  if (!canvas) showError("Cesium canvas 沒有建立，請重新整理或確認瀏覽器支援 WebGL。");
}
