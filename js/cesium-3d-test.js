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
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  credit: "© OpenStreetMap contributors",
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
});

viewer.clock.onTick.addEventListener(() => {
  if (!spinning) return;
  viewer.scene.camera.rotate(taipei, -0.00018);
});

flyToView("overview");
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
