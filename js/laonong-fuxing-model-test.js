const CesiumLib = window.Cesium;

if (!CesiumLib) {
  showError("CesiumJS 載入失敗，請確認瀏覽器可以連到 cdnjs.cloudflare.com。");
  throw new Error("CesiumJS is not available.");
}

CesiumLib.Ion.defaultAccessToken = "";

const TERRAIN_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const MODEL_URL = "https://raw.githubusercontent.com/iloveastage520-droid/disaster-oliver/274b822531a7bf01097e8783d159fc92340a00a2/assets/models/laonong-fuxing/fuxing-tribe-laonong.glb";
const REAL_BUILDINGS_URL = "../../data/laonong-upper-settlement-buildings.geojson";
const BASIN_BOUNDARY_URL = "../../data/laonong-subbasin-boundary.geojson";
const REAL_RIVER_FLOWLINE_URL = "../../data/laonong-river-flowline.geojson";
const MODEL_POSITION = { lon: 120.80255, lat: 23.21625 };
const MODEL_HEIGHT_OFFSET = 0;
const DEFAULT_MODEL_PLATFORM_OFFSET = -680;
const LABEL_HEIGHT_OFFSET = 520;
const DEFAULT_HEADING_DEGREES = 0;
const SKY_ISLAND_HEIGHT_OFFSET = 1250;
const DEFAULT_MODEL_SCALE = 2;
const SHOWCASE_SCAN_HEIGHT_OFFSET = 24;
const FUXING_OSM_BUILDINGS = [
  [[120.8037255, 23.2230097], [120.8037814, 23.2230081], [120.8037792, 23.2229453], [120.8037233, 23.2229469]],
  [[120.8030676, 23.2228621], [120.8030975, 23.2228512], [120.8031079, 23.2228752], [120.8031473, 23.2228609], [120.8031327, 23.2228270], [120.8031770, 23.2228109], [120.8031382, 23.2227212], [120.8030246, 23.2227626]],
  [[120.8054999, 23.2239633], [120.8056092, 23.2239823], [120.8056286, 23.2238885], [120.8055192, 23.2238695]],
  [[120.8058342, 23.2241038], [120.8058914, 23.2241038], [120.8058914, 23.2239821], [120.8058342, 23.2239821]],
  [[120.8039915, 23.2182013], [120.8039711, 23.2180923], [120.8040935, 23.2180729], [120.8041139, 23.2181820]],
  [[120.8041695, 23.2181411], [120.8041485, 23.2180392], [120.8044817, 23.2179811], [120.8045031, 23.2180848], [120.8041670, 23.2181435]]
];
const FUXING_COMMUNITY_BUILDINGS = [
  { lon: 120.80355, lat: 23.21845, angle: 14, width: 34, depth: 22, height: 18 },
  { lon: 120.80385, lat: 23.21838, angle: -8, width: 28, depth: 20, height: 14 },
  { lon: 120.80418, lat: 23.21834, angle: -12, width: 42, depth: 18, height: 20 },
  { lon: 120.80452, lat: 23.21826, angle: -18, width: 36, depth: 22, height: 16 },
  { lon: 120.80482, lat: 23.21816, angle: 10, width: 30, depth: 20, height: 13 },
  { lon: 120.80508, lat: 23.21798, angle: 20, width: 38, depth: 24, height: 21 },
  { lon: 120.80332, lat: 23.21798, angle: 4, width: 32, depth: 18, height: 12 },
  { lon: 120.80368, lat: 23.21785, angle: -10, width: 40, depth: 22, height: 18 },
  { lon: 120.80402, lat: 23.21778, angle: -18, width: 34, depth: 20, height: 15 },
  { lon: 120.80442, lat: 23.21765, angle: 12, width: 44, depth: 24, height: 23 },
  { lon: 120.80482, lat: 23.21754, angle: 18, width: 34, depth: 20, height: 17 },
  { lon: 120.80518, lat: 23.21742, angle: 24, width: 30, depth: 18, height: 15 },
  { lon: 120.80292, lat: 23.21755, angle: -14, width: 36, depth: 22, height: 18 },
  { lon: 120.80328, lat: 23.21735, angle: 8, width: 42, depth: 24, height: 20 },
  { lon: 120.80368, lat: 23.21720, angle: 16, width: 30, depth: 18, height: 14 },
  { lon: 120.80412, lat: 23.21712, angle: -20, width: 38, depth: 22, height: 16 },
  { lon: 120.80454, lat: 23.21696, angle: 12, width: 34, depth: 18, height: 13 },
  { lon: 120.80492, lat: 23.21678, angle: 4, width: 42, depth: 24, height: 22 },
  { lon: 120.80535, lat: 23.21658, angle: 22, width: 32, depth: 20, height: 15 },
  { lon: 120.80275, lat: 23.21688, angle: 10, width: 30, depth: 18, height: 14 },
  { lon: 120.80310, lat: 23.21672, angle: -6, width: 36, depth: 20, height: 16 },
  { lon: 120.80350, lat: 23.21655, angle: 18, width: 42, depth: 24, height: 21 },
  { lon: 120.80388, lat: 23.21638, angle: 26, width: 32, depth: 18, height: 15 },
  { lon: 120.80425, lat: 23.21620, angle: -16, width: 38, depth: 22, height: 17 }
];
const FUXING_RIVER_AXIS = [
  [120.742800, 23.133800],
  [120.759200, 23.152300],
  [120.773100, 23.171800],
  [120.782656, 23.187095],
  [120.795070, 23.207380],
  [120.803373, 23.219192],
  [120.806434, 23.228510],
  [120.811851, 23.244394],
  [120.818430, 23.249572]
];
const UPPER_SETTLEMENT_ISLANDS = [
  { name: "梅山", lon: 120.81843, lat: 23.24957, risk: "high" },
  { name: "拉芙蘭", lon: 120.81185, lat: 23.24439, risk: "medium" },
  { name: "復興", lon: 120.80337, lat: 23.21919, risk: "high" },
  { name: "勤和", lon: 120.79507, lat: 23.20738, risk: "high" },
  { name: "桃源", lon: 120.78266, lat: 23.18710, risk: "medium" },
  { name: "高中", lon: 120.77310, lat: 23.17180, risk: "medium" },
  { name: "建山", lon: 120.75920, lat: 23.15230, risk: "low" },
  { name: "寶山", lon: 120.74280, lat: 23.13380, risk: "low" }
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
viewer.scene.skyAtmosphere.show = true;
viewer.scene.postProcessStages.fxaa.enabled = true;
viewer.scene.verticalExaggeration = 1.45;
viewer.scene.verticalExaggerationRelativeHeight = 0;

const cameraViews = {
  overview: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.785, 23.195, 15000),
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
    destination: CesiumLib.Cartesian3.fromDegrees(120.808, 23.205, 9200),
    orientation: {
      heading: CesiumLib.Math.toRadians(44),
      pitch: CesiumLib.Math.toRadians(-21),
      roll: 0
    }
  }
};

