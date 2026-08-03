const CesiumLib = window.Cesium;

if (!CesiumLib) {
  showError("CesiumJS 載入失敗，請確認瀏覽器可以連到 cdnjs.cloudflare.com。");
  throw new Error("CesiumJS is not available.");
}

CesiumLib.Ion.defaultAccessToken = "";

const BUILDINGS_URL = "../../data/wulai/wulai-old-street-buildings.geojson";
const ISLAND_CENTER = { lon: 121.549, lat: 24.859 };
const ISLAND_HEIGHT = 980;
const WULAI_RIVER_AXIS = [
  [121.5366, 24.8468],
  [121.5406, 24.8502],
  [121.5452, 24.8550],
  [121.5494, 24.8605],
  [121.5530, 24.8663],
  [121.5562, 24.8722]
];

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
viewer.scene.postProcessStages.fxaa.enabled = true;

const cameraViews = {
  overview: {
    destination: CesiumLib.Cartesian3.fromDegrees(121.551, 24.858, 4400),
    orientation: {
      heading: CesiumLib.Math.toRadians(35),
      pitch: CesiumLib.Math.toRadians(-35),
      roll: 0
    }
  },
  street: {
    destination: CesiumLib.Cartesian3.fromDegrees(121.548, 24.858, 2300),
    orientation: {
      heading: CesiumLib.Math.toRadians(28),
      pitch: CesiumLib.Math.toRadians(-24),
      roll: 0
    }
  },
  top: {
    destination: CesiumLib.Cartesian3.fromDegrees(121.549, 24.859, 3300),
    orientation: {
      heading: 0,
      pitch: CesiumLib.Math.toRadians(-88),
      roll: 0
    }
  }
};

const buildingEntities = [];
const riverEntities = [];
const islandEntities = [];
const buildingToggle = document.querySelector("#building-toggle");
const riverToggle = document.querySelector("#river-toggle");

document.querySelectorAll("[data-camera]").forEach((button) => {
  button.addEventListener("click", () => {
    viewer.camera.flyTo({
      ...cameraViews[button.dataset.camera],
      duration: 1
    });
  });
});

buildingToggle.addEventListener("change", () => {
  buildingEntities.forEach((entity) => {
    entity.show = buildingToggle.checked;
  });
});

riverToggle.addEventListener("change", () => {
  riverEntities.forEach((entity) => {
    entity.show = riverToggle.checked;
  });
});

viewer.camera.setView(cameraViews.overview);
addSkyIsland();
loadBuildings();
addFloodRiver();
setTimeout(checkCanvas, 2200);

async function loadBuildings() {
  const status = document.querySelector("#building-status");
  try {
    const response = await fetch(BUILDINGS_URL);
    const data = await response.json();
    data.features.forEach((feature, index) => {
      const ring = feature.geometry.coordinates[0];
      const height = Number(feature.properties.height || 18);
      const isRisk = distanceToRiver(centroidOf(ring)) < 0.00115;
      buildingEntities.push(viewer.entities.add({
        name: isRisk ? "烏來河岸淹水影響建物" : "烏來 F_BUILD 建物",
        polygon: {
          hierarchy: CesiumLib.Cartesian3.fromDegreesArray(ring.flatMap(([lon, lat]) => [lon, lat])),
          height: ISLAND_HEIGHT + 10,
          extrudedHeight: ISLAND_HEIGHT + 10 + height,
          material: isRisk
            ? CesiumLib.Color.fromCssColorString("#f97316").withAlpha(0.58)
            : CesiumLib.Color.fromCssColorString("#dbeafe").withAlpha(0.56),
          outline: true,
          outlineColor: isRisk
            ? CesiumLib.Color.fromCssColorString("#fde68a").withAlpha(0.95)
            : CesiumLib.Color.fromCssColorString("#7dd3fc").withAlpha(0.76)
        },
        show: buildingToggle.checked
      }));
    });
    status.textContent = `${data.features.length} 棟`;
  } catch (error) {
    console.warn("Wulai buildings load failed", error);
    status.textContent = "載入失敗";
    showError("烏來建物資料載入失敗。");
  }
}

function addFloodRiver() {
  riverEntities.push(viewer.entities.add({
    name: "南勢溪水線示意",
    polyline: {
      positions: CesiumLib.Cartesian3.fromDegreesArrayHeights(WULAI_RIVER_AXIS.flatMap(([lon, lat]) => [lon, lat, ISLAND_HEIGHT + 24])),
      width: 16,
      material: new CesiumLib.PolylineGlowMaterialProperty({
        glowPower: 0.28,
        taperPower: 0.7,
        color: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.86)
      })
    }
  }));
  riverEntities.push(viewer.entities.add({
    name: "南勢溪漫溢示意",
    polygon: {
      hierarchy: CesiumLib.Cartesian3.fromDegreesArray(floodRibbonFootprint(170)),
      height: ISLAND_HEIGHT + 18,
      material: CesiumLib.Color.fromCssColorString("#60a5fa").withAlpha(0.24),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#bae6fd").withAlpha(0.62)
    }
  }));
}

