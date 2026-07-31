const Cesium = window.Cesium;

window.addEventListener("error", (event) => {
  showCesiumError(`Cesium 場景錯誤：${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || String(event.reason || "unknown error");
  showCesiumError(`Cesium 非同步載入錯誤：${message}`);
});

if (!Cesium) {
  showCesiumError("CesiumJS 載入失敗，請確認瀏覽器可以連到 cdnjs.cloudflare.com。");
  throw new Error("CesiumJS is not available.");
}

Cesium.Ion.defaultAccessToken = "";

const viewer = new Cesium.Viewer("cesium-container", {
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
  terrainProvider: new Cesium.EllipsoidTerrainProvider()
});

viewer.imageryLayers.removeAll();
viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  credit: "© OpenStreetMap contributors",
  maximumLevel: 19
}));

viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#07111f");
viewer.scene.globe.depthTestAgainstTerrain = false;
viewer.scene.globe.enableLighting = false;
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#102033");
viewer.scene.skyAtmosphere.show = true;
viewer.scene.postProcessStages.fxaa.enabled = true;

const taipei = Cesium.Cartesian3.fromDegrees(121.5654, 25.0330, 950);
const cameraViews = {
  overview: {
    destination: Cesium.Cartesian3.fromDegrees(121.5654, 25.0330, 5200),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-58),
      roll: 0
    }
  },
  low: {
    destination: Cesium.Cartesian3.fromDegrees(121.5442, 25.0197, 1350),
    orientation: {
      heading: Cesium.Math.toRadians(48),
      pitch: Cesium.Math.toRadians(-22),
      roll: 0
    }
  },
  tower: {
    destination: Cesium.Cartesian3.fromDegrees(121.5568, 25.0409, 1850),
    orientation: {
      heading: Cesium.Math.toRadians(118),
      pitch: Cesium.Math.toRadians(-34),
      roll: 0
    }
  }
};

const eventSites = [
  { name: "信義區積淹水", lon: 121.5638, lat: 25.0341, height: 520, level: "高", color: Cesium.Color.CRIMSON },
  { name: "大安區路樹倒伏", lon: 121.5436, lat: 25.0267, height: 330, level: "中", color: Cesium.Color.ORANGE },
  { name: "松山車站周邊通報", lon: 121.5787, lat: 25.0495, height: 420, level: "中高", color: Cesium.Color.GOLD },
  { name: "南港排水巡查", lon: 121.6072, lat: 25.0531, height: 260, level: "低", color: Cesium.Color.CYAN }
];

viewer.entities.add({
  name: "半透明淹水測試面",
  polygon: {
    hierarchy: Cesium.Cartesian3.fromDegreesArray([
      121.5352, 25.0188,
      121.5751, 25.0174,
      121.5906, 25.0398,
      121.5604, 25.0552,
      121.5268, 25.0419
    ]),
    material: Cesium.Color.DODGERBLUE.withAlpha(0.32),
    outline: true,
    outlineColor: Cesium.Color.WHITE.withAlpha(0.72),
    extrudedHeight: 42,
    height: 8
  }
});

eventSites.forEach((site) => {
  viewer.entities.add({
    name: site.name,
    description: `災情等級：${site.level}<br>測試高度：${site.height}m`,
    position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, site.height + 40),
    cylinder: {
      length: site.height,
      topRadius: 42,
      bottomRadius: 42,
      material: site.color.withAlpha(0.72),
      outline: true,
      outlineColor: Cesium.Color.WHITE.withAlpha(0.48)
    },
    label: {
      text: site.name,
      font: "15px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -24),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    point: {
      pixelSize: 10,
      color: site.color,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
});

viewer.entities.add({
  name: "應變巡查路徑",
  polyline: {
    positions: Cesium.Cartesian3.fromDegreesArrayHeights([
      121.5436, 25.0267, 80,
      121.5638, 25.0341, 120,
      121.5787, 25.0495, 100,
      121.6072, 25.0531, 90
    ]),
    width: 5,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.18,
      color: Cesium.Color.LIME
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