let modelEntity = null;
let labelEntity = null;
const skyIslandEntities = [];
const showcaseEntities = [];
const buildingEntities = [];
const buildingMetadata = [];
const floodEntities = [];
const basinEntities = [];
const settlementIslandEntities = [];
let basinBoundaryRing = [];
let activeRiverAxis = FUXING_RIVER_AXIS;
let currentPlacement = {
  lon: MODEL_POSITION.lon,
  lat: MODEL_POSITION.lat,
  lonOffset: 0,
  latOffset: 0,
  heightOffset: MODEL_HEIGHT_OFFSET,
  modelVerticalOffset: DEFAULT_MODEL_PLATFORM_OFFSET,
  heading: DEFAULT_HEADING_DEGREES,
  scale: DEFAULT_MODEL_SCALE,
  groundHeight: 760
};
let placementUpdateTimer = null;
const modelToggle = document.querySelector("#model-toggle");
const terrainToggle = document.querySelector("#terrain-toggle");
const skyIslandToggle = document.querySelector("#sky-island-toggle");
const communityToggle = document.querySelector("#community-toggle");
const mobileDockButtons = document.querySelectorAll("[data-fuxing-panel]");
const mobilePanelTargets = document.querySelectorAll("[data-fuxing-panel-target]");
const mobilePanelQuery = window.matchMedia("(max-width: 760px)");

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

