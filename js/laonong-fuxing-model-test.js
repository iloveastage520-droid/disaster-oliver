const CesiumLib = window.Cesium;

if (!CesiumLib) {
  showError("CesiumJS 載入失敗，請確認瀏覽器可以連到 cdnjs.cloudflare.com。");
  throw new Error("CesiumJS is not available.");
}

CesiumLib.Ion.defaultAccessToken = "";

const TERRAIN_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const MODEL_URL = "https://raw.githubusercontent.com/iloveastage520-droid/disaster-oliver/274b822531a7bf01097e8783d159fc92340a00a2/assets/models/laonong-fuxing/fuxing-tribe-laonong.glb";
const MODEL_POSITION = { lon: 120.80255, lat: 23.21625 };
const MODEL_HEIGHT_OFFSET = 0;
const LABEL_HEIGHT_OFFSET = 520;
const DEFAULT_HEADING_DEGREES = 0;
const SKY_ISLAND_HEIGHT_OFFSET = 1250;
const DEFAULT_MODEL_SCALE = 2;

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
  },
  island: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.8044, 23.2148, 3600),
    orientation: {
      heading: CesiumLib.Math.toRadians(44),
      pitch: CesiumLib.Math.toRadians(-24),
      roll: 0
    }
  }
};

let modelEntity = null;
let labelEntity = null;
const skyIslandEntities = [];
let currentPlacement = {
  lon: MODEL_POSITION.lon,
  lat: MODEL_POSITION.lat,
  lonOffset: 0,
  latOffset: 0,
  heightOffset: MODEL_HEIGHT_OFFSET,
  heading: DEFAULT_HEADING_DEGREES,
  scale: DEFAULT_MODEL_SCALE,
  groundHeight: 760
};
let placementUpdateTimer = null;
const modelToggle = document.querySelector("#model-toggle");
const terrainToggle = document.querySelector("#terrain-toggle");
const skyIslandToggle = document.querySelector("#sky-island-toggle");

document.querySelectorAll("[data-camera]").forEach((button) => {
  button.addEventListener("click", () => {
    viewer.camera.flyTo({
      ...cameraViews[button.dataset.camera],
      duration: 1.2
    });
  });
});

document.querySelectorAll("[data-nudge-lon], [data-nudge-lat], [data-nudge-height], [data-nudge-heading]").forEach((button) => {
  button.addEventListener("click", async () => {
    currentPlacement.lonOffset += Number(button.dataset.nudgeLon || 0);
    currentPlacement.latOffset += Number(button.dataset.nudgeLat || 0);
    currentPlacement.heightOffset += Number(button.dataset.nudgeHeight || 0);
    currentPlacement.heading += Number(button.dataset.nudgeHeading || 0);
    syncPlacementFromOffsets();
    syncSliderControls();
    await placeModelAtCurrentPosition();
    viewer.camera.flyTo({
      ...cameraViews.close,
      duration: 0.55
    });
  });
});

document.querySelectorAll("[data-placement-control]").forEach((input) => {
  input.addEventListener("input", () => {
    const key = input.dataset.placementControl;
    currentPlacement[key] = Number(input.value);
    syncPlacementFromOffsets();
    updatePlacementStatus();
    updateModelScale();
    queuePlacementUpdate();
  });
});

modelToggle.addEventListener("change", () => {
  if (modelEntity) modelEntity.show = modelToggle.checked;
  if (labelEntity) labelEntity.show = modelToggle.checked;
  skyIslandEntities.forEach((entity) => {
    entity.show = modelToggle.checked && skyIslandToggle.checked;
  });
});

terrainToggle.addEventListener("change", () => {
  viewer.scene.verticalExaggeration = terrainToggle.checked ? 1.45 : 1;
});

skyIslandToggle.addEventListener("change", async () => {
  await placeModelAtCurrentPosition();
  viewer.camera.flyTo({
    ...cameraViews[skyIslandToggle.checked ? "island" : "close"],
    duration: 0.9
  });
});

