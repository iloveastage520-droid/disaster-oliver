const CesiumLib = window.Cesium;

if (!CesiumLib) {
  showError("CesiumJS 載入失敗，請確認瀏覽器可以連到 cdnjs.cloudflare.com。");
  throw new Error("CesiumJS is not available.");
}

CesiumLib.Ion.defaultAccessToken = "";

const BUILDINGS_URL = "../../data/wulai/wulai-old-street-buildings.geojson";
const RIVER_URL = "../../data/wulai/wulai-real-river.geojson";
const MODEL_URL = "../../assets/models/wulai/nanshi-river-wulai.glb";
const TILESET_URL = "../../assets/tiles/wulai-uav/tileset.json";
const ISLAND_CENTER = { lon: 121.549, lat: 24.859 };
const ISLAND_HEIGHT = 980;
const ISLAND_ROTATION = CesiumLib.Math.toRadians(32);
const ISLAND_MAJOR_AXIS = 3400;
const ISLAND_MINOR_AXIS = 2200;
const ISLAND_BASE_COLOR = "#8aa58d";
const ISLAND_WATER_COLOR = "#c7dbe3";
const ISLAND_DEEP_WATER_COLOR = "#6fa6b7";
const ISLAND_HIGHLIGHT_COLOR = "#f8fbff";
const PRESENTATION_STAGE_ONLY = true;
const WULAI_WATER_FRAME_BASE = "../../assets/wbchen-water/nswl";
const WULAI_WATER_BOUNDS = {
  north: 24.87446389,
  south: 24.84534722,
  east: 121.5740111,
  west: 121.5449556
};
const MODEL_SCALE = 4;
const MODEL_LOCAL_MIN_Z = 115.2459945678711;
const MODEL_HEIGHT = ISLAND_HEIGHT + 42 - MODEL_LOCAL_MIN_Z * MODEL_SCALE;
const VIEW_MODES = {
  real: {
    buildings: false,
    river: true,
    model: true,
    buildingAlpha: 0.08,
    riskAlpha: 0.16,
    islandAlpha: 0.025
  },
  hybrid: {
    buildings: true,
    river: true,
    model: true,
    buildingAlpha: 0.12,
    riskAlpha: 0.24,
    islandAlpha: 0.14
  },
  analysis: {
    buildings: true,
    river: true,
    model: false,
    buildingAlpha: 0.24,
    riskAlpha: 0.52,
    islandAlpha: 0.18
  }
};
const WULAI_RIVER_AXIS = [
  [121.5424, 24.8512],
  [121.5435, 24.8525],
  [121.5448, 24.8540],
  [121.5460, 24.8554],
  [121.5472, 24.8568],
  [121.5484, 24.8582],
  [121.5490, 24.8596],
  [121.5486, 24.8608],
  [121.5473, 24.8617],
  [121.5457, 24.8619],
  [121.5441, 24.8614],
  [121.5429, 24.8604],
  [121.5421, 24.8590],
  [121.5413, 24.8576],
  [121.5402, 24.8563],
  [121.5388, 24.8551],
  [121.5374, 24.8540],
  [121.5362, 24.8528],
  [121.5355, 24.8515]
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
if (!PRESENTATION_STAGE_ONLY) {
  viewer.imageryLayers.addImageryProvider(new CesiumLib.UrlTemplateImageryProvider({
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    credit: "Google hybrid satellite",
    maximumLevel: 19
  }));
}

viewer.scene.backgroundColor = CesiumLib.Color.fromCssColorString("#07111f");
viewer.scene.globe.depthTestAgainstTerrain = false;
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.baseColor = CesiumLib.Color.fromCssColorString("#102033");
viewer.scene.globe.show = !PRESENTATION_STAGE_ONLY;
viewer.scene.fog.enabled = true;
viewer.scene.fog.density = 0.00042;
viewer.scene.fog.minimumBrightness = 0.08;
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
  uav: {
    destination: CesiumLib.Cartesian3.fromDegrees(121.549, 24.859, 1540),
    orientation: {
      heading: CesiumLib.Math.toRadians(18),
      pitch: CesiumLib.Math.toRadians(-58),
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
const buildingMetadata = [];
const floodSleeveEntities = [];
const riverEntities = [];
const riverFlowEntities = [];
const riverMirrorEntities = [];
const riverSurfaceEntities = [];
const riverEdgeEntities = [];
const riverVisibleEntities = [];
const islandEntities = [];
const radarEntities = [];
const radarCellMetadata = [];
const modelHelperEntities = [];
const wbchenWulaiWaterEntities = [];
let riverCenterline = [];
let riverPolygonRings = [];
let modelPrimitive = null;
let modelReady = false;
let currentViewMode = "hybrid";
let radarAnimationTime = 0;
let wbchenWulaiWaterFrame = 1;
let lastWbchenWulaiWaterUpdate = 0;
let lastBuildingRadarUpdate = 0;
let riverLayerAdded = false;
const buildingToggle = document.querySelector("#building-toggle");
const modelToggle = document.querySelector("#model-toggle");
const riverToggle = document.querySelector("#river-toggle");
const radarToggle = document.querySelector("#radar-toggle");
const controlPanel = document.querySelector("[data-wulai-control-panel]");
const panelToggleButtons = document.querySelectorAll("[data-panel-toggle]");
const mobileDockButtons = document.querySelectorAll("[data-wulai-panel]");
const mobilePanelTargets = document.querySelectorAll("[data-wulai-panel-target]");
const mobilePanelQuery = window.matchMedia("(max-width: 760px)");

if (riverToggle) {
  riverToggle.checked = true;
}

document.querySelectorAll("[data-camera]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.dataset.camera === "uav") {
      setViewMode("real");
      toggleControlPanel(false);
      if (modelReady && modelPrimitive?.boundingSphere) {
        viewer.camera.flyToBoundingSphere(modelPrimitive.boundingSphere, {
          duration: 1,
          offset: new CesiumLib.HeadingPitchRange(
            CesiumLib.Math.toRadians(18),
            CesiumLib.Math.toRadians(-46),
            Math.max(modelPrimitive.boundingSphere.radius * 2.8, 760)
          )
        });
        return;
      }
    }
    viewer.camera.flyTo({
      ...cameraViews[button.dataset.camera],
      duration: 1
    });
  });
});

document.querySelectorAll("[data-view-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    setViewMode(button.dataset.viewMode);
  });
});

buildingToggle.addEventListener("change", () => {
  applyLayerVisibility();
});

modelToggle.addEventListener("change", () => {
  applyLayerVisibility();
});