function addSkyIsland() {
  islandEntities.push(viewer.entities.add({
    name: "烏來天空島平台",
    position: CesiumLib.Cartesian3.fromDegrees(ISLAND_CENTER.lon, ISLAND_CENTER.lat, ISLAND_HEIGHT),
    ellipse: {
      semiMajorAxis: 1850,
      semiMinorAxis: 1180,
      height: ISLAND_HEIGHT,
      material: CesiumLib.Color.fromCssColorString("#4ade80").withAlpha(0.26),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#bbf7d0").withAlpha(0.86),
      rotation: CesiumLib.Math.toRadians(32)
    }
  }));
  islandEntities.push(viewer.entities.add({
    name: "烏來天空島岩層",
    position: CesiumLib.Cartesian3.fromDegrees(ISLAND_CENTER.lon, ISLAND_CENTER.lat, ISLAND_HEIGHT - 360),
    cylinder: {
      length: 720,
      topRadius: 970,
      bottomRadius: 145,
      material: CesiumLib.Color.fromCssColorString("#6b4f35").withAlpha(0.62),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#fde68a").withAlpha(0.38)
    }
  }));
  islandEntities.push(viewer.entities.add({
    name: "烏來天空島地面投影",
    position: CesiumLib.Cartesian3.fromDegrees(ISLAND_CENTER.lon, ISLAND_CENTER.lat, 26),
    ellipse: {
      semiMajorAxis: 1350,
      semiMinorAxis: 840,
      height: 26,
      material: CesiumLib.Color.BLACK.withAlpha(0.18),
      outline: false,
      rotation: CesiumLib.Math.toRadians(32)
    }
  }));
  [1320, 1780, 2240].forEach((radius, index) => {
    islandEntities.push(viewer.entities.add({
      name: "烏來天空島掃描環",
      position: CesiumLib.Cartesian3.fromDegrees(ISLAND_CENTER.lon, ISLAND_CENTER.lat, ISLAND_HEIGHT + 18 + index * 24),
      ellipse: {
        semiMajorAxis: radius,
        semiMinorAxis: radius * 0.62,
        height: ISLAND_HEIGHT + 18 + index * 24,
        material: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.04 + index * 0.02),
        outline: true,
        outlineColor: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.72 - index * 0.14),
        rotation: CesiumLib.Math.toRadians(32)
      }
    }));
  });
}

function floodRibbonFootprint(widthMeters) {
  const left = [];
  const right = [];
  WULAI_RIVER_AXIS.forEach(([lon, lat], index) => {
    const previous = WULAI_RIVER_AXIS[Math.max(0, index - 1)];
    const next = WULAI_RIVER_AXIS[Math.min(WULAI_RIVER_AXIS.length - 1, index + 1)];
    const angle = bearingDegrees(previous[0], previous[1], next[0], next[1]);
    const leftPoint = offsetPoint(lon, lat, angle + 90, widthMeters / 2);
    const rightPoint = offsetPoint(lon, lat, angle - 90, widthMeters / 2);
    left.push([leftPoint.lon, leftPoint.lat]);
    right.unshift([rightPoint.lon, rightPoint.lat]);
  });
  return [...left, ...right].flatMap(([lon, lat]) => [lon, lat]);
}

function distanceToRiver([lon, lat]) {
  return Math.min(...WULAI_RIVER_AXIS.map(([riverLon, riverLat]) => {
    const dx = (lon - riverLon) * Math.cos(CesiumLib.Math.toRadians(lat));
    const dy = lat - riverLat;
    return Math.sqrt(dx * dx + dy * dy);
  }));
}

function centroidOf(ring) {
  const total = ring.reduce((sum, [lon, lat]) => {
    sum.lon += lon;
    sum.lat += lat;
    return sum;
  }, { lon: 0, lat: 0 });
  return [total.lon / ring.length, total.lat / ring.length];
}

function bearingDegrees(startLon, startLat, endLon, endLat) {
  const dy = (endLat - startLat) * 111320;
  const dx = (endLon - startLon) * 111320 * Math.cos(CesiumLib.Math.toRadians(startLat));
  return CesiumLib.Math.toDegrees(Math.atan2(dx, dy));
}

function offsetPoint(lon, lat, angleDegrees, distanceMeters) {
  const radians = CesiumLib.Math.toRadians(angleDegrees);
  const metersPerLat = 111320;
  const metersPerLon = 111320 * Math.cos(CesiumLib.Math.toRadians(lat));
  return {
    lon: lon + Math.sin(radians) * distanceMeters / metersPerLon,
    lat: lat + Math.cos(radians) * distanceMeters / metersPerLat
  };
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
