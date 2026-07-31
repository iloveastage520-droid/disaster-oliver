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
const BASIN_GEOJSON_URL = "../../data/laonong-basin-boundary.geojson";
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
    destination: CesiumLib.Cartesian3.fromDegrees(120.620, 23.070, 46000),
    orientation: {
      heading: CesiumLib.Math.toRadians(28),
      pitch: CesiumLib.Math.toRadians(-46),
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
const basinEntities = [];
const markerEntities = [];
const tributaryEntities = [];
let riverMainEntity = null;
let riverRiskEntity = null;
let waterLevel = 0.2;

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
addTributaries();
addRiskMarkers();
loadBasinBoundary();
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
  riverMainEntity = viewer.entities.add({
    name: "荖濃溪主河道",
    polyline: {
      positions,
      width: 11,
      material: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.8),
      clampToGround: false
    }
  });
  riverEntities.push(riverMainEntity);
  riverRiskEntity = viewer.entities.add({
    name: "荖濃溪風險帶",
    corridor: {
      positions,
      width: 1250,
      height: 18,
      material: CesiumLib.Color.fromCssColorString("#0ea5e9").withAlpha(0.16),
      outline: true,
      outlineColor: CesiumLib.Color.WHITE.withAlpha(0.18)
    }
  });
  riverEntities.push(riverRiskEntity);
}

function addRiverbankBuildings() {
  const villageOffsets = [0.16, 0.27, 0.39, 0.51, 0.63, 0.76, 0.88];
  villageOffsets.forEach((progress, villageIndex) => {
    const anchor = pointAlongRiver(progress);
    const count = 8 + (villageIndex % 4) * 2;
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const riverDistance = 0.0038 + row * 0.0015 + (villageIndex % 2) * 0.0008;
      const along = (index % 4 - 1.5) * 0.0018;
      const center = {
        lon: anchor.lon + side * riverDistance + along,
        lat: anchor.lat + side * 0.0011 + row * 0.0007
      };
      const width = 0.00075 + (index % 3) * 0.00022;
      const depth = 0.00065 + (index % 2) * 0.0002;
      const floors = 1 + ((index + villageIndex) % 5);
      const height = floors * 4.2;
      const entity = viewer.entities.add({
        name: `荖濃溪沿岸聚落 ${villageIndex + 1}-${index + 1}`,
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
      entity.riverbankMeta = {
        center,
        floors,
        riverDistance,
        baseOutline: CesiumLib.Color.WHITE.withAlpha(0.36)
      };
      buildingEntities.push(entity);
    }
  });
  setBuildingStatus(`${buildingEntities.length} 棟聚落`);
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

function addTributaries() {
  const tributaries = [
    [[120.707, 23.246], [120.685, 23.228], [120.663, 23.210], [120.641, 23.190]],
    [[120.592, 23.180], [120.608, 23.154], [120.632, 23.126], [120.641, 23.102]],
    [[120.548, 23.041], [120.566, 23.022], [120.585, 23.014]],
    [[120.522, 22.967], [120.542, 22.955], [120.560, 22.940]],
    [[120.626, 23.075], [120.652, 23.064], [120.675, 23.047]]
  ];
  tributaries.forEach((path, index) => {
    const entity = viewer.entities.add({
      name: `發光支流 ${index + 1}`,
      polyline: {
        positions: CesiumLib.Cartesian3.fromDegreesArray(path.flat()),
        width: 3,
        material: new CesiumLib.PolylineGlowMaterialProperty({
          glowPower: 0.28,
          taperPower: 0.75,
          color: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.72)
        }),
        clampToGround: false
      }
    });
    tributaryEntities.push(entity);
    riverEntities.push(entity);
  });
}

function addRiskMarkers() {
  const markers = [
    { name: "桃源區", lon: 120.778, lat: 23.161, type: "danger", detail: "累積雨量 412mm" },
    { name: "那瑪夏區", lon: 120.704, lat: 23.222, type: "warning", detail: "累積雨量 287mm" },
    { name: "寶來斷崖", lon: 120.566, lat: 23.010, type: "station", detail: "水位 4.2m" },
    { name: "六龜區", lon: 120.635, lat: 23.082, type: "normal", detail: "水位站正常" },
    { name: "新發雨量站", lon: 120.654, lat: 23.060, type: "station", detail: "累積雨量 256mm" },
    { name: "多納里", lon: 120.683, lat: 23.046, type: "danger", detail: "聚落高風險" },
    { name: "月眉橋", lon: 120.531, lat: 22.958, type: "warning", detail: "水位 2.1m" },
    { name: "大津橋", lon: 120.508, lat: 22.920, type: "watch", detail: "水位 1.8m" }
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

async function loadBasinBoundary() {
  try {
    const dataSource = await CesiumLib.GeoJsonDataSource.load(BASIN_GEOJSON_URL, {
      clampToGround: false,
      stroke: CesiumLib.Color.fromCssColorString("#93c5fd").withAlpha(0.86),
      fill: CesiumLib.Color.fromCssColorString("#0ea5e9").withAlpha(0.08),
      strokeWidth: 3
    });
    viewer.dataSources.add(dataSource);
    dataSource.entities.values.forEach((entity) => {
      entity.name = "官方高屏溪流域範圍";
      if (entity.polygon) {
        entity.polygon.height = 35;
        entity.polygon.material = CesiumLib.Color.fromCssColorString("#0ea5e9").withAlpha(0.08);
        entity.polygon.outline = true;
        entity.polygon.outlineColor = CesiumLib.Color.fromCssColorString("#93c5fd").withAlpha(0.86);
      }
      basinEntities.push(entity);
    });
  } catch (error) {
    console.warn("Basin boundary load failed", error);
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
  if (riverMainEntity) {
    riverMainEntity.polyline.width = 9 + waterLevel * 16;
    riverMainEntity.polyline.material = CesiumLib.Color
      .fromCssColorString(waterLevel > 0.75 ? "#7dd3fc" : "#38bdf8")
      .withAlpha(0.78 + waterLevel * 0.16);
  }
  if (riverRiskEntity) {
    riverRiskEntity.corridor.width = 820 + waterLevel * 2800;
    riverRiskEntity.corridor.material = CesiumLib.Color
      .fromCssColorString(waterLevel > 0.75 ? "#60a5fa" : "#0ea5e9")
      .withAlpha(0.10 + waterLevel * 0.22);
    riverRiskEntity.corridor.outlineColor = CesiumLib.Color.WHITE.withAlpha(0.16 + waterLevel * 0.30);
  }
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
  basinEntities.forEach((entity) => {
    entity.show = riverToggle.checked;
  });
  markerEntities.forEach((entity) => {
    entity.show = riverToggle.checked;
  });
  tributaryEntities.forEach((entity) => {
    entity.show = riverToggle.checked;
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

function markerColor(type) {
  if (type === "danger") return CesiumLib.Color.fromCssColorString("#ef4444");
  if (type === "warning") return CesiumLib.Color.fromCssColorString("#f97316");
  if (type === "watch") return CesiumLib.Color.fromCssColorString("#facc15");
  if (type === "station") return CesiumLib.Color.fromCssColorString("#38bdf8");
  return CesiumLib.Color.fromCssColorString("#22c55e");
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