riverToggle.addEventListener("change", () => {
  applyLayerVisibility();
});

if (radarToggle) {
  radarToggle.addEventListener("change", () => {
    applyLayerVisibility();
  });
}

panelToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    toggleControlPanel();
  });
});

viewer.camera.setView(cameraViews.overview);
setupMobilePanels();
addSkyIsland();
addWbchenWulaiWaterLayer();
addUavModel();
setupRiverAndBuildings();
setViewMode("hybrid");
viewer.clock.onTick.addEventListener(animateRiverFlow);
setTimeout(checkCanvas, 2200);

async function addUavModel() {
  setModelStatus("3D Tiles 解析中");
  try {
    modelPrimitive = await CesiumLib.Cesium3DTileset.fromUrl(TILESET_URL, {
      maximumScreenSpaceError: 1,
      dynamicScreenSpaceError: true,
      showCreditsOnScreen: false
    });
    modelPrimitive.show = modelToggle.checked && VIEW_MODES[currentViewMode].model;
    viewer.scene.primitives.add(modelPrimitive);
    modelReady = true;
    setModelStatus(`3D Tiles 已加入 / 半徑 ${Math.round(modelPrimitive.boundingSphere.radius)}m`);
  } catch (error) {
    console.warn("UAV 3D Tiles render failed", error);
    setModelStatus("3D Tiles 失敗");
    showError("南勢溪 UAV 3D Tiles 測試失敗。這個測試包仍是單一 258MB tile，正式版需要切片與 LOD。");
  }

  modelHelperEntities.push(viewer.entities.add({
    name: "UAV 模型位置提示",
    position: CesiumLib.Cartesian3.fromDegrees(ISLAND_CENTER.lon, ISLAND_CENTER.lat, ISLAND_HEIGHT + 36),
    ellipse: {
      semiMajorAxis: 1550,
      semiMinorAxis: 1120,
      height: ISLAND_HEIGHT + 36,
      material: CesiumLib.Color.fromCssColorString("#f8fafc").withAlpha(0.045),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#f8fafc").withAlpha(0.42),
      rotation: ISLAND_ROTATION
    }
  }));
}

async function setupRiverAndBuildings() {
  await loadRiverGeometry();
  await loadBuildings();
}

async function loadRiverGeometry() {
  try {
    const response = await fetch(RIVER_URL);
    const data = await response.json();
    const centerFeature = data.features.find((feature) => feature.properties?.kind === "river_centerline");
    const polygonFeature = data.features.find((feature) => feature.properties?.kind === "river_polygon");
    riverCenterline = centerFeature?.geometry?.coordinates || WULAI_RIVER_AXIS;
    riverPolygonRings = flattenPolygonRings(polygonFeature?.geometry);
    setRiverStatus(`真實河道 ${riverPolygonRings.length} 面 / 中心線 ${riverCenterline.length} 點`);
  } catch (error) {
    console.warn("Wulai real river load failed", error);
    riverCenterline = WULAI_RIVER_AXIS;
    riverPolygonRings = [];
    setRiverStatus("真實河道失敗");
  }
}

async function loadBuildings() {
  const status = document.querySelector("#building-status");
  try {
    const response = await fetch(BUILDINGS_URL);
    const data = await response.json();
    data.features.forEach((feature, index) => {
      const ring = feature.geometry.coordinates[0];
      const height = Number(feature.properties.height || 18);
      const centroid = centroidOf(ring);
      const riverDistance = distanceToRiver(centroid);
      const isRisk = riverDistance < 0.00115;
      const originalName = "烏來 F_BUILD 建物";
      const entity = viewer.entities.add({
        name: originalName,
        polygon: {
          hierarchy: CesiumLib.Cartesian3.fromDegreesArray(ring.flatMap(([lon, lat]) => [lon, lat])),
          height: ISLAND_HEIGHT + 10,
          extrudedHeight: ISLAND_HEIGHT + 10 + height,
          material: buildingMaterial(isRisk),
          outline: true,
          outlineColor: CesiumLib.Color.fromCssColorString("#cbd5e1").withAlpha(0.84)
        },
        show: buildingToggle.checked
      });
      buildingEntities.push(entity);
      buildingMetadata.push({ entity, isRisk, riverDistance, centroid, originalName, ring, height });
    });
    status.textContent = `${data.features.length} 棟`;
    addBuildingClusterBase(data.features);
    applyLayerVisibility();
  } catch (error) {
    console.warn("Wulai buildings load failed", error);
    status.textContent = "載入失敗";
    showError("烏來建物資料載入失敗。");
  }
}

function addFloodPathFromAffectedBuildings() {
  const affected = buildingMetadata.filter((metadata) => metadata.riverDistance < 0.00145);
  const sourceLine = riverCenterline.length ? riverCenterline : WULAI_RIVER_AXIS;
  const path = densifyLine(sourceLine, 44);
  if (path.length < 2) return;

  path.forEach(([lon, lat], index) => {
    const disk = viewer.entities.add({
      name: "真實南勢溪水線圓盤",
      position: CesiumLib.Cartesian3.fromDegrees(lon, lat, ISLAND_HEIGHT + 11.2 + index * 0.02),
      cylinder: {
        length: 2.2,
        topRadius: index % 4 === 0 ? 66 : 54,
        bottomRadius: index % 4 === 0 ? 66 : 54,
        material: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.42),
        outline: true,
        outlineColor: CesiumLib.Color.fromCssColorString("#e0f2fe").withAlpha(0.76)
      },
      show: true
    });
    const shine = viewer.entities.add({
      name: "真實南勢溪水線反光圓盤",
      position: CesiumLib.Cartesian3.fromDegrees(lon, lat, ISLAND_HEIGHT + 12.5 + index * 0.02),
      cylinder: {
        length: 1.2,
        topRadius: index % 4 === 0 ? 26 : 20,
        bottomRadius: index % 4 === 0 ? 26 : 20,
        material: CesiumLib.Color.fromCssColorString("#f8fbff").withAlpha(0.24),
        outline: false
      },
      show: true
    });
    riverEntities.push(disk, shine);
  });
  setRiverStatus(`真實水線 ${path.length} 點 / 受淹 ${affected.length} 棟`);
}

function densifyLine(line, targetCount) {
  if (line.length <= 1) return line;
  return Array.from({ length: targetCount }, (_, index) => {
    const point = pointAlongLine(line, index / Math.max(1, targetCount - 1));
    return [point.lon, point.lat];
  });
}