communityToggle.addEventListener("change", () => {
  buildingEntities.forEach((entity) => {
    entity.show = communityToggle.checked;
  });
  settlementIslandEntities.forEach((entity) => {
    entity.show = communityToggle.checked && skyIslandToggle.checked;
  });
  floodEntities.forEach((entity) => {
    entity.show = communityToggle.checked && skyIslandToggle.checked;
  });
  basinEntities.forEach((entity) => {
    entity.show = communityToggle.checked;
  });
});

viewer.camera.setView(cameraViews.island);
setupFuxingMobilePanels();
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
    await loadRealRiverFlowline();
    await placeModelAtCurrentPosition();
    await addBasinBoundary();
    await addCommunityBuildings();
    window.setTimeout(() => viewer.camera.setView(cameraViews.island), 900);
  } catch (error) {
    setTerrainStatus("平面備援");
    console.warn("Terrain load failed", error);
    loadRealRiverFlowline();
    addModel(placementHeight(760));
    addBasinBoundary();
    addCommunityBuildings();
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
    modelVerticalOffset: "#model-vertical-offset-value",
    heading: "#heading-value",
    scale: "#scale-value"
  };
  document.querySelectorAll("[data-placement-control]").forEach((input) => {
    const key = input.dataset.placementControl;
    input.value = currentPlacement[key];
    const valueElement = document.querySelector(controlMap[key]);
    if (!valueElement) return;
    if (key === "heightOffset" || key === "modelVerticalOffset") valueElement.textContent = `${Math.round(currentPlacement[key])}m`;
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
  const modelHeight = height + currentPlacement.modelVerticalOffset;
  const position = CesiumLib.Cartesian3.fromDegrees(
    currentPlacement.lon,
    currentPlacement.lat,
    modelHeight
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
      silhouetteColor: CesiumLib.Color.fromCssColorString("#7dd3fc").withAlpha(0.95),
      silhouetteSize: 2.4,
      shadows: CesiumLib.ShadowMode.DISABLED
    }
  });
  labelEntity = viewer.entities.add({
    name: "復興部落真實 UAV 模型標籤",
    position: CesiumLib.Cartesian3.fromDegrees(
      currentPlacement.lon,
      currentPlacement.lat,
      modelHeight + LABEL_HEIGHT_OFFSET
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
  const center = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight);
  const coneCenter = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight - 380);
  const shadowCenter = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, currentPlacement.groundHeight + 16);
  skyIslandEntities[0].position = center;
  skyIslandEntities[1].position = coneCenter;
  skyIslandEntities[2].position = shadowCenter;
  skyIslandEntities[3].position = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight + 18);
  updateShowcaseEffects(modelHeight);
  updateSettlementIslands(modelHeight);
  updateCommunityBuildingHeights(modelHeight);
  skyIslandEntities.forEach((entity) => {
    entity.show = enabled;
  });
}

function createSkyIslandEntities(modelHeight) {
  const top = viewer.entities.add({
    name: "天空島草地平台",
    position: CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight),
    ellipse: {
      semiMajorAxis: 1120,
      semiMinorAxis: 720,
      height: modelHeight,
      material: CesiumLib.Color.fromCssColorString("#4ade80").withAlpha(0.30),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#bbf7d0").withAlpha(0.88),
      rotation: CesiumLib.Math.toRadians(18)
    }
  });
  const cone = viewer.entities.add({
    name: "天空島岩層",
    position: CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight - 380),
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
    position: CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight + 18),
    ellipse: {
      semiMajorAxis: 1380,
      semiMinorAxis: 850,
      height: modelHeight + 18,
      material: CesiumLib.Color.fromCssColorString("#67e8f9").withAlpha(0.12),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#67e8f9").withAlpha(0.38),
      rotation: CesiumLib.Math.toRadians(18)
    }
  });
  skyIslandEntities.push(top, cone, shadow, glow);
}

