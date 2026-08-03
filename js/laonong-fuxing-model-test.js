const CesiumLib = window.Cesium;

if (!CesiumLib) {
  showError("CesiumJS 載入失敗，請確認瀏覽器可以連到 cdnjs.cloudflare.com。");
  throw new Error("CesiumJS is not available.");
}

CesiumLib.Ion.defaultAccessToken = "";

const TERRAIN_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const MODEL_URL = "https://raw.githubusercontent.com/iloveastage520-droid/disaster-oliver/274b822531a7bf01097e8783d159fc92340a00a2/assets/models/laonong-fuxing/fuxing-tribe-laonong.glb";
const MODEL_POSITION = { lon: 120.80255, lat: 23.21625, height: 760 };

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
viewer.scene.verticalExaggeration = 1.45;
viewer.scene.verticalExaggerationRelativeHeight = 0;

const cameraViews = {
  overview: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.804, 23.215, 4200),
    orientation: {
      heading: CesiumLib.Math.toRadians(42),
      pitch: CesiumLib.Math.toRadians(-31),
      roll: 0
    }
  },
  close: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.8029, 23.2161, 1700),
    orientation: {
      heading: CesiumLib.Math.toRadians(55),
      pitch: CesiumLib.Math.toRadians(-18),
      roll: 0
    }
  },
  top: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.80255, 23.21625, 2600),
    orientation: {
      heading: CesiumLib.Math.toRadians(0),
      pitch: CesiumLib.Math.toRadians(-88),
      roll: 0
    }
  }
};

let modelEntity = null;
let labelEntity = null;
const modelToggle = document.querySelector("#model-toggle");
const terrainToggle = document.querySelector("#terrain-toggle");

document.querySelectorAll("[data-camera]").forEach((button) => {
  button.addEventListener("click", () => {
    viewer.camera.flyTo({
      ...cameraViews[button.dataset.camera],
      duration: 1.2
    });
  });
});

modelToggle.addEventListener("change", () => {
  if (modelEntity) modelEntity.show = modelToggle.checked;
  if (labelEntity) labelEntity.show = modelToggle.checked;
});

terrainToggle.addEventListener("change", () => {
  viewer.scene.verticalExaggeration = terrainToggle.checked ? 1.45 : 1;
});

viewer.camera.setView(cameraViews.overview);
setupTerrain();
addModel();
setTimeout(checkCanvas, 2200);

async function setupTerrain() {
  setTerrainStatus("載入中");
  if (!CesiumLib.ArcGISTiledElevationTerrainProvider) {
    setTerrainStatus("不支援");
    return;
  }
  try {
    viewer.terrainProvider = await CesiumLib.ArcGISTiledElevationTerrainProvider.fromUrl(TERRAIN_URL);
    setTerrainStatus("ArcGIS DEM");
    window.setTimeout(() => viewer.camera.setView(cameraViews.overview), 900);
  } catch (error) {
    setTerrainStatus("平面備援");
    console.warn("Terrain load failed", error);
  }
}

function addModel() {
  setModelStatus("載入中");
  const position = CesiumLib.Cartesian3.fromDegrees(
    MODEL_POSITION.lon,
    MODEL_POSITION.lat,
    MODEL_POSITION.height
  );
  const orientation = CesiumLib.Transforms.headingPitchRollQuaternion(
    position,
    new CesiumLib.HeadingPitchRoll(0, 0, 0)
  );
  modelEntity = viewer.entities.add({
    name: "復興部落薄型 GLB",
    position,
    orientation,
    model: {
      uri: MODEL_URL,
      scale: 1,
      minimumPixelSize: 90,
      maximumScale: 2500,
      shadows: CesiumLib.ShadowMode.DISABLED
    }
  });
  labelEntity = viewer.entities.add({
    name: "復興部落薄型模型標籤",
    position: CesiumLib.Cartesian3.fromDegrees(
      MODEL_POSITION.lon,
      MODEL_POSITION.lat,
      MODEL_POSITION.height + 520
    ),
    label: {
      text: "復興部落薄型 GLB",
      font: "700 15px 'Noto Sans TC', sans-serif",
      fillColor: CesiumLib.Color.WHITE,
      outlineColor: CesiumLib.Color.BLACK.withAlpha(0.68),
      outlineWidth: 4,
      style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
      showBackground: true,
      backgroundColor: CesiumLib.Color.fromCssColorString("#0f766e").withAlpha(0.52),
      backgroundPadding: new CesiumLib.Cartesian2(10, 7),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
  window.setTimeout(() => setModelStatus("載入中 / 約 74MB"), 1200);
}

function setTerrainStatus(text) {
  const element = document.querySelector("#terrain-status");
  if (element) element.textContent = text;
}

function setModelStatus(text) {
  const element = document.querySelector("#model-status");
  if (element) element.textContent = text;
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