function addBuildingFloodSleeves() {
  buildingMetadata
    .filter((metadata) => metadata.riverDistance < 0.00145)
    .slice(0, 260)
    .forEach((metadata) => {
      const sleeveHeight = Math.min(Math.max(metadata.height * 0.32, 5), 13);
      const entity = viewer.entities.add({
        name: "河道漫淹建物底部",
        polygon: {
          hierarchy: CesiumLib.Cartesian3.fromDegreesArray(metadata.ring.flatMap(([lon, lat]) => [lon, lat])),
          height: ISLAND_HEIGHT + 10.25,
          extrudedHeight: ISLAND_HEIGHT + 10.25 + sleeveHeight,
          material: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.48),
          outline: true,
          outlineColor: CesiumLib.Color.fromCssColorString("#e0f2fe").withAlpha(0.92)
        },
        show: riverToggle?.checked ?? true
      });
      floodSleeveEntities.push(entity);
      riverEntities.push(entity);
    });
}

function addBuildingClusterBase(features) {
  const coordinates = features.flatMap((feature) => feature.geometry.coordinates[0]);
  if (!coordinates.length) return;
  const bounds = coordinates.reduce((box, [lon, lat]) => ({
    minLon: Math.min(box.minLon, lon),
    maxLon: Math.max(box.maxLon, lon),
    minLat: Math.min(box.minLat, lat),
    maxLat: Math.max(box.maxLat, lat)
  }), {
    minLon: Infinity,
    maxLon: -Infinity,
    minLat: Infinity,
    maxLat: -Infinity
  });
  const centerLon = (bounds.minLon + bounds.maxLon) * 0.5;
  const centerLat = (bounds.minLat + bounds.maxLat) * 0.5;
  const widthMeters = Math.max(520, approximateDistanceMeters([bounds.minLon, centerLat], [bounds.maxLon, centerLat]));
  const heightMeters = Math.max(420, approximateDistanceMeters([centerLon, bounds.minLat], [centerLon, bounds.maxLat]));
  const clusterMajor = Math.max(widthMeters, heightMeters);
  const clusterMinor = Math.min(widthMeters, heightMeters);

  islandEntities.push(viewer.entities.add({
    name: "F_BUILD 建物群圓形底",
    position: CesiumLib.Cartesian3.fromDegrees(centerLon, centerLat, ISLAND_HEIGHT + 9.7),
    ellipse: {
      semiMajorAxis: clusterMajor * 0.62,
      semiMinorAxis: clusterMinor * 0.62,
      height: ISLAND_HEIGHT + 9.7,
      material: CesiumLib.Color.fromCssColorString("#f8fafc").withAlpha(0.38),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#f8fbff").withAlpha(0.92),
      rotation: ISLAND_ROTATION
    }
  }));
  islandEntities.push(viewer.entities.add({
    name: "F_BUILD 建物群淡藍內底",
    position: CesiumLib.Cartesian3.fromDegrees(centerLon, centerLat, ISLAND_HEIGHT + 9.9),
    ellipse: {
      semiMajorAxis: clusterMajor * 0.46,
      semiMinorAxis: clusterMinor * 0.46,
      height: ISLAND_HEIGHT + 9.9,
      material: CesiumLib.Color.fromCssColorString("#bae6fd").withAlpha(0.24),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#e0f2fe").withAlpha(0.74),
      rotation: ISLAND_ROTATION
    }
  }));
}

function addBuildingBasePuddles() {
  buildingMetadata
    .filter((metadata) => metadata.riverDistance < 0.00145)
    .slice(0, 220)
    .forEach((metadata, index) => {
      const sizeSeed = (index % 7) / 7;
      const waterColor = index % 3 === 0 ? "#f8fbff" : "#93c5fd";
      const waterAlpha = index % 3 === 0 ? 0.46 : 0.42;
      const entity = viewer.entities.add({
        name: "建物底部積水",
        position: CesiumLib.Cartesian3.fromDegrees(metadata.centroid[0], metadata.centroid[1], ISLAND_HEIGHT + 10.8),
        ellipse: {
          semiMajorAxis: 34 + sizeSeed * 34,
          semiMinorAxis: 14 + sizeSeed * 16,
          height: ISLAND_HEIGHT + 10.8,
          material: CesiumLib.Color.fromCssColorString(waterColor).withAlpha(waterAlpha),
          outline: true,
          outlineColor: CesiumLib.Color.fromCssColorString("#eff6ff").withAlpha(0.58),
          rotation: ISLAND_ROTATION + CesiumLib.Math.toRadians((index % 9) * 13)
        }
      });
      entity.wulaiWaterSurface = {
        color: waterColor,
        alpha: waterAlpha,
        phase: index * 0.37
      };
      islandEntities.push(entity);
      riverEntities.push(entity);
    });
}

function addFloodRiver() {
  if (riverLayerAdded) return;
  riverLayerAdded = true;
  if (riverPolygonRings.length) {
    riverPolygonRings.forEach((ring, index) => {
      const surfaceEntity = viewer.entities.add({
        name: "南勢溪真實河道鏡面水",
        polygon: {
          hierarchy: CesiumLib.Cartesian3.fromDegreesArray(ring.flatMap(([lon, lat]) => [lon, lat])),
          height: ISLAND_HEIGHT + 80 + index * 0.12,
          material: CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.82),
          outline: true,
          outlineColor: CesiumLib.Color.fromCssColorString("#f8fbff").withAlpha(0.92)
        }
      });
      surfaceEntity.wulaiRiverSurface = { alpha: 0.82, baseHeight: ISLAND_HEIGHT + 80 + index * 0.12, phase: index * 1.15 };
      riverEntities.push(surfaceEntity);
      riverSurfaceEntities.push(surfaceEntity);
      const reflectionEntity = viewer.entities.add({
        name: "南勢溪真實河道鏡面反射",
        polygon: {
          hierarchy: CesiumLib.Cartesian3.fromDegreesArray(ring.flatMap(([lon, lat]) => [lon, lat])),
          height: ISLAND_HEIGHT + 81 + index * 0.12,
          material: CesiumLib.Color.fromCssColorString("#f8fbff").withAlpha(0.30),
          outline: false
        }
      });
      reflectionEntity.wulaiMirrorSurface = { alpha: 0.30, phase: index * 1.4 };
      riverEntities.push(reflectionEntity);
      riverMirrorEntities.push(reflectionEntity);
      const edgeEntity = viewer.entities.add({
        name: "南勢溪真實河道反光",
        polyline: {
          positions: CesiumLib.Cartesian3.fromDegreesArrayHeights(ring.map(([lon, lat]) => [lon, lat, ISLAND_HEIGHT + 82]).flat()),
          width: 7,
          material: CesiumLib.Color.fromCssColorString("#f8fbff").withAlpha(0.86),
          clampToGround: false
        }
      });
      edgeEntity.wulaiRiverEdge = { alpha: 0.86, phase: index * 1.7 };
      riverEntities.push(edgeEntity);
      riverEdgeEntities.push(edgeEntity);
    });
  } else {
    riverEntities.push(viewer.entities.add({
      name: "南勢溪河岸鏡面水",
      polygon: {
        hierarchy: CesiumLib.Cartesian3.fromDegreesArray(floodRibbonFootprint(720)),
        height: ISLAND_HEIGHT + 12.2,
        material: CesiumLib.Color.fromCssColorString("#8dd7ff").withAlpha(0.72),
        outline: true,
        outlineColor: CesiumLib.Color.fromCssColorString("#f8fbff").withAlpha(0.86)
      }
    }));
  }
  if (!riverPolygonRings.length) {
    riverEntities.push(viewer.entities.add({
      name: "南勢溪漫溢示意",
      polygon: {
        hierarchy: CesiumLib.Cartesian3.fromDegreesArray(floodRibbonFootprint(170)),
        height: ISLAND_HEIGHT + 18,
        material: CesiumLib.Color.fromCssColorString("#60a5fa").withAlpha(0.20),
        outline: true,
        outlineColor: CesiumLib.Color.fromCssColorString("#bae6fd").withAlpha(0.62)
      }
    }));
  }
  setRiverStatus(riverPolygonRings.length ? `已顯示 ${riverPolygonRings.length} 面 / 線 ${riverCenterline.length} 點` : "使用示意河道");
  applyLayerVisibility();
}

