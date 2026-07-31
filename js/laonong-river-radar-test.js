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
const STORM_CLOUD_BOTTOM = 1880;
const STORM_CLOUD_TOP = 2020;
const riverPath = [
  [120.740, 23.302],
  [120.724, 23.279],
  [120.709, 23.255],
  [120.713, 23.234],
  [120.699, 23.214],
  [120.682, 23.196],
  [120.689, 23.176],
  [120.668, 23.157],
  [120.651, 23.137],
  [120.659, 23.119],
  [120.638, 23.101],
  [120.615, 23.086],
  [120.622, 23.068],
  [120.602, 23.050],
  [120.579, 23.035],
  [120.586, 23.015],
  [120.563, 22.999],
  [120.544, 22.982],
  [120.551, 22.963],
  [120.528, 22.948],
  [120.510, 22.930],
  [120.497, 22.912]
];
const cameraViews = {
  overview: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.620, 23.090, 68000),
    orientation: {
      heading: CesiumLib.Math.toRadians(18),
      pitch: CesiumLib.Math.toRadians(-62),
      roll: 0
    }
  },
  river: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.617, 23.078, 18000),
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
      width: 11,
      material: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.8),
      clampToGround: false
    }
  }));
  riverEntities.push(viewer.entities.add({
    name: "荖濃溪風險帶",
    corridor: {
      positions,
      width: 1250,
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
    { lon: 120.500, lat: 22.965, width: 0.095, depth: 0.070, dbz: 54, color: "#ef4444", alpha: 0.22, speed: 0.0032 },
    { lon: 120.525, lat: 23.015, width: 0.120, depth: 0.080, dbz: 62, color: "#a855f7", alpha: 0.24, speed: 0.0035 },
    { lon: 120.545, lat: 23.070, width: 0.130, depth: 0.070, dbz: 48, color: "#ef4444", alpha: 0.22, speed: 0.0030 },
    { lon: 120.570, lat: 23.125, width: 0.150, depth: 0.060, dbz: 40, color: "#f97316", alpha: 0.20, speed: 0.0027 },
    { lon: 120.590, lat: 23.180, width: 0.140, depth: 0.065, dbz: 36, color: "#facc15", alpha: 0.18, speed: 0.0025 },
    { lon: 120.620, lat: 23.235, width: 0.160, depth: 0.055, dbz: 30, color: "#22c55e", alpha: 0.16, speed: 0.0022 }
  ];
  bands.forEach((band, index) => {
    const blobs = [
      { lonOffset: 0, latOffset: 0, scale: 1 },
      { lonOffset: -0.018, latOffset: 0.010, scale: 0.72 },
      { lonOffset: 0.020, latOffset: -0.008, scale: 0.64 },
      { lonOffset: 0.006, latOffset: 0.018, scale: 0.52 },
      { lonOffset: -0.030, latOffset: -0.006, scale: 0.44 },
      { lonOffset: 0.032, latOffset: 0.012, scale: 0.40 }
    ];
    blobs.forEach((blob, blobIndex) => {
      const entity = viewer.entities.add({
        name: `假雷達回波 ${band.dbz} dBZ`,
        position: stormPosition(band, blob, 0),
        ellipse: {
          semiMajorAxis: cloudAxisMeters(band, blob).major,
          semiMinorAxis: cloudAxisMeters(band, blob).minor,
          height: STORM_CLOUD_TOP,
          extrudedHeight: STORM_CLOUD_BOTTOM,
          material: CesiumLib.Color.fromCssColorString(band.color).withAlpha(band.alpha),
          outline: false
        }
      });
      entity.stormBand = { ...band, index, blob, blobIndex };
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
    entity.position = stormPosition(band, band.blob, stormFrame + band.index * 8);
    entity.ellipse.material = CesiumLib.Color
      .fromCssColorString(band.color)
      .withAlpha(Math.min(pulse * (band.blobIndex ? 0.78 : 1), 0.46));
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
  const center = stormCenter(band, phase);
  const scale = band.blob?.scale || 1;
  const lonOffset = band.blob?.lonOffset || 0;
  const latOffset = band.blob?.latOffset || 0;
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

function stormPosition(band, blob, phase) {
  const center = stormCenter(band, phase);
  return CesiumLib.Cartesian3.fromDegrees(
    center.lon + blob.lonOffset,
    center.lat + blob.latOffset,
    STORM_CLOUD_TOP
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