function updateShowcaseEffects(modelHeight) {
  const enabled = skyIslandToggle.checked && modelToggle.checked;
  if (!showcaseEntities.length) createShowcaseEffects(modelHeight);
  const scanHeight = modelHeight + SHOWCASE_SCAN_HEIGHT_OFFSET;
  const beacons = [
    { lon: currentPlacement.lon - 0.0048, lat: currentPlacement.lat + 0.0022 },
    { lon: currentPlacement.lon + 0.0044, lat: currentPlacement.lat + 0.0028 },
    { lon: currentPlacement.lon - 0.0038, lat: currentPlacement.lat - 0.0028 },
    { lon: currentPlacement.lon + 0.0048, lat: currentPlacement.lat - 0.0024 }
  ];
  showcaseEntities[0].position = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, scanHeight);
  showcaseEntities[1].position = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, scanHeight + 26);
  showcaseEntities[2].position = CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, scanHeight + 52);
  beacons.forEach((point, index) => {
    const entity = showcaseEntities[3 + index];
    entity.polyline.positions = CesiumLib.Cartesian3.fromDegreesArrayHeights([
      point.lon, point.lat, currentPlacement.groundHeight + 80,
      point.lon, point.lat, scanHeight + 820
    ]);
  });
  showcaseEntities[7].polyline.positions = CesiumLib.Cartesian3.fromDegreesArrayHeights([
    currentPlacement.lon - 0.0048, currentPlacement.lat + 0.0022, scanHeight + 150,
    currentPlacement.lon, currentPlacement.lat, scanHeight + 360,
    currentPlacement.lon + 0.0044, currentPlacement.lat + 0.0028, scanHeight + 150
  ]);
  showcaseEntities.forEach((entity) => {
    entity.show = enabled;
  });
}

function createShowcaseEffects(modelHeight) {
  const scanColor = CesiumLib.Color.fromCssColorString("#38bdf8");
  [1900, 2850, 3800].forEach((radius, index) => {
    showcaseEntities.push(viewer.entities.add({
      name: "數位孿生島掃描環",
      position: CesiumLib.Cartesian3.fromDegrees(currentPlacement.lon, currentPlacement.lat, modelHeight + SHOWCASE_SCAN_HEIGHT_OFFSET + index * 26),
      ellipse: {
        semiMajorAxis: radius,
        semiMinorAxis: radius * 0.36,
        height: modelHeight + SHOWCASE_SCAN_HEIGHT_OFFSET + index * 26,
        material: scanColor.withAlpha(0.04 + index * 0.025),
        outline: true,
        outlineColor: scanColor.withAlpha(0.76 - index * 0.12),
        rotation: CesiumLib.Math.toRadians(18)
      }
    }));
  });
  for (let index = 0; index < 4; index += 1) {
    showcaseEntities.push(viewer.entities.add({
      name: "UAV 模型光柱",
      polyline: {
        positions: CesiumLib.Cartesian3.fromDegreesArrayHeights([
          currentPlacement.lon, currentPlacement.lat, currentPlacement.groundHeight,
          currentPlacement.lon, currentPlacement.lat, modelHeight + 900
        ]),
        width: 2,
        material: new CesiumLib.PolylineGlowMaterialProperty({
          glowPower: 0.28,
          taperPower: 0.7,
          color: scanColor.withAlpha(0.72)
        })
      }
    }));
  }
  showcaseEntities.push(viewer.entities.add({
    name: "數位孿生島資料連線",
    polyline: {
      positions: CesiumLib.Cartesian3.fromDegreesArrayHeights([
        currentPlacement.lon - 0.004, currentPlacement.lat, modelHeight,
        currentPlacement.lon, currentPlacement.lat, modelHeight + 220,
        currentPlacement.lon + 0.004, currentPlacement.lat, modelHeight
      ]),
      width: 3,
      material: new CesiumLib.PolylineGlowMaterialProperty({
        glowPower: 0.22,
        taperPower: 0.75,
        color: scanColor.withAlpha(0.82)
      })
    }
  }));
}

