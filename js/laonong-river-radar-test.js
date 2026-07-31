const CesiumLib = window.Cesium;

if (!CesiumLib) {
  showError("CesiumJS 載入失敗，請確認瀏覽器可以連到 cdnjs.cloudflare.com。");
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

const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
const STORM_CLOUD_BOTTOM = 1600;
const STORM_CLOUD_TOP = 2100;
const riverPath = [
  [120.704, 23.226],
  [120.686, 23.198],
  [120.671, 23.171],
  [120.654, 23.142],
  [120.636, 23.115],
  [120.616, 23.090],
  [120.597, 23.062],
  [120.579, 23.034],
  [120.562, 23.007],
  [120.545, 22.982],
  [120.529, 22.958],
  [120.515, 22.935]
];
const cameraViews = {
  overview: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.615, 23.075, 52000),
    orientation: {
      heading: CesiumLib.Math.toRadians(18),
      pitch: CesiumLib.Math.toRadians(-62),
      roll: 0
    }
  },
  river: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.615, 23.075, 15000),
    orientation: {
      heading: CesiumLib.Math.toRadians(212),
      pitch: CesiumLib.Math.toRadians(-32),
      roll: 0
    }
  },
  village: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.566, 23.004, 4200),
    orientation: {
      heading: CesiumLib.Math.toRadians(206),
      pitch: CesiumLib.Math.toRadians(-28),
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
addRiver();
addRiverbankBuildings();
addStormBands();
addParticles();
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

function addRiver() {
  const positions = CesiumLib.Cartesian3.fromDegreesArray(riverPath.flat());
  riverEntities.push(viewer.entities.add({
    name: "荖濃溪主河道",
    polyline: {
      positions,
      width: 8,
      material: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.8),
      clampToGround: false
    }
  }));
  riverEntities.push(viewer.entities.add({
    name: "荖濃溪風險帶",
    corridor: {
      positions,
      width: 900,
      height: 18,
      material: CesiumLib.Color.fromCssColorString("#0ea5e9").withAlpha(0.16),
      outline: true,
      outlineColor: CesiumLib.Color.WHITE.withAlpha(0.18)
    }
  }));
}

function addRiverbankBuildings() {
  const samples = riverPath.slice(2, -2);
  samples.forEach(([lon, lat], index) => {
    [-1, 1].forEach((side) => {
      const offsetLon = side * (0.0045 + (index % 3) * 0.0012);
      const offsetLat = side * 0.0012;
      const width = 0.0014 + (index % 2) * 0.0004;
      const depth = 0.0011 + (index % 3) * 0.00025;
      const height = 22 + (index % 5) * 7;
      const center = { lon: lon + offsetLon, lat: lat + offsetLat };
      const entity = viewer.entities.add({
        name: "河岸模擬建物",
        polygon: {
          hierarchy: CesiumLib.Cartesian3.fromDegreesArray([
            center.lon - width, center.lat - depth,
            center.lon + width, center.lat - depth,
            center.lon + width, center.lat + depth,
            center.lon - width, center.lat + depth
          ]),
          height: 0,
          extrudedHeight: height,
          material: CesiumLib.Color.fromCssColorString("#cbd5e1"),
          outline: true,
          outlineColor: CesiumLib.Color.WHITE.withAlpha(0.36)
        },
        position: CesiumLib.Cartesian3.fromDegrees(center.lon, center.lat, height + 4)
      });
      entity.riverbankMeta = { center, baseOutline: CesiumLib.Color.WHITE.withAlpha(0.36) };
      buildingEntities.push(entity);
    });
  });
  setBuildingStatus(`${buildingEntities.length} 棟模擬`);
}

function addStormBands() {
  const bands = [
    { lon: 120.555, lat: 23.025, width: 0.060, depth: 0.065, dbz: 58, color: "#a855f7", alpha: 0.30, speed: 0.0040 },
    { lon: 120.535, lat: 23.070, width: 0.075, depth: 0.050, dbz: 46, color: "#ef4444", alpha: 0.27, speed: 0.0033 },
    { lon: 120.515, lat: 23.115, width: 0.090, depth: 0.042, dbz: 36, color: "#facc15", alpha: 0.22, speed: 0.0028 }
  ];
  bands.forEach((band, index) => {
    const entity = viewer.entities.add({
      name: `假雷達回波 ${band.dbz} dBZ`,
      rectangle: {
        coordinates: stormBoundsToRectangle(stormBounds(band, 0)),
        height: STORM_CLOUD_TOP,
        extrudedHeight: STORM_CLOUD_BOTTOM,
        material: CesiumLib.Color.fromCssColorString(band.color).withAlpha(band.alpha),
        outline: true,
        outlineColor: CesiumLib.Color.WHITE.withAlpha(0.18)
      }
    });
    entity.stormBand = { ...band, index };
    stormEntities.push(entity);
  });
}

function addParticles() {
  for (let index = 0; index < 46; index += 1) {
    const point = pointAlongRiver(index / 46);
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
    particle.flowOffset = index / 46;
    particleEntities.push(particle);
  }
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
    entity.rectangle.coordinates = stormBoundsToRectangle(bounds);
    entity.rectangle.material = CesiumLib.Color.fromCssColorString(band.color).withAlpha(pulse);
    entity.show = stormToggle.checked;
  });
  updateParticles(activeBands);
  updateBuildingGlow(activeBands);
  updateLayerVisibility();
  viewer.scene.requestRender();
}

function updateParticles(activeBands) {
  const strongRain = activeBands.some((band) => band.dbz >= 45);
  const speed = strongRain ? 0.018 : 0.009;
  particleEntities.forEach((particle) => {
    particle.flowOffset = (particle.flowOffset + speed) % 1;
    const point = pointAlongRiver(particle.flowOffset);
    const intensity = radarAt(point, activeBands);
    particle.position = CesiumLib.Cartesian3.fromDegrees(point.lon, point.lat, 95);
    particle.point.pixelSize = intensity >= 45 ? 11 : 7;
    particle.point.color = radarColor(intensity).withAlpha(intensity ? 0.92 : 0.72);
    particle.show = riverToggle.checked;
  });
}

function updateBuildingGlow(activeBands) {
  buildingEntities.forEach((entity) => {
    const intensity = radarAt(entity.riverbankMeta.center, activeBands);
    entity.polygon.outlineColor = intensity
      ? radarColor(intensity).withAlpha(0.82)
      : entity.riverbankMeta.baseOutline;
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
}

function stormBounds(band, phase) {
  const lon = band.lon + ((phase * band.speed) % 0.160);
  return {
    west: lon - band.width / 2,
    south: band.lat - band.depth / 2,
    east: lon + band.width / 2,
    north: band.lat + band.depth / 2
  };
}

function stormBoundsToRectangle(bounds) {
  return CesiumLib.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north);
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