function addRiverFlowHighlights(line) {
  if (!line.length) return;
  for (let index = 0; index < 7; index += 1) {
    const entity = viewer.entities.add({
      name: "南勢溪流動光帶",
      polyline: {
        positions: CesiumLib.Cartesian3.fromDegreesArrayHeights(riverFlowSegment(line, index / 4, ISLAND_HEIGHT + 13.8)),
        width: index % 3 === 0 ? 6 : 4,
        material: new CesiumLib.PolylineGlowMaterialProperty({
          glowPower: 0.42,
          taperPower: 0.9,
          color: CesiumLib.Color.fromCssColorString(index % 2 === 0 ? "#f8fbff" : "#93c5fd").withAlpha(0.88)
        }),
        clampToGround: false
      }
    });
    entity.wulaiRiverFlow = { offset: index / 7, color: index % 2 === 0 ? "#f8fbff" : "#93c5fd" };
    riverEntities.push(entity);
    riverFlowEntities.push(entity);
  }
}

function addSkyIsland() {
  islandEntities.push(viewer.entities.add({
    name: "烏來天空島平台",
    position: CesiumLib.Cartesian3.fromDegrees(ISLAND_CENTER.lon, ISLAND_CENTER.lat, ISLAND_HEIGHT),
    ellipse: {
      semiMajorAxis: ISLAND_MAJOR_AXIS,
      semiMinorAxis: ISLAND_MINOR_AXIS,
      height: ISLAND_HEIGHT,
      material: CesiumLib.Color.fromCssColorString(ISLAND_BASE_COLOR).withAlpha(0.0),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString(ISLAND_HIGHLIGHT_COLOR).withAlpha(0.18),
      rotation: ISLAND_ROTATION
    }
  }));
  islandEntities.push(viewer.entities.add({
    name: "建物承載圓形底",
    position: CesiumLib.Cartesian3.fromDegrees(ISLAND_CENTER.lon, ISLAND_CENTER.lat, ISLAND_HEIGHT + 8.6),
    ellipse: {
      semiMajorAxis: 1820,
      semiMinorAxis: 1260,
      height: ISLAND_HEIGHT + 8.6,
      material: CesiumLib.Color.fromCssColorString("#f8fafc").withAlpha(0.0),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#e0f2fe").withAlpha(0.0),
      rotation: ISLAND_ROTATION
    }
  }));
  islandEntities.push(viewer.entities.add({
    name: "建物底盤內圈",
    position: CesiumLib.Cartesian3.fromDegrees(ISLAND_CENTER.lon, ISLAND_CENTER.lat, ISLAND_HEIGHT + 8.9),
    ellipse: {
      semiMajorAxis: 1280,
      semiMinorAxis: 860,
      height: ISLAND_HEIGHT + 8.9,
      material: CesiumLib.Color.fromCssColorString("#dbeafe").withAlpha(0.0),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#f8fbff").withAlpha(0.0),
      rotation: ISLAND_ROTATION
    }
  }));
  islandEntities.push(viewer.entities.add({
    name: "烏來天空島地面投影",
    position: CesiumLib.Cartesian3.fromDegrees(ISLAND_CENTER.lon, ISLAND_CENTER.lat, 26),
    ellipse: {
      semiMajorAxis: 2480,
      semiMinorAxis: 1550,
      height: 26,
      material: CesiumLib.Color.BLACK.withAlpha(0.18),
      outline: false,
      rotation: ISLAND_ROTATION
    }
  }));
}