function updateSettlementIslands(modelHeight) {
  const enabled = skyIslandToggle.checked && communityToggle.checked;
  if (!settlementIslandEntities.length) createSettlementIslands(modelHeight);
  UPPER_SETTLEMENT_ISLANDS.forEach((settlement, index) => {
    const base = modelHeight + 8 + index * 3;
    const platform = settlementIslandEntities[index * 3];
    const glow = settlementIslandEntities[index * 3 + 1];
    const label = settlementIslandEntities[index * 3 + 2];
    platform.position = CesiumLib.Cartesian3.fromDegrees(settlement.lon, settlement.lat, base);
    platform.ellipse.height = base;
    glow.position = CesiumLib.Cartesian3.fromDegrees(settlement.lon, settlement.lat, base + 8);
    glow.ellipse.height = base + 8;
    label.position = CesiumLib.Cartesian3.fromDegrees(settlement.lon, settlement.lat, base + 92);
  });
  settlementIslandEntities.forEach((entity) => {
    entity.show = enabled;
  });
}

function createSettlementIslands(modelHeight) {
  UPPER_SETTLEMENT_ISLANDS.forEach((settlement, index) => {
    const base = modelHeight + 8 + index * 3;
    const isHighRisk = settlement.risk === "high";
    settlementIslandEntities.push(viewer.entities.add({
      name: `${settlement.name}天空島平台`,
      position: CesiumLib.Cartesian3.fromDegrees(settlement.lon, settlement.lat, base),
      ellipse: {
        semiMajorAxis: isHighRisk ? 780 : 650,
        semiMinorAxis: isHighRisk ? 520 : 430,
        height: base,
        material: CesiumLib.Color.fromCssColorString(isHighRisk ? "#f97316" : "#38bdf8").withAlpha(0.15),
        outline: true,
        outlineColor: CesiumLib.Color.fromCssColorString(isHighRisk ? "#fde68a" : "#bae6fd").withAlpha(0.82),
        rotation: CesiumLib.Math.toRadians(18 + index * 11)
      }
    }));
    settlementIslandEntities.push(viewer.entities.add({
      name: `${settlement.name}淹水影響光暈`,
      position: CesiumLib.Cartesian3.fromDegrees(settlement.lon, settlement.lat, base + 8),
      ellipse: {
        semiMajorAxis: isHighRisk ? 980 : 780,
        semiMinorAxis: isHighRisk ? 650 : 520,
        height: base + 8,
        material: CesiumLib.Color.fromCssColorString(isHighRisk ? "#fb923c" : "#60a5fa").withAlpha(isHighRisk ? 0.14 : 0.08),
        outline: true,
        outlineColor: CesiumLib.Color.fromCssColorString(isHighRisk ? "#fb7185" : "#38bdf8").withAlpha(0.42),
        rotation: CesiumLib.Math.toRadians(18 + index * 11)
      }
    }));
    settlementIslandEntities.push(viewer.entities.add({
      name: `${settlement.name}標籤`,
      position: CesiumLib.Cartesian3.fromDegrees(settlement.lon, settlement.lat, base + 92),
      label: {
        text: settlement.name,
        font: "700 14px 'Noto Sans TC', sans-serif",
        fillColor: CesiumLib.Color.WHITE,
        outlineColor: CesiumLib.Color.BLACK.withAlpha(0.72),
        outlineWidth: 4,
        style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: CesiumLib.Color.fromCssColorString(isHighRisk ? "#7f1d1d" : "#075985").withAlpha(0.62),
        backgroundPadding: new CesiumLib.Cartesian2(9, 6),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    }));
  });
}

async function addCommunityBuildings() {
  if (buildingEntities.length) {
    updateCommunityBuildingHeights(placementHeight(currentPlacement.groundHeight));
    buildingEntities.forEach((entity) => {
      entity.show = communityToggle.checked;
    });
    return;
  }

  const buildings = await loadRealCommunityBuildings();
  const samples = buildings.map((building) => CesiumLib.Cartographic.fromDegrees(...centroidOf(building.footprint)));
  let groundSamples = [];
  try {
    groundSamples = await CesiumLib.sampleTerrainMostDetailed(viewer.terrainProvider, samples);
  } catch (error) {
    console.warn("Building terrain sample failed", error);
  }

  buildings.forEach((building, index) => {
    const [lon, lat] = centroidOf(building.footprint);
    const sampledHeight = groundSamples[index]?.height;
    const baseHeight = Number.isFinite(sampledHeight) ? sampledHeight + 2 : currentPlacement.groundHeight + 2;
    const color = building.flooded
      ? CesiumLib.Color.fromCssColorString("#f97316").withAlpha(0.52)
      : CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.34);
    const outlineColor = building.flooded
      ? CesiumLib.Color.fromCssColorString("#fde68a").withAlpha(0.95)
      : CesiumLib.Color.fromCssColorString("#7dd3fc").withAlpha(0.72);
    const hierarchyPositions = building.footprint.flatMap(([pointLon, pointLat]) => [pointLon, pointLat]);

    const entity = viewer.entities.add({
      name: building.flooded ? `${building.settlement || ""}河岸淹水影響建物` : `${building.settlement || ""}真實建物`,
      position: CesiumLib.Cartesian3.fromDegrees(lon, lat, baseHeight + building.height + 18),
      polygon: {
        hierarchy: CesiumLib.Cartesian3.fromDegreesArray(hierarchyPositions),
        height: baseHeight,
        extrudedHeight: baseHeight + building.height,
        material: color,
        outline: true,
        outlineColor
      },
      show: communityToggle.checked
    });
    buildingEntities.push(entity);
    buildingMetadata.push({
      entity,
      lon,
      lat,
      terrainBaseHeight: baseHeight,
      buildingHeight: building.height
    });
  });
  addFloodWaterLayer();
  updateCommunityBuildingHeights(placementHeight(currentPlacement.groundHeight));
}