viewer.camera.setView(cameraViews.overview);
setupTerrain();
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
    await placeModelAtCurrentPosition();
    window.setTimeout(() => viewer.camera.setView(cameraViews.overview), 900);
  } catch (error) {
    setTerrainStatus("平面備援");
    console.warn("Terrain load failed", error);
    addModel(placementHeight(760));
  }
}

async function placeModelAtCurrentPosition() {
  setModelStatus("計算地面高度");
  try {
    const cartographic = CesiumLib.Cartographic.fromDegrees(currentPlacement.lon, currentPlacement.lat);
    const [sample] = await CesiumLib.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic]);
    const groundHeight = Number.isFinite(sample.height) ? sample.height : 760;
    currentPlacement.groundHeight = groundHeight;
    addModel(placementHeight(groundHeight));
    setModelStatus(`貼地 / ${Math.round(groundHeight)}m`);
  } catch (error) {
    console.warn("Terrain sample failed", error);
    currentPlacement.groundHeight = 760;
    addModel(placementHeight(760));
    setModelStatus("貼地備援 / 760m");
  }
  updatePlacementStatus();
}

function queuePlacementUpdate() {
  if (placementUpdateTimer) window.clearTimeout(placementUpdateTimer);
  placementUpdateTimer = window.setTimeout(() => {
    placeModelAtCurrentPosition();
  }, 180);
}

function syncPlacementFromOffsets() {
  currentPlacement.lon = MODEL_POSITION.lon + currentPlacement.lonOffset;
  currentPlacement.lat = MODEL_POSITION.lat + currentPlacement.latOffset;
}

function syncSliderControls() {
  const controlMap = {
    lonOffset: "#lon-offset-value",
    latOffset: "#lat-offset-value",
    heightOffset: "#height-offset-value",
    heading: "#heading-value",
    scale: "#scale-value"
  };
  document.querySelectorAll("[data-placement-control]").forEach((input) => {
    const key = input.dataset.placementControl;
    input.value = currentPlacement[key];
    const valueElement = document.querySelector(controlMap[key]);
    if (!valueElement) return;
    if (key === "heightOffset") valueElement.textContent = `${Math.round(currentPlacement[key])}m`;
    else if (key === "heading") valueElement.textContent = `${Math.round(currentPlacement[key])}deg`;
    else if (key === "scale") valueElement.textContent = `${currentPlacement[key].toFixed(2).replace(/\.00$/, "")}x`;
    else valueElement.textContent = currentPlacement[key].toFixed(4);
  });
}

function updateModelScale() {
  if (modelEntity?.model) {
    modelEntity.model.scale = currentPlacement.scale;
  }
}

function addModel(height) {
  setModelStatus("載入中");
  if (modelEntity) viewer.entities.remove(modelEntity);
  if (labelEntity) viewer.entities.remove(labelEntity);
  const position = CesiumLib.Cartesian3.fromDegrees(
    currentPlacement.lon,
    currentPlacement.lat,
    height
  );
  const orientation = CesiumLib.Transforms.headingPitchRollQuaternion(
    position,
    new CesiumLib.HeadingPitchRoll(
      CesiumLib.Math.toRadians(currentPlacement.heading),
      0,
      0
    )
  );
  modelEntity = viewer.entities.add({
    name: "復興部落真實 UAV 模型",
    position,
    orientation,
    model: {
      uri: MODEL_URL,
      scale: currentPlacement.scale,
      minimumPixelSize: 90,
      maximumScale: 2500,
      shadows: CesiumLib.ShadowMode.DISABLED
    }
  });
  labelEntity = viewer.entities.add({
    name: "復興部落真實 UAV 模型標籤",
    position: CesiumLib.Cartesian3.fromDegrees(
      currentPlacement.lon,
      currentPlacement.lat,
      height + LABEL_HEIGHT_OFFSET
    ),
    label: {
      text: "真實 UAV 模型",
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
  updateSkyIsland(height);
  window.setTimeout(() => setModelStatus("載入中 / 約 74MB"), 1200);
}

function placementHeight(groundHeight) {
  return groundHeight
    + currentPlacement.heightOffset
    + (skyIslandToggle.checked ? SKY_ISLAND_HEIGHT_OFFSET : 0);
}

function updateSkyIsland(modelHeight) {
  const enabled = skyIslandToggle.checked && modelToggle.checked;
  setDisplayModeStatus(skyIslandToggle.checked ? "天空島" : "貼地");
  if (!skyIslandEntities.length) createSkyIslandEntities(modelHeight);
  const center = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight - 78);
  const coneCenter = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight - 360);
  const shadowCenter = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, currentPlacement.groundHeight + 16);
  skyIslandEntities[0].position = center;
  skyIslandEntities[1].position = coneCenter;
  skyIslandEntities[2].position = shadowCenter;
  skyIslandEntities[3].position = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight - 112);
  skyIslandEntities.forEach((entity) => {
    entity.show = enabled;
  });
}