function addIslandWaterSurfaceDetails() {
  [
    {
      name: "島面淹水主區",
      color: "#dbeafe",
      alpha: 0.56,
      phase: 0.4,
      points: [[-1720, 210], [-1510, 470], [-1140, 520], [-920, 420], [-700, 500], [-420, 360], [-160, 410], [180, 250], [500, 310], [850, 170], [1250, 230], [1540, 50], [1390, -170], [1020, -120], [760, -270], [390, -230], [90, -340], [-240, -260], [-530, -410], [-850, -310], [-1110, -430], [-1430, -250], [-1620, -40]]
    },
    {
      name: "島面深水帶",
      color: "#93c5fd",
      alpha: 0.46,
      phase: 1.8,
      points: [[-1320, -90], [-1060, 40], [-750, -10], [-440, 90], [-140, 20], [180, 110], [520, 20], [790, 120], [1030, 30], [920, -130], [620, -110], [350, -190], [40, -120], [-280, -220], [-590, -140], [-910, -230], [-1210, -170]]
    },
    {
      name: "聚落旁積水",
      color: "#dbeafe",
      alpha: 0.50,
      phase: 2.9,
      points: [[-1540, 680], [-1300, 830], [-980, 780], [-760, 620], [-830, 450], [-1120, 370], [-1420, 460]]
    },
    {
      name: "低窪淺水",
      color: "#bfdbfe",
      alpha: 0.42,
      phase: 4.1,
      points: [[350, -620], [620, -470], [940, -520], [1230, -360], [1430, -520], [1230, -720], [880, -790], [560, -760]]
    }
  ].forEach((water, index) => {
    const entity = viewer.entities.add({
      name: water.name,
      polygon: {
        hierarchy: CesiumLib.Cartesian3.fromDegreesArray(islandWaterFootprint(water.points)),
        height: ISLAND_HEIGHT + 11.2 + index * 0.12,
        material: CesiumLib.Color.fromCssColorString(water.color).withAlpha(water.alpha),
        outline: true,
        outlineColor: CesiumLib.Color.fromCssColorString(ISLAND_HIGHLIGHT_COLOR).withAlpha(0.46)
      }
    });
    entity.wulaiWaterSurface = {
      color: water.color,
      alpha: water.alpha,
      phase: water.phase
    };
    islandEntities.push(entity);
  });

  [
    [[-1420, 330], [-1160, 380], [-940, 350], [-720, 410]],
    [[-260, 180], [20, 210], [290, 160], [620, 190]],
    [[740, -120], [960, -70], [1180, -120]],
    [[-880, -210], [-610, -160], [-360, -210]]
  ].forEach((line, index) => {
    const entity = viewer.entities.add({
      name: "積水反光線",
      polyline: {
        positions: CesiumLib.Cartesian3.fromDegreesArrayHeights(islandWaterLine(line, ISLAND_HEIGHT + 10.65 + index * 0.08)),
        width: 2.4,
        material: CesiumLib.Color.fromCssColorString(ISLAND_HIGHLIGHT_COLOR).withAlpha(0.62),
        clampToGround: false
      }
    });
    entity.wulaiWaterHighlight = { alpha: 0.62, phase: index * 1.2 };
    islandEntities.push(entity);
  });
}

function addWbchenWulaiWaterLayer() {
  const rectangle = CesiumLib.Rectangle.fromDegrees(
    WULAI_WATER_BOUNDS.west,
    WULAI_WATER_BOUNDS.south,
    WULAI_WATER_BOUNDS.east,
    WULAI_WATER_BOUNDS.north
  );
  const entity = viewer.entities.add({
    name: "nswl 烏來水資料預報",
    rectangle: {
      coordinates: rectangle,
      height: ISLAND_HEIGHT + 16.8,
      material: new CesiumLib.ImageMaterialProperty({
        image: `${WULAI_WATER_FRAME_BASE}/Frame_1.png`,
        transparent: true,
        color: CesiumLib.Color.WHITE.withAlpha(0.82)
      }),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#bae6fd").withAlpha(0.68),
      rotation: 0
    },
    show: riverToggle?.checked ?? true
  });
  wbchenWulaiWaterEntities.push(entity);
  riverEntities.push(entity);
  setRiverStatus("nswl 烏來水資料 24 張");
}

function addIslandLandPatches() {
  [
    { name: "森林島面", x: 820, y: 210, major: 1200, minor: 760, color: "#1f6f52", alpha: 0.44, angle: 18 },
    { name: "聚落島面", x: -1120, y: 360, major: 880, minor: 520, color: "#dbeafe", alpha: 0.34, angle: -8 },
    { name: "農地島面", x: -780, y: -720, major: 1050, minor: 620, color: "#84a98c", alpha: 0.34, angle: 28 },
    { name: "河谷濕地島面", x: 180, y: -220, major: 1700, minor: 520, color: "#7dd3fc", alpha: 0.30, angle: 22 },
    { name: "山坡植被島面", x: 1240, y: -650, major: 820, minor: 460, color: "#5b8f5a", alpha: 0.36, angle: -22 }
  ].forEach((patch, index) => {
    const center = offsetGridPoint(ISLAND_CENTER.lon, ISLAND_CENTER.lat, patch.x, patch.y, 28);
    islandEntities.push(viewer.entities.add({
      name: patch.name,
      position: CesiumLib.Cartesian3.fromDegrees(center.lon, center.lat, ISLAND_HEIGHT + 3 + index * 0.2),
      ellipse: {
        semiMajorAxis: patch.major,
        semiMinorAxis: patch.minor,
        height: ISLAND_HEIGHT + 3 + index * 0.2,
        material: CesiumLib.Color.fromCssColorString(patch.color).withAlpha(patch.alpha),
        outline: false,
        rotation: CesiumLib.Math.toRadians(patch.angle)
      }
    }));
  });
}

function addRadarSheet() {
  const radarBaseHeight = ISLAND_HEIGHT + 340;
  const gridRows = 11;
  const gridCols = 13;
  const cellSize = 260;
  for (let row = 0; row < gridRows; row += 1) {
    for (let col = 0; col < gridCols; col += 1) {
      const x = (col - (gridCols - 1) / 2) * cellSize;
      const y = (row - (gridRows - 1) / 2) * cellSize;
      const normalizedX = x / (cellSize * 3.5);
      const normalizedY = y / (cellSize * 2.6);
      const dBZ = radarDbz(normalizedX, normalizedY, row, col, radarAnimationTime);
      const center = offsetGridPoint(ISLAND_CENTER.lon, ISLAND_CENTER.lat, x, y, 28);
      const footprint = radarCellFootprint(center.lon, center.lat, cellSize * 0.88, 28);
      const entity = viewer.entities.add({
        name: "烏來雷達回波方格",
        polygon: {
          hierarchy: CesiumLib.Cartesian3.fromDegreesArray(footprint),
          height: radarBaseHeight + row * 0.4 + col * 0.1,
          material: radarColor(dBZ),
          outline: true,
          outlineColor: CesiumLib.Color.fromCssColorString("#ffffff").withAlpha(0.72)
        }
      });
      const outlineEntity = viewer.entities.add({
        name: "烏來雷達回波格線",
        polyline: {
          positions: CesiumLib.Cartesian3.fromDegreesArrayHeights(radarCellOutlineFootprint(footprint, radarBaseHeight + 1)),
          width: 1.8,
          material: CesiumLib.Color.fromCssColorString("#e0f2fe").withAlpha(0.70),
          clampToGround: false
        }
      });
      radarEntities.push(entity);
      radarEntities.push(outlineEntity);
      radarCellMetadata.push({ entity, outlineEntity, normalizedX, normalizedY, row, col, baseHeight: radarBaseHeight });
    }
  }
}