async function loadRealCommunityBuildings() {
  try {
    const response = await fetch(REAL_BUILDINGS_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const buildings = data.features
      .map((feature, index) => {
        const footprint = feature.geometry?.coordinates?.[0];
        if (!footprint?.length) return null;
        const center = centroidOf(footprint);
        const height = Number(feature.properties?.height || 14);
        return {
          footprint,
          height,
          source: "real-building",
          flooded: feature.properties?.risk === "high" && (distanceToRiverAxis(center[0], center[1]) < 0.0016 || index % 9 === 0),
          settlement: feature.properties?.settlement || "荖濃溪上游"
        };
      })
      .filter(Boolean);
    if (buildings.length) return buildings;
  } catch (error) {
    console.warn("Real Fuxing buildings load failed, fallback to simulated buildings", error);
  }
  return createRiverCommunityBuildings().map((building) => ({
    footprint: rectangleFootprint(building),
    height: building.height,
    source: "river-demo",
    flooded: building.flooded,
    settlement: building.settlement
  }));
}

function updateCommunityBuildingHeights(platformHeight) {
  if (!buildingMetadata.length) return;
  buildingMetadata.forEach(({ entity, lon, lat, terrainBaseHeight, buildingHeight }) => {
    const baseHeight = skyIslandToggle.checked ? platformHeight + 10 : terrainBaseHeight;
    entity.position = CesiumLib.Cartesian3.fromDegrees(lon, lat, baseHeight + buildingHeight + 18);
    entity.polygon.height = baseHeight;
    entity.polygon.extrudedHeight = baseHeight + buildingHeight;
    if (entity.label) {
      entity.label.show = communityToggle.checked && skyIslandToggle.checked;
    }
  });
  updateFloodWaterHeights(platformHeight);
  updateBasinBoundaryHeights(platformHeight);
}

async function addBasinBoundary() {
  if (basinEntities.length) {
    updateBasinBoundaryHeights(placementHeight(currentPlacement.groundHeight));
    return;
  }
  try {
    const response = await fetch(BASIN_BOUNDARY_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const feature = data.features?.[0];
    const rings = feature?.geometry?.coordinates;
    if (!rings?.length) return;
    const outerRing = rings[0];
    basinBoundaryRing = outerRing;
    basinEntities.push(viewer.entities.add({
      name: "真實流域範圍",
      polygon: {
        hierarchy: CesiumLib.Cartesian3.fromDegreesArray(outerRing.flatMap(([lon, lat]) => [lon, lat])),
        clampToGround: true,
        material: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.075),
        outline: true,
        outlineColor: CesiumLib.Color.fromCssColorString("#bae6fd").withAlpha(0.82)
      },
      show: communityToggle.checked
    }));
    basinEntities.push(viewer.entities.add({
      name: "真實流域邊界線",
      polyline: {
        positions: CesiumLib.Cartesian3.fromDegreesArray(outerRing.flatMap(([lon, lat]) => [lon, lat])),
        width: 3,
        material: new CesiumLib.PolylineGlowMaterialProperty({
          glowPower: 0.18,
          taperPower: 0.65,
          color: CesiumLib.Color.fromCssColorString("#7dd3fc").withAlpha(0.92)
        }),
        clampToGround: true
      },
      show: communityToggle.checked
    }));
  } catch (error) {
    console.warn("Basin boundary load failed", error);
  }
}

function updateBasinBoundaryHeights(platformHeight) {
  if (!basinEntities.length) return;
  if (basinEntities[1].polyline && basinBoundaryRing.length) {
    basinEntities[1].polyline.positions = CesiumLib.Cartesian3.fromDegreesArray(basinBoundaryRing.flatMap(([lon, lat]) => [lon, lat]));
  }
  basinEntities.forEach((entity) => {
    entity.show = communityToggle.checked;
  });
}

async function loadRealRiverFlowline() {
  try {
    const response = await fetch(REAL_RIVER_FLOWLINE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const coordinates = data.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(coordinates) && coordinates.length > 2) {
      activeRiverAxis = coordinates;
      updateFloodWaterHeights(placementHeight(currentPlacement.groundHeight));
    }
  } catch (error) {
    console.warn("Real Laonong river flowline load failed, fallback to settlement axis", error);
    activeRiverAxis = FUXING_RIVER_AXIS;
  }
}

function createRiverCommunityBuildings() {
  const buildings = [];
  UPPER_SETTLEMENT_ISLANDS.forEach((settlement, settlementIndex) => {
    const previous = UPPER_SETTLEMENT_ISLANDS[Math.max(0, settlementIndex - 1)];
    const next = UPPER_SETTLEMENT_ISLANDS[Math.min(UPPER_SETTLEMENT_ISLANDS.length - 1, settlementIndex + 1)];
    const riverAngle = bearingDegrees(previous.lon, previous.lat, next.lon, next.lat);
    const count = settlement.risk === "high" ? 18 : settlement.risk === "medium" ? 15 : 12;
    for (let index = 0; index < count; index += 1) {
      const along = (index - (count - 1) / 2) * 58;
      const row = index % 3;
      const side = row === 0 ? -1 : 1;
      const cross = side * (72 + row * 48 + (index % 2) * 18);
      const riverPoint = offsetPoint(
        settlement.lon,
        settlement.lat,
        riverAngle,
        along
      );
      const offset = offsetPoint(riverPoint.lon, riverPoint.lat, riverAngle + 90, cross);
      buildings.push({
        lon: offset.lon,
        lat: offset.lat,
        angle: riverAngle + (side > 0 ? 6 : -6),
        width: 26 + (index % 4) * 6,
        depth: 18 + (index % 3) * 5,
        height: 11 + (index % 5) * 4,
        flooded: Math.abs(cross) <= 132 && settlement.risk !== "low",
        settlement: settlement.name
      });
    }
  });
  return buildings;
}

function addFloodWaterLayer() {
  if (floodEntities.length) return;
  floodEntities.push(viewer.entities.add({
    name: "天空島河道水面",
    polyline: {
      positions: CesiumLib.Cartesian3.fromDegreesArrayHeights(flattenRiverHeights(placementHeight(currentPlacement.groundHeight) + 14)),
      width: 24,
      material: new CesiumLib.PolylineGlowMaterialProperty({
        glowPower: 0.24,
        taperPower: 0.65,
        color: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.84)
      })
    },
    show: communityToggle.checked
  }));
  floodEntities.push(viewer.entities.add({
    name: "天空島河道漫溢示意",
    polygon: {
      hierarchy: CesiumLib.Cartesian3.fromDegreesArray(floodRibbonFootprint(260)),
      height: placementHeight(currentPlacement.groundHeight) + 12,
      material: CesiumLib.Color.fromCssColorString("#60a5fa").withAlpha(0.28),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#bae6fd").withAlpha(0.62)
    },
    show: communityToggle.checked
  }));
}