function createSkyIslandEntities(modelHeight) {
  const top = viewer.entities.add({
    name: "天空島草地平台",
    position: CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight - 78),
    ellipse: {
      semiMajorAxis: 660,
      semiMinorAxis: 430,
      height: modelHeight - 78,
      material: CesiumLib.Color.fromCssColorString("#4ade80").withAlpha(0.38),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#bbf7d0").withAlpha(0.88),
      rotation: CesiumLib.Math.toRadians(18)
    }
  });
  const cone = viewer.entities.add({
    name: "天空島岩層",
    position: CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight - 360),
    cylinder: {
      length: 560,
      topRadius: 620,
      bottomRadius: 105,
      material: CesiumLib.Color.fromCssColorString("#6b4f35").withAlpha(0.62),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#fde68a").withAlpha(0.42)
    }
  });
  const shadow = viewer.entities.add({
    name: "天空島地面投影",
    position: CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, currentPlacement.groundHeight + 16),
    ellipse: {
      semiMajorAxis: 820,
      semiMinorAxis: 520,
      height: currentPlacement.groundHeight + 16,
      material: CesiumLib.Color.BLACK.withAlpha(0.18),
      outline: false,
      rotation: CesiumLib.Math.toRadians(18)
    }
  });
  const glow = viewer.entities.add({
    name: "天空島光暈",
    position: CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight - 112),
    ellipse: {
      semiMajorAxis: 930,
      semiMinorAxis: 590,
      height: modelHeight - 112,
      material: CesiumLib.Color.fromCssColorString("#67e8f9").withAlpha(0.12),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#67e8f9").withAlpha(0.38),
      rotation: CesiumLib.Math.toRadians(18)
    }
  });
  skyIslandEntities.push(top, cone, shadow, glow);
}

function setTerrainStatus(text) {
  const element = document.querySelector("#terrain-status");
  if (element) element.textContent = text;
}

function setModelStatus(text) {
  const element = document.querySelector("#model-status");
  if (element) element.textContent = text;
}

function setDisplayModeStatus(text) {
  const element = document.querySelector("#display-mode-status");
  if (element) element.textContent = text;
}

function updatePlacementStatus() {
  const positionElement = document.querySelector("#position-status");
  const offsetElement = document.querySelector("#offset-status");
  if (positionElement) {
    positionElement.textContent = `${currentPlacement.lon.toFixed(6)}, ${currentPlacement.lat.toFixed(6)}`;
  }
  if (offsetElement) {
    const skyHeight = skyIslandToggle.checked ? ` +${SKY_ISLAND_HEIGHT_OFFSET}m` : "";
    offsetElement.textContent = `${Math.round(currentPlacement.heightOffset)}m${skyHeight} / ${Math.round(currentPlacement.heading)}deg`;
  }
  syncSliderControls();
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