function animateRadar() {
  const now = performance.now();
  radarAnimationTime = now * 0.00055;
  updateIslandWaterSurface(radarAnimationTime);
  radarCellMetadata.forEach(({ entity, outlineEntity, normalizedX, normalizedY, row, col, baseHeight }) => {
    const dBZ = radarDbz(normalizedX, normalizedY, row, col, radarAnimationTime);
    entity.show = radarToggle.checked;
    outlineEntity.show = radarToggle.checked;
    entity.polygon.material = radarColor(dBZ);
    entity.polygon.height = baseHeight + Math.sin(radarAnimationTime * 3 + row * 0.8 + col * 0.45) * 5;
    outlineEntity.polyline.material = CesiumLib.Color.fromCssColorString(dBZ >= 38 ? "#ffffff" : "#bae6fd").withAlpha(dBZ >= 38 ? 0.88 : 0.58);
  });
  if (now - lastBuildingRadarUpdate > 220) {
    updateBuildingRadarColors();
    lastBuildingRadarUpdate = now;
  }
}

function updateIslandWaterSurface(time) {
  const mode = VIEW_MODES[currentViewMode];
  const baseAlpha = 0;
  const basePulse = (Math.sin(time * 1.8) + 1) * 0.5;
  if (islandEntities[0]?.ellipse) {
    islandEntities[0].ellipse.material = CesiumLib.Color
      .fromCssColorString(ISLAND_BASE_COLOR)
      .withAlpha(baseAlpha);
    islandEntities[0].ellipse.outlineColor = CesiumLib.Color
      .fromCssColorString(ISLAND_HIGHLIGHT_COLOR)
      .withAlpha(0.12 + basePulse * 0.06);
  }

  islandEntities.forEach((entity) => {
    if (entity.wulaiWaterSurface && entity.polygon) {
      const water = entity.wulaiWaterSurface;
      const pulse = (Math.sin(time * 1.6 + water.phase) + 1) * 0.5;
      entity.polygon.material = CesiumLib.Color
        .fromCssColorString(water.color)
        .withAlpha(water.alpha * (0.82 + pulse * 0.18));
      entity.polygon.outlineColor = CesiumLib.Color
        .fromCssColorString(ISLAND_HIGHLIGHT_COLOR)
        .withAlpha(0.30 + pulse * 0.22);
    }
    if (entity.wulaiWaterSurface && entity.ellipse) {
      const water = entity.wulaiWaterSurface;
      const pulse = (Math.sin(time * 2.1 + water.phase) + 1) * 0.5;
      entity.ellipse.material = CesiumLib.Color
        .fromCssColorString(water.color)
        .withAlpha(water.alpha * (0.72 + pulse * 0.28));
      entity.ellipse.outlineColor = CesiumLib.Color
        .fromCssColorString(ISLAND_HIGHLIGHT_COLOR)
        .withAlpha(0.30 + pulse * 0.24);
    }
    if (entity.wulaiWaterHighlight && entity.polyline) {
      const highlight = entity.wulaiWaterHighlight;
      const pulse = (Math.sin(time * 2.4 + highlight.phase) + 1) * 0.5;
      entity.polyline.material = CesiumLib.Color
        .fromCssColorString(ISLAND_HIGHLIGHT_COLOR)
        .withAlpha(highlight.alpha * (0.45 + pulse * 0.55));
    }
  });
}

function islandWaterFootprint(points) {
  return points.flatMap(([x, y]) => {
    const point = offsetGridPoint(ISLAND_CENTER.lon, ISLAND_CENTER.lat, x, y, 28);
    return [point.lon, point.lat];
  });
}

function islandWaterLine(points, height) {
  return points.flatMap(([x, y]) => {
    const point = offsetGridPoint(ISLAND_CENTER.lon, ISLAND_CENTER.lat, x, y, 28);
    return [point.lon, point.lat, height];
  });
}

function radarDbz(x, y, row, col, time = 0) {
  const driftX = x - Math.sin(time * 0.9) * 0.18 - Math.sin(time * 0.22) * 0.28;
  const driftY = y - Math.cos(time * 0.72) * 0.14 - Math.sin(time * 0.31) * 0.12;
  const coreA = 52 * Math.exp(-((driftX - 0.22) ** 2 / 0.16 + (driftY + 0.12) ** 2 / 0.22));
  const coreB = 39 * Math.exp(-((driftX + 0.48) ** 2 / 0.30 + (driftY - 0.28) ** 2 / 0.18));
  const band = 24 * Math.exp(-((driftY + driftX * 0.45 + Math.sin(time * 0.6) * 0.16) ** 2 / 0.18));
  const riverBand = 34 * Math.exp(-((driftX + 0.10) ** 2 / 0.07 + (driftY - 0.04) ** 2 / 0.95));
  const settlementCore = 46 * Math.exp(-((driftX - 0.03) ** 2 / 0.055 + (driftY + 0.02) ** 2 / 0.075));
  const upstreamCore = 32 * Math.exp(-((driftX + 0.34) ** 2 / 0.08 + (driftY + 0.32) ** 2 / 0.12));
  const texture = ((row * 17 + col * 11) % 9) - 3;
  const pulse = Math.sin(time * 2.4 + row * 0.52 + col * 0.31) * 4.5;
  return coreA + coreB + band + riverBand + settlementCore + upstreamCore + texture + pulse;
}

function radarDbzAt(lon, lat, time = radarAnimationTime) {
  const metersPerLat = 111320;
  const metersPerLon = 111320 * Math.cos(CesiumLib.Math.toRadians(ISLAND_CENTER.lat));
  const dx = (lon - ISLAND_CENTER.lon) * metersPerLon;
  const dy = (lat - ISLAND_CENTER.lat) * metersPerLat;
  const radians = CesiumLib.Math.toRadians(-28);
  const rotatedX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const rotatedY = dx * Math.sin(radians) + dy * Math.cos(radians);
  return radarDbz(rotatedX / (360 * 3.5), rotatedY / (360 * 2.6), 0, 0, time);
}

function radarColor(dBZ) {
  if (dBZ >= 58) return CesiumLib.Color.fromCssColorString("#dc2626").withAlpha(0.70);
  if (dBZ >= 48) return CesiumLib.Color.fromCssColorString("#f97316").withAlpha(0.64);
  if (dBZ >= 38) return CesiumLib.Color.fromCssColorString("#facc15").withAlpha(0.56);
  if (dBZ >= 28) return CesiumLib.Color.fromCssColorString("#22c55e").withAlpha(0.46);
  return CesiumLib.Color.fromCssColorString("#38bdf8").withAlpha(0.40);
}