function updateFloodWaterHeights(platformHeight) {
  if (!floodEntities.length) return;
  floodEntities[0].polyline.positions = CesiumLib.Cartesian3.fromDegreesArrayHeights(flattenRiverHeights(platformHeight + 14));
  floodEntities[1].polygon.height = platformHeight + 12;
  floodEntities.forEach((entity) => {
    entity.show = communityToggle.checked && skyIslandToggle.checked;
  });
}

function flattenRiverHeights(height) {
  return activeRiverAxis.flatMap(([lon, lat]) => [lon, lat, height]);
}

function floodRibbonFootprint(widthMeters) {
  const left = [];
  const right = [];
  activeRiverAxis.forEach(([lon, lat], index) => {
    const previous = activeRiverAxis[Math.max(0, index - 1)];
    const next = activeRiverAxis[Math.min(activeRiverAxis.length - 1, index + 1)];
    const angle = bearingDegrees(previous[0], previous[1], next[0], next[1]);
    const halfWidth = widthMeters / 2 + (index % 2) * 18;
    const leftPoint = offsetPoint(lon, lat, angle + 90, halfWidth);
    const rightPoint = offsetPoint(lon, lat, angle - 90, halfWidth);
    left.push([leftPoint.lon, leftPoint.lat]);
    right.unshift([rightPoint.lon, rightPoint.lat]);
  });
  return [...left, ...right].flatMap(([lon, lat]) => [lon, lat]);
}

function distanceToRiverAxis(lon, lat) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < activeRiverAxis.length - 1; index += 1) {
    const [startLon, startLat] = activeRiverAxis[index];
    const [endLon, endLat] = activeRiverAxis[index + 1];
    const dx = endLon - startLon;
    const dy = endLat - startLat;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((lon - startLon) * dx + (lat - startLat) * dy) / lengthSquared));
    const projectedLon = startLon + t * dx;
    const projectedLat = startLat + t * dy;
    const distance = Math.hypot(lon - projectedLon, lat - projectedLat);
    minimum = Math.min(minimum, distance);
  }
  return minimum;
}

function rectangleFootprint({ lon, lat, angle, width, depth }) {
  const radians = CesiumLib.Math.toRadians(angle);
  const metersPerLat = 111320;
  const metersPerLon = 111320 * Math.cos(CesiumLib.Math.toRadians(lat));
  const corners = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2]
  ];
  return corners.map(([x, y]) => {
    const rotatedX = x * Math.cos(radians) - y * Math.sin(radians);
    const rotatedY = x * Math.sin(radians) + y * Math.cos(radians);
    return [
      lon + rotatedX / metersPerLon,
      lat + rotatedY / metersPerLat
    ];
  });
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

function centroidOf(footprint) {
  const total = footprint.reduce((sum, [lon, lat]) => {
    sum.lon += lon;
    sum.lat += lat;
    return sum;
  }, { lon: 0, lat: 0 });
  return [total.lon / footprint.length, total.lat / footprint.length];
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

function setupFuxingMobilePanels() {
  const closePanels = () => {
    mobilePanelTargets.forEach((panel) => panel.classList.remove("is-mobile-open"));
    mobileDockButtons.forEach((button) => button.classList.remove("is-active"));
  };

  mobileDockButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetName = button.dataset.fuxingPanel;
      const target = document.querySelector(`[data-fuxing-panel-target="${targetName}"]`);
      const shouldOpen = target && !target.classList.contains("is-mobile-open");
      closePanels();
      if (shouldOpen) {
        target.classList.add("is-mobile-open");
        button.classList.add("is-active");
      }
    });
  });

  const syncPanels = () => {
    closePanels();
  };

  if (mobilePanelQuery.addEventListener) {
    mobilePanelQuery.addEventListener("change", syncPanels);
  } else {
    mobilePanelQuery.addListener(syncPanels);
  }
  syncPanels();
}