function radarCellFootprint(lon, lat, sizeMeters, angleDegrees) {
  const half = sizeMeters / 2;
  return [
    offsetGridPoint(lon, lat, -half, -half, angleDegrees),
    offsetGridPoint(lon, lat, half, -half, angleDegrees),
    offsetGridPoint(lon, lat, half, half, angleDegrees),
    offsetGridPoint(lon, lat, -half, half, angleDegrees)
  ].flatMap((point) => [point.lon, point.lat]);
}

function radarCellOutlineFootprint(footprint, height) {
  return [
    footprint[0], footprint[1], height,
    footprint[2], footprint[3], height,
    footprint[4], footprint[5], height,
    footprint[6], footprint[7], height,
    footprint[0], footprint[1], height
  ];
}

function offsetGridPoint(lon, lat, xMeters, yMeters, angleDegrees) {
  const radians = CesiumLib.Math.toRadians(angleDegrees);
  const rotatedX = xMeters * Math.cos(radians) - yMeters * Math.sin(radians);
  const rotatedY = xMeters * Math.sin(radians) + yMeters * Math.cos(radians);
  const metersPerLat = 111320;
  const metersPerLon = 111320 * Math.cos(CesiumLib.Math.toRadians(lat));
  return {
    lon: lon + rotatedX / metersPerLon,
    lat: lat + rotatedY / metersPerLat
  };
}

function setViewMode(mode) {
  currentViewMode = VIEW_MODES[mode] ? mode : "hybrid";
  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    const isActive = button.dataset.viewMode === currentViewMode;
    button.classList.toggle("button-primary", isActive);
    button.classList.toggle("button-secondary", !isActive);
  });
  applyLayerVisibility();
}

function applyLayerVisibility() {
  const mode = VIEW_MODES[currentViewMode];
  if (modelPrimitive) {
    modelPrimitive.show = modelToggle.checked && mode.model;
  }
  modelHelperEntities.forEach((entity) => {
    entity.show = modelToggle.checked && mode.model;
  });
  buildingEntities.forEach((entity) => {
    entity.show = buildingToggle.checked && mode.buildings;
  });
  floodSleeveEntities.forEach((entity) => {
    entity.show = (riverToggle?.checked ?? true) && buildingToggle.checked && mode.buildings;
  });
  riverEntities.forEach((entity) => {
    entity.show = riverToggle?.checked ?? true;
  });
  riverFlowEntities.forEach((entity) => {
    entity.show = riverToggle?.checked ?? true;
  });
  radarEntities.forEach((entity) => {
    entity.show = radarToggle?.checked ?? false;
  });
  updateBuildingRadarColors();
  if (islandEntities[0]?.ellipse) {
    updateIslandWaterSurface(radarAnimationTime);
  }
}

function animateRiverFlow() {
  const now = performance.now();
  updateWbchenWulaiWaterFrame(now);
  if (!riverVisibleEntities.length && !riverSurfaceEntities.length && !riverMirrorEntities.length && !riverEdgeEntities.length && !riverFlowEntities.length) return;
  riverVisibleEntities.forEach((entity, index) => {
    const meta = entity.wulaiVisiblePolylineRiver || entity.wulaiVisibleRiver;
    const pulse = (Math.sin(now * 0.0018 + meta.phase) + 1) * 0.5;
    const color = meta.color || (index === 0 ? "#8dd7ff" : "#f8fbff");
    const alpha = meta.alpha * (0.72 + pulse * 0.20);
    if (entity.polyline) {
      entity.polyline.material = color === "#f8fbff"
        ? CesiumLib.Color.fromCssColorString(color).withAlpha(alpha)
        : new CesiumLib.PolylineGlowMaterialProperty({
          glowPower: 0.18,
          taperPower: 0.65,
          color: CesiumLib.Color.fromCssColorString(color).withAlpha(alpha)
        });
    }
    if (entity.corridor) {
      entity.corridor.material = CesiumLib.Color.fromCssColorString(color).withAlpha(alpha);
    }
    entity.show = true;
  });
  riverSurfaceEntities.forEach((entity) => {
    const phase = (Math.sin(now * 0.0009 + entity.wulaiRiverSurface.phase) + 1) * 0.5;
    entity.polygon.height = entity.wulaiRiverSurface.baseHeight;
    entity.polygon.material = CesiumLib.Color
      .fromCssColorString("#38bdf8")
      .withAlpha(entity.wulaiRiverSurface.alpha * (0.82 + phase * 0.10));
    entity.polygon.outlineColor = CesiumLib.Color
      .fromCssColorString("#e0f2fe")
      .withAlpha(0.72 + phase * 0.16);
    entity.show = true;
  });
  riverMirrorEntities.forEach((entity, index) => {
    const pulse = (Math.sin(now * 0.0024 + entity.wulaiMirrorSurface.phase) + 1) * 0.5;
    entity.polygon.height = ISLAND_HEIGHT + 81.2 + index * 0.12;
    entity.polygon.material = CesiumLib.Color
      .fromCssColorString("#f8fbff")
      .withAlpha(entity.wulaiMirrorSurface.alpha * (0.55 + pulse * 0.45));
    entity.show = true;
  });
  riverEdgeEntities.forEach((entity) => {
    const pulse = (Math.sin(now * 0.002 + entity.wulaiRiverEdge.phase) + 1) * 0.5;
    entity.polyline.material = CesiumLib.Color
      .fromCssColorString("#f8fbff")
      .withAlpha(entity.wulaiRiverEdge.alpha * (0.42 + pulse * 0.48));
    entity.show = true;
  });

  const line = riverCenterline.length ? riverCenterline : WULAI_RIVER_AXIS;
  const time = now * 0.00012;
  riverFlowEntities.forEach((entity, index) => {
    const phase = (time + entity.wulaiRiverFlow.offset) % 1;
    const alphaPulse = (Math.sin(now * 0.004 + index * 1.3) + 1) * 0.5;
    entity.polyline.positions = CesiumLib.Cartesian3.fromDegreesArrayHeights(riverFlowSegment(line, phase, ISLAND_HEIGHT + 13.8 + index * 0.08));
    entity.polyline.material = new CesiumLib.PolylineGlowMaterialProperty({
      glowPower: 0.42,
      taperPower: 0.9,
      color: CesiumLib.Color.fromCssColorString(entity.wulaiRiverFlow.color).withAlpha(0.36 + alphaPulse * 0.46)
    });
    entity.show = true;
  });
  updateIslandWaterSurface(now * 0.001);
  viewer.scene.requestRender();
}

function updateWbchenWulaiWaterFrame(now) {
  if (!wbchenWulaiWaterEntities.length || now - lastWbchenWulaiWaterUpdate < 850) return;
  lastWbchenWulaiWaterUpdate = now;
  wbchenWulaiWaterFrame = wbchenWulaiWaterFrame % 24 + 1;
  wbchenWulaiWaterEntities.forEach((entity) => {
    if (!entity.rectangle) return;
    entity.rectangle.material = new CesiumLib.ImageMaterialProperty({
      image: `${WULAI_WATER_FRAME_BASE}/Frame_${wbchenWulaiWaterFrame}.png`,
      transparent: true,
      color: CesiumLib.Color.WHITE.withAlpha(0.82)
    });
    entity.show = riverToggle?.checked ?? true;
  });
}

function updateBuildingRadarColors() {
  buildingMetadata.forEach((metadata) => {
    metadata.entity.name = metadata.originalName;
    metadata.entity.polygon.material = buildingMaterial(metadata.isRisk);
    metadata.entity.polygon.outlineColor = metadata.riverDistance < 0.00145 && (riverToggle?.checked ?? true)
      ? CesiumLib.Color.fromCssColorString("#7dd3fc").withAlpha(0.98)
      : CesiumLib.Color.fromCssColorString("#f8fafc").withAlpha(0.88);
  });
}

function buildingMaterial(isRisk, dBZ = 0, radarAffected = false) {
  const mode = VIEW_MODES[currentViewMode];
  const alpha = currentViewMode === "analysis"
    ? Math.max(mode.buildingAlpha, 0.34)
    : Math.max(mode.buildingAlpha, 0.18);
  return CesiumLib.Color.fromCssColorString("#f1f5f9").withAlpha(alpha + 0.16);
}

function buildingOutlineColor(dBZ) {
  if (dBZ >= 48) return CesiumLib.Color.fromCssColorString("#fecaca").withAlpha(1);
  if (dBZ >= 38) return CesiumLib.Color.fromCssColorString("#fed7aa").withAlpha(1);
  return CesiumLib.Color.fromCssColorString("#fef08a").withAlpha(0.98);
}

function riverFlowSegment(line, phase, height) {
  const segmentLength = 0.16;
  const sampleCount = 7;
  const points = [];
  for (let step = 0; step < sampleCount; step += 1) {
    const fraction = (phase + (step / (sampleCount - 1)) * segmentLength) % 1;
    const source = pointAlongLine(line, fraction);
    points.push(source.lon, source.lat, height);
  }
  return points;
}

function pointAlongLine(line, fraction) {
  if (line.length === 1) return { lon: line[0][0], lat: line[0][1] };
  const distances = [0];
  let total = 0;
  for (let index = 1; index < line.length; index += 1) {
    total += approximateDistanceMeters(line[index - 1], line[index]);
    distances.push(total);
  }
  const target = ((fraction % 1) + 1) % 1 * total;
  const segmentIndex = Math.max(1, distances.findIndex((distance) => distance >= target));
  const previousDistance = distances[segmentIndex - 1];
  const nextDistance = distances[segmentIndex];
  const ratio = nextDistance === previousDistance ? 0 : (target - previousDistance) / (nextDistance - previousDistance);
  const start = line[segmentIndex - 1];
  const end = line[segmentIndex];
  return {
    lon: start[0] + (end[0] - start[0]) * ratio,
    lat: start[1] + (end[1] - start[1]) * ratio
  };
}

function approximateDistanceMeters(start, end) {
  const lat = (start[1] + end[1]) * 0.5;
  const dx = (end[0] - start[0]) * 111320 * Math.cos(CesiumLib.Math.toRadians(lat));
  const dy = (end[1] - start[1]) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}

function floodRibbonFootprint(widthMeters) {
  const left = [];
  const right = [];
  const line = riverCenterline.length ? riverCenterline : WULAI_RIVER_AXIS;
  line.forEach(([lon, lat], index) => {
    const previous = line[Math.max(0, index - 1)];
    const next = line[Math.min(line.length - 1, index + 1)];
    const angle = bearingDegrees(previous[0], previous[1], next[0], next[1]);
    const leftPoint = offsetPoint(lon, lat, angle + 90, widthMeters / 2);
    const rightPoint = offsetPoint(lon, lat, angle - 90, widthMeters / 2);
    left.push([leftPoint.lon, leftPoint.lat]);
    right.unshift([rightPoint.lon, rightPoint.lat]);
  });
  return [...left, ...right].flatMap(([lon, lat]) => [lon, lat]);
}

function distanceToRiver([lon, lat]) {
  const line = riverCenterline.length ? riverCenterline : WULAI_RIVER_AXIS;
  return Math.min(...line.map(([riverLon, riverLat]) => {
    const dx = (lon - riverLon) * Math.cos(CesiumLib.Math.toRadians(lat));
    const dy = lat - riverLat;
    return Math.sqrt(dx * dx + dy * dy);
  }));
}

function flattenPolygonRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates.map((ring) => ring.map(([lon, lat]) => [lon, lat]));
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygon.map((ring) => ring.map(([lon, lat]) => [lon, lat])));
  }
  return [];
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

function setModelStatus(text) {
  const element = document.querySelector("#model-status");
  if (element) element.textContent = text;
}

function setRiverStatus(text) {
  const element = document.querySelector("#river-status");
  if (element) element.textContent = text;
}

function setupMobilePanels() {
  const closePanels = () => {
    mobilePanelTargets.forEach((panel) => panel.classList.remove("is-mobile-open"));
    mobileDockButtons.forEach((button) => button.classList.remove("is-active"));
  };

  mobileDockButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetName = button.dataset.wulaiPanel;
      const target = document.querySelector(`[data-wulai-panel-target="${targetName}"]`);
      const shouldOpen = target && !target.classList.contains("is-mobile-open");
      closePanels();
      if (shouldOpen) {
        target.classList.add("is-mobile-open");
        button.classList.add("is-active");
      }
    });
  });

  const syncPanels = () => closePanels();
  if (mobilePanelQuery.addEventListener) {
    mobilePanelQuery.addEventListener("change", syncPanels);
  } else {
    mobilePanelQuery.addListener(syncPanels);
  }
  syncPanels();
}

function toggleControlPanel(forceOpen) {
  const shouldOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : controlPanel.classList.contains("is-panel-collapsed");
  controlPanel.classList.toggle("is-panel-collapsed", !shouldOpen);
  document.body.classList.toggle("wulai-control-collapsed", !shouldOpen);
  panelToggleButtons.forEach((button) => {
    button.setAttribute("aria-expanded", String(shouldOpen));
  });
}
