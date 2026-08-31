const CesiumLib = window.Cesium;

window.addEventListener("error", (event) => {
  showCriticalError(`Cesium 場景錯誤：${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || String(event.reason || "unknown error");
  showCriticalError(`Cesium 非同步載入錯誤：${message}`);
});

if (!CesiumLib) {
  showCriticalError("CesiumJS 載入失敗，請確認瀏覽器可以連到 cdnjs.cloudflare.com。");
  throw new Error("CesiumJS is not available.");
}

CesiumLib.Ion.defaultAccessToken = "";

const facility = {
  name: "保二總隊",
  lat: 24.97784625792294,
  lon: 121.55016630895584
};
const liveCameras = [
  {
    name: "新店寶橋路235巷",
    lat: 24.97898,
    lon: 121.55161,
    distance: "約 190m",
    url: "https://focustaiwan.net/cctv/c000033",
    streamUrl: "https://cctvatis1.ntpc.gov.tw/hls/C000033/live.m3u8"
  },
  {
    name: "寶橋路、中興路口",
    lat: 24.976,
    lon: 121.547,
    distance: "約 380m",
    url: "https://www.twipcam.com/cam/nwt-000272",
    streamUrl: "https://cctvatis4.ntpc.gov.tw/hls/C000272/live.m3u8"
  },
  {
    name: "北新路二段、寶橋路口",
    lat: 24.97351,
    lon: 121.54298,
    distance: "約 890m",
    url: "https://focustaiwan.net/cctv/c000150",
    streamUrl: "https://cctvatis3.ntpc.gov.tw/hls/C000150/live.m3u8"
  }
];
const BUILDINGS_URL = "../data/baoer-zongdui/buildings-500m.geojson";
const ROADS_URL = "../data/baoer-zongdui/roads-500m.geojson";
const NATIONAL_INFRASTRUCTURE_URL = "../data/critical-infrastructure-ncdr.geojson";
const WARGAME_FEEDS = {
  live: {
    label: "即時",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRIZmb2YXtPKLpRmmL0hqqtaFn6LBp1IbnrPHXO-EMwF0W5rKNdP2AnK6SDTzdsd0jB353Tr41nLbpX/pub?gid=695160338&single=true&output=csv"
  },
  resilience: {
    label: "城鎮韌性演習",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRIZmb2YXtPKLpRmmL0hqqtaFn6LBp1IbnrPHXO-EMwF0W5rKNdP2AnK6SDTzdsd0jB353Tr41nLbpX/pub?gid=634456011&single=true&output=csv"
  }
};
const TYPHOON_TRACK_URL = "../data/cwa-typhoon-track.geojson";
const TYPHOON_WIND_PROBABILITY_URL = "../data/cwa-typhoon-wind-probability.geojson";
const mapDataset = document.body?.dataset?.mapDataset || "critical-infrastructure";
let activeWargameFeed = "live";

const viewer = new CesiumLib.Viewer("critical-container", {
  animation: false,
  baseLayer: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  sceneModePicker: false,
  selectionIndicator: false,
  timeline: false,
  navigationHelpButton: false,
  shouldAnimate: true,
  terrainProvider: new CesiumLib.EllipsoidTerrainProvider()
});

const basemaps = {
  dark: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    credit: "Esri Dark Gray Canvas",
    maximumLevel: 20
  },
  "google-hybrid": {
    url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    credit: "Google Hybrid",
    subdomains: ["0", "1", "2", "3"],
    maximumLevel: 20
  }
};

let activeBasemapLayer = null;
setBasemap("dark");

viewer.scene.backgroundColor = CesiumLib.Color.fromCssColorString("#07111f");
viewer.scene.globe.depthTestAgainstTerrain = false;
viewer.scene.globe.enableLighting = false;
viewer.scene.globe.baseColor = CesiumLib.Color.fromCssColorString("#030712");
viewer.scene.skyAtmosphere.show = true;
viewer.scene.postProcessStages.fxaa.enabled = true;

const cameraViews = {
  overview: {
    destination: CesiumLib.Cartesian3.fromDegrees(120.95, 23.75, 1150000),
    orientation: {
      heading: CesiumLib.Math.toRadians(0),
      pitch: CesiumLib.Math.toRadians(-90),
      roll: 0
    }
  },
  local: {
    destination: CesiumLib.Cartesian3.fromDegrees(facility.lon, facility.lat, 2400),
    orientation: {
      heading: CesiumLib.Math.toRadians(0),
      pitch: CesiumLib.Math.toRadians(-54),
      roll: 0
    }
  },
  low: {
    destination: CesiumLib.Cartesian3.fromDegrees(facility.lon - 0.006, facility.lat - 0.006, 760),
    orientation: {
      heading: CesiumLib.Math.toRadians(42),
      pitch: CesiumLib.Math.toRadians(-25),
      roll: 0
    }
  },
  top: {
    destination: CesiumLib.Cartesian3.fromDegrees(facility.lon, facility.lat, 1650),
    orientation: {
      heading: 0,
      pitch: CesiumLib.Math.toRadians(-90),
      roll: 0
    }
  },
  typhoon: {
    destination: CesiumLib.Cartesian3.fromDegrees(142.5, 20.8, 4200000),
    orientation: {
      heading: CesiumLib.Math.toRadians(0),
      pitch: CesiumLib.Math.toRadians(-90),
      roll: 0
    }
  }
};

let buildingEntities = [];
let radiusEntity = null;
let nationalInfrastructureEntities = [];
let typhoonEntities = [];
let typhoonAnimationFrames = [];
let animatedTyphoonEntity = null;
let animatedTyphoonWindEntity = null;
let typhoonAnimationTimer = null;
let typhoonAnimationIndex = 0;
let roadFlows = [];
let roadEntities = [];
let roadPulseEntities = [];
let cctvEntities = [];
let roadFlowTimer = null;
let roadFlowFrame = 0;
let activeHls = [];
let selectedLiveCameraIndex = 0;
let pulseFrame = 0;
let focusPulseEntity = null;
let focusPulseTimer = null;
let selectedFocusEntity = null;
let selectedInfrastructureEntity = null;
let selectedFocusColor = null;
let selectedOriginalPointColor = null;
let selectedOriginalPointSize = null;
let wargameProjectFeatures = [];
let recentWargameProjects = [];
const resourceCard = document.querySelector("#critical-resource-card");
const resourceCategory = document.querySelector("#critical-resource-category");
const resourceTitle = document.querySelector("#critical-resource-title");
const resourceList = document.querySelector("#critical-resource-list");
const scenarioList = document.querySelector("#critical-scenario-list");
const historyList = document.querySelector("#critical-history-list");
const historyDetails = document.querySelector(".critical-history-details");
const resourceClose = document.querySelector("#critical-resource-close");
const timelineTrack = document.querySelector("#critical-timeline-track");
const timelineCount = document.querySelector("#critical-timeline-count");
const timelinePlayButton = document.querySelector("#critical-timeline-play");
let timelineItems = [];
let timelinePlaybackTimer = null;
let timelinePlaybackIndex = 0;
let timelinePlaybackActive = false;

document.querySelectorAll("[data-camera]").forEach((button) => {
  button.addEventListener("click", () => {
    flyToView(button.dataset.camera);
    if (button.dataset.camera === "overview") showWargameOverviewPanel();
  });
});

document.querySelector("#critical-basemap-select")?.addEventListener("change", (event) => {
  setBasemap(event.target.value);
});

document.querySelectorAll("[data-wargame-feed]").forEach((button) => {
  button.addEventListener("click", () => switchWargameFeed(button.dataset.wargameFeed));
});

timelinePlayButton?.addEventListener("click", () => {
  if (timelinePlaybackTimer) {
    stopTimelinePlayback();
  } else {
    startTimelinePlayback();
  }
});

document.querySelector("#critical-building-toggle").addEventListener("change", (event) => {
  buildingEntities.forEach((entity) => {
    entity.show = event.target.checked;
  });
});

document.querySelector("#critical-radius-toggle").addEventListener("change", (event) => {
  if (radiusEntity) radiusEntity.show = event.target.checked;
});

document.querySelector("#critical-road-toggle").addEventListener("change", (event) => {
  roadEntities.forEach((entity) => {
    entity.show = event.target.checked;
  });
  roadPulseEntities.forEach((entity) => {
    entity.show = event.target.checked;
  });
  if (event.target.checked) {
    startRoadFlow();
  } else {
    stopRoadFlow();
  }
});

document.querySelectorAll("[data-cctv-index]").forEach((button) => {
  button.addEventListener("click", () => selectLiveCamera(Number(button.dataset.cctvIndex)));
});

document.querySelector("#critical-national-toggle").addEventListener("change", (event) => {
  nationalInfrastructureEntities.forEach((entity) => {
    entity.show = event.target.checked;
    if (entity.pulseEntity) entity.pulseEntity.show = event.target.checked;
    if (entity.rangeEntity) entity.rangeEntity.show = event.target.checked;
  });
});

document.querySelector("#critical-typhoon-toggle")?.addEventListener("change", (event) => {
  typhoonEntities.forEach((entity) => {
    entity.show = event.target.checked;
  });
  if (event.target.checked) {
    startTyphoonAnimation();
  } else {
    stopTyphoonAnimation();
  }
});

document.querySelector("#critical-video-toggle")?.addEventListener("click", () => setVideoStripCollapsed(false));
document.querySelector("#critical-video-collapse")?.addEventListener("click", () => setVideoStripCollapsed(true));
resourceClose?.addEventListener("click", () => {
  clearSelectedInfrastructureFocus();
  if (mapDataset === "wargame-projects") {
    showWargameOverviewPanel();
  } else {
    resourceCard?.classList.add("is-hidden");
  }
});

setCameraView("overview");
if (mapDataset !== "wargame-projects") {
  addFacility();
  addLiveCameras();
  addRadius();
}
loadNationalInfrastructure();
if (mapDataset !== "wargame-projects") {
  loadTyphoonTrack();
}
if (mapDataset !== "wargame-projects") {
  loadRoads();
  loadBuildings();
  initLiveVideos();
  selectLiveCamera(0, { fly: false });
  setVideoStripCollapsed(true);
}
startInfrastructurePulse();
initInfrastructurePickHandler();
viewer.scene.postRender.addEventListener(updateSelectedFocusRing);
setTimeout(checkCesiumCanvas, 2500);

function setCameraView(viewName) {
  viewer.camera.setView(cameraViews[viewName]);
}

function flyToView(viewName) {
  viewer.camera.flyTo({
    ...cameraViews[viewName],
    duration: 1.25
  });
}

function setBasemap(basemapKey) {
  const config = basemaps[basemapKey] || basemaps.dark;
  if (activeBasemapLayer) {
    viewer.imageryLayers.remove(activeBasemapLayer, true);
  } else {
    viewer.imageryLayers.removeAll();
  }
  activeBasemapLayer = viewer.imageryLayers.addImageryProvider(new CesiumLib.UrlTemplateImageryProvider(config));
  viewer.scene.globe.baseColor = CesiumLib.Color.fromCssColorString(basemapKey === "google-hybrid" ? "#111827" : "#030712");
}

function initInfrastructurePickHandler() {
  const handler = new CesiumLib.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    const entity = picked?.id;
    const isInfrastructure = Boolean(entity?.properties?.criticalInfrastructure?.getValue?.());
    if (!isInfrastructure) return;
    viewer.selectedEntity = undefined;
    setSelectedInfrastructureFocus(entity);
    focusInfrastructureEntity(entity);
    showInfrastructureResources(entity);
  }, CesiumLib.ScreenSpaceEventType.LEFT_CLICK);
}

function setSelectedInfrastructureFocus(entity) {
  clearSelectedInfrastructureFocus();
  selectedInfrastructureEntity = entity;
  const position = entity.position?.getValue?.(CesiumLib.JulianDate.now());
  if (!position) return;
  const category = entity.properties?.category?.getValue?.() || "";
  selectedFocusColor = infrastructureColor(category);
  if (entity.point) {
    selectedOriginalPointColor = entity.point.color;
    selectedOriginalPointSize = entity.point.pixelSize;
    entity.point.color = selectedFocusColor.brighten(0.42, new CesiumLib.Color());
    entity.point.pixelSize = 18;
    entity.point.outlineColor = CesiumLib.Color.WHITE;
    entity.point.outlineWidth = 4;
  }
  const cartographic = CesiumLib.Cartographic.fromCartesian(position);
  const lon = CesiumLib.Math.toDegrees(cartographic.longitude);
  const lat = CesiumLib.Math.toDegrees(cartographic.latitude);
  selectedFocusEntity = viewer.entities.add({
    name: "目前選取設施",
    position: CesiumLib.Cartesian3.fromDegrees(lon, lat, 1850),
    ellipse: {
      semiMajorAxis: 18000,
      semiMinorAxis: 18000,
      material: selectedFocusColor.withAlpha(0.16),
      outline: true,
      outlineColor: selectedFocusColor.brighten(0.42, new CesiumLib.Color()).withAlpha(0.95),
      height: 1820
    }
  });
}

function clearSelectedInfrastructureFocus() {
  if (selectedInfrastructureEntity?.point) {
    if (selectedOriginalPointColor) selectedInfrastructureEntity.point.color = selectedOriginalPointColor;
    if (selectedOriginalPointSize) selectedInfrastructureEntity.point.pixelSize = selectedOriginalPointSize;
    selectedInfrastructureEntity.point.outlineColor = CesiumLib.Color.WHITE;
    selectedInfrastructureEntity.point.outlineWidth = 2;
  }
  if (selectedFocusEntity) viewer.entities.remove(selectedFocusEntity);
  selectedFocusEntity = null;
  selectedInfrastructureEntity = null;
  selectedFocusColor = null;
  selectedOriginalPointColor = null;
  selectedOriginalPointSize = null;
}

function updateSelectedFocusRing() {
  if (selectedFocusEntity?.ellipse && selectedFocusColor) {
    const t = (Date.now() % 1600) / 1600;
    const wave = 0.5 + Math.sin(t * Math.PI * 2) * 0.5;
    selectedFocusEntity.ellipse.semiMajorAxis = 15000 + wave * 7000;
    selectedFocusEntity.ellipse.semiMinorAxis = 15000 + wave * 7000;
    selectedFocusEntity.ellipse.material = selectedFocusColor.withAlpha(0.1 + wave * 0.1);
    selectedFocusEntity.ellipse.outlineColor = selectedFocusColor.brighten(0.42, new CesiumLib.Color()).withAlpha(0.62 + wave * 0.34);
  }
}

function showInfrastructureResources(entity) {
  const props = entity.properties;
  const name = props.name?.getValue?.() || entity.name || "關鍵基礎設施";
  const category = props.category?.getValue?.() || "關鍵基礎設施";
  const id = props.id?.getValue?.() || "";
  const context = {
    group: props.group?.getValue?.() || "",
    createdAt: props.createdAt?.getValue?.() || "",
    updatedAt: props.updatedAt?.getValue?.() || "",
    status: props.status?.getValue?.() || "",
    keyword: props.keyword?.getValue?.() || ""
  };
  resourceCard?.classList.remove("is-overview");
  resourceCard?.style.setProperty("--resource-accent", infrastructureColorValue(category));
  if (resourceCategory) resourceCategory.textContent = `${category} | ${id}`;
  if (resourceTitle) resourceTitle.textContent = name;
  renderResourceList(category, name);
  renderScenarioList(name, category, context);
  renderHistoryList(name, category, context);
  if (historyDetails) historyDetails.open = false;
  resourceCard?.classList.remove("is-hidden");
  replayResourceCardAnimation();
}

function replayResourceCardAnimation() {
  if (!resourceCard) return;
  resourceCard.classList.remove("is-active");
  void resourceCard.offsetWidth;
  resourceCard.classList.add("is-active");
}

function renderResourceList(category, name) {
  if (!resourceList) return;
  const resources = buildFacilityResources(category, name);
  resourceList.innerHTML = resources.items.map((item) => `
    <li>
      <span aria-hidden="true">${item.icon}</span>
      <span>${item.label}</span>
      <b>${item.value}</b>
    </li>
  `).join("");
}

function renderScenarioList(name, category, context = {}) {
  if (!scenarioList) return;
  const scenarioBase = category === "水資源" ? "水庫" : category === "石化" ? "廠區" : category === "通訊" ? "通訊站" : "設施";
  const scenarios = [{
    title: mapDataset === "wargame-projects" ? name : `${name}${scenarioBase}緊急應變`,
    agency: context.group || "內政部警政署保安警察第二總隊",
    time: mapDataset === "wargame-projects" ? context.updatedAt || "--" : context.createdAt || "2026/06/17 15:08"
  }];
  scenarioList.innerHTML = scenarios.map((scenario) => `
    <li class="critical-scenario-row">
      <div>
        <div class="critical-scenario-tools" aria-hidden="true">
          <i>⌛</i><i>✎</i><i>↗</i>
        </div>
        <div class="critical-scenario-title">${scenario.title}</div>
      </div>
      <div class="critical-scenario-agency">${scenario.agency}</div>
      <div class="critical-scenario-time">${scenario.time}</div>
    </li>
  `).join("");
}

function renderHistoryList(name, category, context = {}) {
  if (!historyList) return;
  if (mapDataset === "wargame-projects") {
    const histories = [
      {
        title: context.status || "專案同步狀態待確認",
        agency: context.group || "未填寫",
        time: context.updatedAt || "--"
      },
      {
        title: context.keyword ? `辨識關鍵字：${context.keyword}` : "定位關鍵字待確認",
        agency: category,
        time: context.updatedAt || "--"
      }
    ];
    historyList.innerHTML = histories.map((history) => `
      <li class="critical-scenario-row">
        <div>
          <div class="critical-scenario-tools" aria-hidden="true">
            <i>檢</i><i>錄</i><i>↗</i>
          </div>
          <div class="critical-scenario-title">${history.title}</div>
        </div>
        <div class="critical-scenario-agency">${history.agency}</div>
        <div class="critical-scenario-time">${history.time}</div>
      </li>
    `).join("");
    return;
  }
  const historyBase = category === "水資源" ? "水情" : category === "石化" ? "災害" : category === "通訊" ? "通訊" : "安全";
  const histories = [
    {
      title: `${name}${historyBase}巡檢紀錄`,
      agency: "內政部警政署保安警察第二總隊",
      time: "2026/05/28 09:30"
    },
    {
      title: `${name}周邊交通管制演練`,
      agency: "內政部警政署保安警察第二總隊",
      time: "2026/04/19 14:20"
    },
    {
      title: `${name}通訊備援測試`,
      agency: "內政部警政署保安警察第二總隊",
      time: "2026/03/06 10:15"
    }
  ];
  historyList.innerHTML = histories.map((history) => `
    <li class="critical-scenario-row">
      <div>
        <div class="critical-scenario-tools" aria-hidden="true">
          <i>檢</i><i>錄</i><i>↗</i>
        </div>
        <div class="critical-scenario-title">${history.title}</div>
      </div>
      <div class="critical-scenario-agency">${history.agency}</div>
      <div class="critical-scenario-time">${history.time}</div>
    </li>
  `).join("");
}

function buildFacilityResources(category, name) {
  const categoryBoost = {
    "發電": 2,
    "電力": 2,
    "能源": 2,
    "石化": 3,
    "水資源": 1,
    "科學園區": 2,
    "通訊": 1,
    "交通": 1
  }[category] || 0;
  const seed = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  return {
    items: [
      { icon: "🚙", label: "勤務車輛", value: `${2 + seed} / ${3 + seed} 可用` },
      { icon: "📻", label: "無線電", value: `${10 + categoryBoost} / ${12 + categoryBoost} 可用` },
      { icon: "🔋", label: "發電機", value: `${1 + Math.min(seed, 1)} / ${1 + Math.min(seed, 1)} 可用` },
      { icon: "🎥", label: "移動監控", value: `${1 + categoryBoost} / ${2 + categoryBoost} 可用` },
      { icon: "🧰", label: "管制器材", value: `${28 + categoryBoost * 3 + seed} 組` },
      { icon: "🚧", label: "防護裝備", value: `${14 + categoryBoost * 2} 套` },
      { icon: "🩹", label: "AED / 急救", value: `${2 + Math.min(seed, 1)} 組` }
    ]
  };
}

function focusInfrastructureEntity(entity) {
  const position = entity.position?.getValue?.(CesiumLib.JulianDate.now());
  if (!position) return;
  if (focusPulseTimer) window.clearInterval(focusPulseTimer);
  if (focusPulseEntity) viewer.entities.remove(focusPulseEntity);
  const cartographic = CesiumLib.Cartographic.fromCartesian(position);
  const lon = CesiumLib.Math.toDegrees(cartographic.longitude);
  const lat = CesiumLib.Math.toDegrees(cartographic.latitude);
  const category = entity.properties?.category?.getValue?.() || "";
  const focusColor = infrastructureColor(category);
  let frame = 0;
  focusPulseEntity = viewer.entities.add({
    name: "設施選取聚焦",
    position: CesiumLib.Cartesian3.fromDegrees(lon, lat, 1700),
    ellipse: {
      semiMajorAxis: 12000,
      semiMinorAxis: 12000,
      material: focusColor.withAlpha(0.24),
      outline: true,
      outlineColor: focusColor.brighten(0.36, new CesiumLib.Color()).withAlpha(0.84),
      height: 1680
    }
  });
  focusPulseTimer = window.setInterval(() => {
    frame += 1;
    if (!focusPulseEntity?.ellipse) return;
    const t = frame / 32;
    const wave = Math.sin(Math.min(1, t) * Math.PI);
    focusPulseEntity.ellipse.semiMajorAxis = 9000 + t * 28000;
    focusPulseEntity.ellipse.semiMinorAxis = 9000 + t * 28000;
    focusPulseEntity.ellipse.material = focusColor.withAlpha(0.28 * wave);
    focusPulseEntity.ellipse.outlineColor = focusColor.brighten(0.36, new CesiumLib.Color()).withAlpha(0.86 * wave);
    if (frame >= 32) {
      window.clearInterval(focusPulseTimer);
      focusPulseTimer = null;
      if (focusPulseEntity) viewer.entities.remove(focusPulseEntity);
      focusPulseEntity = null;
    }
  }, 28);
}

function addFacility() {
  viewer.entities.add({
    name: facility.name,
    position: CesiumLib.Cartesian3.fromDegrees(facility.lon, facility.lat, 55),
    point: {
      pixelSize: 14,
      color: CesiumLib.Color.fromCssColorString("#38bdf8"),
      outlineColor: CesiumLib.Color.WHITE,
      outlineWidth: 2,
      heightReference: CesiumLib.HeightReference.NONE
    },
    label: {
      text: facility.name,
      font: "700 15px sans-serif",
      fillColor: CesiumLib.Color.WHITE,
      outlineColor: CesiumLib.Color.BLACK,
      outlineWidth: 3,
      style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new CesiumLib.Cartesian2(0, -28),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    description: `關鍵基礎設施點位<br>${facility.lat}, ${facility.lon}`
  });
}

function addRadius() {
  radiusEntity = viewer.entities.add({
    name: "500m 範圍",
    position: CesiumLib.Cartesian3.fromDegrees(facility.lon, facility.lat),
    ellipse: {
      semiMajorAxis: 500,
      semiMinorAxis: 500,
      material: CesiumLib.Color.fromCssColorString("#35d4ff").withAlpha(0.12),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#35d4ff").withAlpha(0.85),
      height: 2
    }
  });
}

async function loadNationalInfrastructure() {
  try {
    const geojson = mapDataset === "wargame-projects"
      ? await fetchWargameProjectGeojson()
      : await fetchNationalInfrastructureGeojson();
    if (mapDataset === "wargame-projects") wargameProjectFeatures = geojson.features;
    nationalInfrastructureEntities = geojson.features.map(addNationalInfrastructurePoint).filter(Boolean);
    updateNationalToggleLabel(nationalInfrastructureEntities.length);
    renderWargameTimeline();
    showWargameOverviewPanel();
  } catch (error) {
    const label = mapDataset === "wargame-projects" ? "兵棋專案點位" : "全台設施資料";
    showCriticalError(`${label}讀取失敗：${error.message}`);
  }
}

async function fetchNationalInfrastructureGeojson() {
  const response = await fetch(`${NATIONAL_INFRASTRUCTURE_URL}?v=20260812-ncdr`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchWargameProjectGeojson() {
  const feed = WARGAME_FEEDS[activeWargameFeed] || WARGAME_FEEDS.live;
  const response = await fetch(`${feed.url}&v=20260814`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const csv = await response.text();
  const rows = parseCsvRows(csv);
  const features = spreadOverlappingWargamePoints(rows.map(wargameProjectRowToFeature).filter(isWargameProjectFromAugust));
  return {
    type: "FeatureCollection",
    name: "national-wargame-projects",
    features
  };
}

function isWargameProjectFromAugust(feature) {
  if (!feature) return false;
  const updatedAt = parseTaiwanDateTime(feature.properties?.updatedAt);
  if (!updatedAt) return false;
  return updatedAt >= new Date(2026, 7, 1, 0, 0, 0);
}

async function switchWargameFeed(feedKey) {
  if (mapDataset !== "wargame-projects" || !WARGAME_FEEDS[feedKey] || feedKey === activeWargameFeed) return;
  stopTimelinePlayback();
  activeWargameFeed = feedKey;
  document.querySelectorAll("[data-wargame-feed]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.wargameFeed === activeWargameFeed);
  });
  clearSelectedInfrastructureFocus();
  clearNationalInfrastructureEntities();
  wargameProjectFeatures = [];
  recentWargameProjects = [];
  resourceCard?.classList.add("is-hidden");
  await loadNationalInfrastructure();
  setCameraView("overview");
}

function clearNationalInfrastructureEntities() {
  nationalInfrastructureEntities.forEach((entity) => {
    if (entity.rangeEntity) viewer.entities.remove(entity.rangeEntity);
    if (entity.pulseEntity) viewer.entities.remove(entity.pulseEntity);
    viewer.entities.remove(entity);
  });
  nationalInfrastructureEntities = [];
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), (values[index] || "").trim()])));
}

function wargameProjectRowToFeature(row) {
  const lat = Number(row["緯度"]);
  const lon = Number(row["經度"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const locationType = row["定位類型"] || "兵棋專案";
  const group = row["所屬群組"] || "未填寫";
  const projectName = row["專案名稱"] || "未命名專案";
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [lon, lat]
    },
    properties: {
      id: row["專案ID"] || buildWargameProjectId(row),
      name: projectName,
      category: locationType === "關鍵基礎設施" ? "兵棋設施" : locationType,
      city: row["定位名稱"] || "",
      status: row["同步時間"] ? `同步 ${row["同步時間"]}` : "待同步",
      group,
      createdAt: row["建立時間"] || "",
      updatedAt: row["最後修改時間"] || "",
      keyword: row["辨識關鍵字"] || row["關鍵字"] || "",
      originalLon: lon,
      originalLat: lat,
      note: `${group}<br>${row["定位名稱"] || ""}`
    }
  };
}

function buildWargameProjectId(row) {
  return [
    row["專案名稱"] || "project",
    row["所屬群組"] || "group",
    row["最後修改時間"] || "updated"
  ].join("|");
}

function spreadOverlappingWargamePoints(features) {
  const groups = new Map();
  features.forEach((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(feature);
  });

  groups.forEach((items) => {
    if (items.length <= 1) return;
    const [centerLon, centerLat] = items[0].geometry.coordinates;
    const radiusKm = getSpreadRadiusKm(items);
    items.forEach((feature, index) => {
      const offset = getRandomizedTaiwanVisualOffset(centerLon, centerLat, radiusKm, feature, index);
      feature.geometry.coordinates = [offset.lon, offset.lat];
      feature.properties.displayLon = offset.lon;
      feature.properties.displayLat = offset.lat;
      feature.properties.spreadCount = items.length;
      feature.properties.spreadIndex = index + 1;
    });
  });
  return features;
}

function getSpreadRadiusKm(items) {
  const hasFacility = items.some((feature) => feature.properties?.category === "兵棋設施" || feature.properties?.category === "關鍵基礎設施");
  const base = hasFacility ? 3.2 : 7.5;
  return Math.min(base + items.length * 0.9, hasFacility ? 6 : 12);
}

function getRandomizedTaiwanVisualOffset(lon, lat, radiusKm, feature, index) {
  const seed = hashString(`${feature.properties?.id || feature.properties?.name || "project"}|${index}`);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const angle = (seed % 6283) / 1000 + index * golden;
  const distanceRatio = 0.22 + (((seed >>> 8) % 1000) / 1000) * 0.78;
  return constrainTaiwanVisualOffset(lon, lat, radiusKm * distanceRatio, angle);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getInlandSpreadAngle(lon, lat) {
  const taiwanCenter = { lon: 120.96, lat: 23.76 };
  const deltaLonKm = (taiwanCenter.lon - lon) * 111.32 * Math.cos(CesiumLib.Math.toRadians(lat));
  const deltaLatKm = (taiwanCenter.lat - lat) * 110.574;
  return Math.atan2(deltaLatKm, deltaLonKm);
}

function constrainTaiwanVisualOffset(lon, lat, radiusKm, angle) {
  const fallbackAngle = getInlandSpreadAngle(lon, lat);
  const candidateAngles = [angle, angle - 0.42, angle + 0.42, fallbackAngle, fallbackAngle - 0.35, fallbackAngle + 0.35];
  const candidateRadii = [radiusKm, radiusKm * 0.72, radiusKm * 0.5, radiusKm * 0.32];
  for (const nextRadius of candidateRadii) {
    for (const nextAngle of candidateAngles) {
      const offset = offsetCoordinate(lon, lat, nextRadius, nextAngle);
      if (isLikelyTaiwanLandDisplay(offset.lon, offset.lat)) return offset;
    }
  }
  return offsetCoordinate(lon, lat, Math.min(radiusKm, 2.2), fallbackAngle);
}

function isLikelyTaiwanLandDisplay(lon, lat) {
  if (lon < 120.0 || lon > 122.15 || lat < 21.85 || lat > 25.45) return false;
  const eastCoastLimit = 121.06 + Math.max(0, lat - 22.2) * 0.28;
  const westCoastLimit = 120.03 + Math.max(0, lat - 22.25) * 0.09;
  if (lat > 24.65 && lon > 121.95) return false;
  if (lat < 22.3 && lon < 120.55) return false;
  return lon >= westCoastLimit && lon <= eastCoastLimit;
}

function offsetCoordinate(lon, lat, radiusKm, angle) {
  const latOffset = (Math.sin(angle) * radiusKm) / 110.574;
  const lonOffset = (Math.cos(angle) * radiusKm) / (111.32 * Math.cos(CesiumLib.Math.toRadians(lat)));
  return {
    lon: lon + lonOffset,
    lat: lat + latOffset
  };
}

function showWargameOverviewPanel() {
  if (mapDataset !== "wargame-projects" || !resourceCard || !wargameProjectFeatures.length) return;
  clearSelectedInfrastructureFocus();
  resourceCard.classList.add("is-overview");
  resourceCard.style.setProperty("--resource-accent", "#38bdf8");
  if (resourceCategory) resourceCategory.textContent = "Wargame Updates";
  if (resourceTitle) resourceTitle.textContent = "兵推即時狀況";
  if (scenarioList) renderWargameRecentUpdates();
  if (historyList) historyList.innerHTML = "";
  if (historyDetails) historyDetails.open = false;
  resourceCard.classList.remove("is-hidden");
  replayResourceCardAnimation();
}

function renderWargameRecentUpdates() {
  recentWargameProjects = getRecentWargameProjects();
  const allProjects = getAllWargameProjectsByUpdateTime();
  if (!allProjects.length) {
    scenarioList.innerHTML = '<li class="critical-scenario-empty">目前資料源沒有 8 月後可定位專案</li>';
    return;
  }
  const summary = summarizeWargameProjects(allProjects);
  const recentSummary = summarizeWargameProjects(recentWargameProjects);
  const latest = allProjects[0]?.properties || {};
  const feed = WARGAME_FEEDS[activeWargameFeed] || WARGAME_FEEDS.live;
  scenarioList.innerHTML = `
    <li>
      <div class="critical-overview-summary">
        <div class="critical-overview-stat">
          <span>8 月專案</span>
          <strong>${summary.total}</strong>
        </div>
        <div class="critical-overview-stat">
          <span>24 小時</span>
          <strong>${recentSummary.total}</strong>
        </div>
        <div class="critical-overview-stat">
          <span>涉及單位</span>
          <strong>${summary.groupCount}</strong>
        </div>
        <div class="critical-overview-stat">
          <span>關鍵設施</span>
          <strong>${summary.facilityTypeCount}</strong>
        </div>
      </div>
      <div class="critical-overview-latest">
        <span>${feed.label}｜最新異動</span>
        <b>${latest.name || "未命名專案"}</b>
        <span>${latest.group || "未填寫"}｜${latest.updatedAt || "--"}</span>
      </div>
      <select class="critical-overview-select" id="critical-overview-project-select" aria-label="選擇 8 月後專案">
        ${allProjects.map((feature, index) => {
          const props = feature.properties || {};
          return `<option value="${index}">${props.name || "未命名專案"}｜${props.updatedAt || "--"}</option>`;
        }).join("")}
      </select>
      <div class="critical-overview-meta" id="critical-overview-project-meta"></div>
    </li>
  `;
  const select = document.querySelector("#critical-overview-project-select");
  select?.addEventListener("change", () => renderSelectedWargameUpdate(Number(select.value), { fly: true }));
  renderSelectedWargameUpdate(0, { fly: false });
}

function summarizeWargameProjects(projects) {
  const groups = new Set();
  let cityTypeCount = 0;
  let facilityTypeCount = 0;
  projects.forEach((feature) => {
    const props = feature.properties || {};
    if (props.group) groups.add(props.group);
    if (props.category === "縣市" || props.category === "區域") cityTypeCount += 1;
    if (props.category === "兵棋設施" || props.category === "關鍵基礎設施") facilityTypeCount += 1;
  });
  return {
    total: projects.length,
    groupCount: groups.size,
    cityTypeCount,
    facilityTypeCount
  };
}

function renderSelectedWargameUpdate(index, options = {}) {
  const feature = getAllWargameProjectsByUpdateTime()[index];
  const meta = document.querySelector("#critical-overview-project-meta");
  if (!feature || !meta) return;
  const props = feature.properties || {};
  meta.innerHTML = `
    <b>${props.name || "未命名專案"}</b>
    <span>所屬群組：${props.group || "未填寫"}</span>
    <span>定位：${props.city || "--"}｜${props.category || "--"}</span>
    <span>最後修改：${props.updatedAt || "--"}</span>
    ${props.spreadCount > 1 ? `<span>同座標 ${props.spreadCount} 筆，已於地圖視覺打散</span>` : ""}
    <span>${props.status || "同步狀態待確認"}</span>
  `;
  if (options.fly) {
    const entity = nationalInfrastructureEntities.find((item) => item.properties?.id?.getValue?.() === props.id);
    if (entity) {
      setSelectedInfrastructureFocus(entity);
      focusInfrastructureEntity(entity);
    }
  }
}

function getAllWargameProjectsByUpdateTime() {
  return wargameProjectFeatures
    .filter((feature) => parseTaiwanDateTime(feature.properties?.updatedAt))
    .sort((a, b) => (parseTaiwanDateTime(b.properties?.updatedAt)?.getTime() || 0) - (parseTaiwanDateTime(a.properties?.updatedAt)?.getTime() || 0));
}

function renderWargameTimeline() {
  if (mapDataset !== "wargame-projects" || !timelineTrack) return;
  timelineItems = groupWargameProjectsByUpdateDay();

  if (timelineCount) timelineCount.textContent = `${timelineItems.length} 天`;
  if (!timelineItems.length) {
    timelineTrack.innerHTML = '<div class="critical-scenario-empty">沒有可顯示的最後更新時間</div>';
    return;
  }

  const startTime = new Date(2026, 7, 1, 0, 0, 0).getTime();
  const endTime = timelineItems[timelineItems.length - 1].date.getTime();
  const span = Math.max(1, endTime - startTime);
  timelineTrack.innerHTML = `
    <div class="critical-timeline-line"></div>
    ${timelineItems.map(({ date, features }, index) => {
      const props = features[features.length - 1]?.properties || {};
      const time = date;
      const position = timelineItems.length === 1 ? 50 : 4 + ((time.getTime() - startTime) / span) * 92;
      return `
        <button class="critical-timeline-point" type="button" data-timeline-day="${escapeHtmlAttribute(formatDateKey(time))}" style="left:${position}%;" aria-label="${escapeHtmlAttribute(formatTimelineDayLabel(time))} ${features.length} 筆"></button>
        <span class="critical-timeline-label" style="left:${position}%;">${formatTimelineLabel(time, index, timelineItems.length)}</span>
      `;
    }).join("")}
  `;

  timelineTrack.querySelectorAll("[data-timeline-day]").forEach((button) => {
    button.addEventListener("click", () => selectWargameDay(button.dataset.timelineDay));
  });
}

function groupWargameProjectsByUpdateDay() {
  const groups = new Map();
  wargameProjectFeatures.forEach((feature) => {
    const time = parseTaiwanDateTime(feature.properties?.updatedAt);
    if (!time) return;
    const key = formatDateKey(time);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date: new Date(time.getFullYear(), time.getMonth(), time.getDate()),
        features: []
      });
    }
    groups.get(key).features.push(feature);
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      features: group.features.sort((a, b) => (parseTaiwanDateTime(a.properties?.updatedAt)?.getTime() || 0) - (parseTaiwanDateTime(b.properties?.updatedAt)?.getTime() || 0))
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function selectWargameProjectById(projectId) {
  const entity = nationalInfrastructureEntities.find((item) => item.properties?.id?.getValue?.() === projectId);
  if (!entity) return;
  timelineTrack?.querySelectorAll(".critical-timeline-point").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.timelineProjectId === projectId);
  });
  const allIndex = getAllWargameProjectsByUpdateTime().findIndex((feature) => feature.properties?.id === projectId);
  const select = document.querySelector("#critical-overview-project-select");
  if (allIndex >= 0 && select) {
    select.value = String(allIndex);
    renderSelectedWargameUpdate(allIndex, { fly: false });
  }
  setSelectedInfrastructureFocus(entity);
  focusInfrastructureEntity(entity);
}

function selectWargameDay(dayKey) {
  const group = timelineItems.find((item) => item.key === dayKey);
  if (!group) return;
  timelineTrack?.querySelectorAll(".critical-timeline-point").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.timelineDay === dayKey);
  });
  const latestFeature = [...group.features]
    .sort((a, b) => (parseTaiwanDateTime(b.properties?.updatedAt)?.getTime() || 0) - (parseTaiwanDateTime(a.properties?.updatedAt)?.getTime() || 0))[0];
  const latestIndex = getAllWargameProjectsByUpdateTime().findIndex((feature) => feature.properties?.id === latestFeature?.properties?.id);
  const select = document.querySelector("#critical-overview-project-select");
  if (latestIndex >= 0 && select) {
    select.value = String(latestIndex);
    renderSelectedWargameUpdate(latestIndex, { fly: false });
  }
  applyTimelinePlaybackDayState(dayKey);
  const entity = nationalInfrastructureEntities.find((item) => item.properties?.id?.getValue?.() === latestFeature?.properties?.id);
  if (entity) focusInfrastructureEntity(entity);
}

function applyTimelinePlaybackState(currentProjectId) {
  const currentItem = timelineItems.find((item) => item.feature.properties?.id === currentProjectId);
  const currentTime = currentItem?.time?.getTime();
  if (!currentTime) return;
  const dimColor = CesiumLib.Color.fromCssColorString("#3f5f70");
  nationalInfrastructureEntities.forEach((entity) => {
    const entityTime = parseTaiwanDateTime(entity.properties?.updatedAt?.getValue?.());
    if (!entityTime) return;
    const isCurrent = entity.properties?.id?.getValue?.() === currentProjectId;
    const hasOccurred = entityTime.getTime() <= currentTime;
    entity.show = hasOccurred;
    if (entity.rangeEntity) entity.rangeEntity.show = hasOccurred;
    if (entity.pulseEntity) entity.pulseEntity.show = hasOccurred;
    if (!hasOccurred) return;

    if (entity.point) {
      entity.point.color = isCurrent ? CesiumLib.Color.fromCssColorString("#f8fbff") : dimColor.withAlpha(0.62);
      entity.point.pixelSize = isCurrent ? 18 : 9;
      entity.point.outlineColor = isCurrent ? CesiumLib.Color.fromCssColorString("#67e8f9") : CesiumLib.Color.fromCssColorString("#1e293b");
      entity.point.outlineWidth = isCurrent ? 4 : 1;
    }
    if (entity.label) {
      entity.label.fillColor = isCurrent ? CesiumLib.Color.WHITE : CesiumLib.Color.fromCssColorString("#94a3b8").withAlpha(0.62);
      entity.label.outlineWidth = isCurrent ? 4 : 2;
    }
    if (entity.rangeEntity?.ellipse) {
      const baseColor = isCurrent ? CesiumLib.Color.fromCssColorString("#67e8f9") : dimColor;
      entity.rangeEntity.ellipse.material = baseColor.withAlpha(isCurrent ? 0.026 : 0.004);
      entity.rangeEntity.ellipse.outlineColor = baseColor.withAlpha(isCurrent ? 0.72 : 0.16);
    }
    if (entity.pulseEntity?.pulseBase) {
      entity.pulseEntity.pulseBase.playbackCurrent = isCurrent;
      entity.pulseEntity.pulseBase.playbackDimmed = !isCurrent;
    }
  });
}

function applyTimelinePlaybackDayState(currentDayKey) {
  const currentGroup = timelineItems.find((item) => item.key === currentDayKey);
  if (!currentGroup) return;
  const currentTime = currentGroup.date.getTime();
  const currentIds = new Set(currentGroup.features.map((feature) => feature.properties?.id));
  const dimColor = CesiumLib.Color.fromCssColorString("#3f5f70");
  nationalInfrastructureEntities.forEach((entity) => {
    const entityTime = parseTaiwanDateTime(entity.properties?.updatedAt?.getValue?.());
    if (!entityTime) return;
    const entityDayTime = new Date(entityTime.getFullYear(), entityTime.getMonth(), entityTime.getDate()).getTime();
    const id = entity.properties?.id?.getValue?.();
    const isCurrent = currentIds.has(id);
    const hasOccurred = entityDayTime <= currentTime;
    entity.show = hasOccurred;
    if (entity.rangeEntity) entity.rangeEntity.show = hasOccurred;
    if (entity.pulseEntity) entity.pulseEntity.show = hasOccurred;
    if (!hasOccurred) return;

    if (entity.point) {
      entity.point.color = isCurrent ? CesiumLib.Color.fromCssColorString("#f8fbff") : dimColor.withAlpha(0.62);
      entity.point.pixelSize = isCurrent ? 18 : 9;
      entity.point.outlineColor = isCurrent ? CesiumLib.Color.fromCssColorString("#67e8f9") : CesiumLib.Color.fromCssColorString("#1e293b");
      entity.point.outlineWidth = isCurrent ? 4 : 1;
    }
    if (entity.label) {
      entity.label.fillColor = isCurrent ? CesiumLib.Color.WHITE : CesiumLib.Color.fromCssColorString("#94a3b8").withAlpha(0.62);
      entity.label.outlineWidth = isCurrent ? 4 : 2;
    }
    if (entity.rangeEntity?.ellipse) {
      const baseColor = isCurrent ? CesiumLib.Color.fromCssColorString("#67e8f9") : dimColor;
      entity.rangeEntity.ellipse.material = baseColor.withAlpha(isCurrent ? 0.026 : 0.004);
      entity.rangeEntity.ellipse.outlineColor = baseColor.withAlpha(isCurrent ? 0.72 : 0.16);
    }
    if (entity.pulseEntity?.pulseBase) {
      entity.pulseEntity.pulseBase.playbackCurrent = isCurrent;
      entity.pulseEntity.pulseBase.playbackDimmed = !isCurrent;
    }
  });
}

function resetTimelinePlaybackState() {
  nationalInfrastructureEntities.forEach((entity) => {
    const base = entity.timelineBase;
    entity.show = true;
    if (entity.rangeEntity) entity.rangeEntity.show = true;
    if (entity.pulseEntity) entity.pulseEntity.show = true;
    if (entity.point && base) {
      entity.point.color = base.color;
      entity.point.pixelSize = base.pointSize;
      entity.point.outlineColor = base.outlineColor;
      entity.point.outlineWidth = base.outlineWidth;
    }
    if (entity.label) {
      entity.label.fillColor = CesiumLib.Color.WHITE;
      entity.label.outlineWidth = mapDataset === "wargame-projects" ? 4 : 3;
    }
    if (entity.rangeEntity?.ellipse && base) {
      entity.rangeEntity.ellipse.material = base.color.withAlpha(mapDataset === "wargame-projects" ? 0.006 : 0.055);
      entity.rangeEntity.ellipse.outlineColor = base.color.withAlpha(mapDataset === "wargame-projects" ? 0.2 : 0.28);
    }
    if (entity.pulseEntity?.pulseBase) {
      entity.pulseEntity.pulseBase.playbackCurrent = false;
      entity.pulseEntity.pulseBase.playbackDimmed = false;
    }
  });
}

function startTimelinePlayback() {
  if (!timelineItems.length || timelinePlaybackTimer) return;
  timelinePlaybackActive = true;
  timelinePlaybackIndex = 0;
  timelinePlayButton?.classList.add("is-playing");
  if (timelinePlayButton) timelinePlayButton.textContent = "暫停";
  playTimelineStep();
  timelinePlaybackTimer = window.setInterval(playTimelineStep, 1600);
}

function stopTimelinePlayback() {
  if (timelinePlaybackTimer) {
    window.clearInterval(timelinePlaybackTimer);
    timelinePlaybackTimer = null;
  }
  timelinePlaybackActive = false;
  resetTimelinePlaybackState();
  timelinePlayButton?.classList.remove("is-playing");
  if (timelinePlayButton) timelinePlayButton.textContent = "循環播放";
}

function playTimelineStep() {
  if (!timelineItems.length) {
    stopTimelinePlayback();
    return;
  }
  const item = timelineItems[timelinePlaybackIndex];
  if (item?.key) {
    selectWargameDay(item.key);
  }
  timelinePlaybackIndex += 1;
  if (timelinePlaybackIndex >= timelineItems.length) {
    timelinePlaybackIndex = 0;
  }
}

function formatTimelineLabel(date, index, total) {
  if (total > 18 && index % Math.ceil(total / 8) !== 0 && index !== total - 1) return "";
  return formatTimelineDayLabel(date);
}

function formatTimelineDayLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getRecentWargameProjects() {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return wargameProjectFeatures
    .filter((feature) => {
      const updatedAt = parseTaiwanDateTime(feature.properties?.updatedAt);
      return updatedAt && now - updatedAt.getTime() <= oneDayMs && now - updatedAt.getTime() >= 0;
    })
    .sort((a, b) => (parseTaiwanDateTime(b.properties?.updatedAt)?.getTime() || 0) - (parseTaiwanDateTime(a.properties?.updatedAt)?.getTime() || 0));
}

function parseTaiwanDateTime(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  const isoLike = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (isoLike) {
    const [, year, month, day, hour, minute, second = "0"] = isoLike;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  }
  const zhLike = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(上午|下午)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!zhLike) return null;
  const [, year, month, day, period, rawHour, minute, second = "0"] = zhLike;
  let hour = Number(rawHour);
  if (period === "下午" && hour < 12) hour += 12;
  if (period === "上午" && hour === 12) hour = 0;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

function updateNationalToggleLabel(count) {
  const label = document.querySelector("#critical-national-toggle-label");
  if (!label) return;
  label.textContent = mapDataset === "wargame-projects" ? `兵棋專案 ${count} 處` : `全台 ${count} 處`;
}

function addNationalInfrastructurePoint(feature) {
  const [lon, lat] = feature.geometry?.coordinates || [];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const props = feature.properties || {};
  const isLocalFacility = Math.abs(lon - facility.lon) < 0.002 && Math.abs(lat - facility.lat) < 0.002;
  const labelFontSize = mapDataset === "wargame-projects" ? 22 : 17;
  const labelNearScale = mapDataset === "wargame-projects" ? 1.12 : 1;
  const labelFarScale = mapDataset === "wargame-projects" ? 0.52 : 0.34;
  const labelFadeStart = mapDataset === "wargame-projects" ? 260000 : 180000;
  const labelFadeEnd = mapDataset === "wargame-projects" ? 720000 : 520000;
  const temporalStyle = mapDataset === "wargame-projects" ? wargameTemporalStyle(props.updatedAt) : null;
  const wargameBaseColor = CesiumLib.Color.fromCssColorString("#67e8f9");
  const visualColor = mapDataset === "wargame-projects" ? wargameBaseColor : infrastructureColor(props.category);
  const labelText = mapDataset === "wargame-projects" ? props.group || props.name || props.id || "" : props.name || props.id || "";
  const point = viewer.entities.add({
    name: props.name || props.id || "關鍵基礎設施",
    properties: {
      criticalInfrastructure: true,
      id: props.id || "",
      name: props.name || "",
      category: props.category || "",
      status: props.status || "",
      group: props.group || "",
      createdAt: props.createdAt || "",
      updatedAt: props.updatedAt || "",
      keyword: props.keyword || "",
      originalLon: props.originalLon || lon,
      originalLat: props.originalLat || lat,
      spreadCount: props.spreadCount || 1,
      lon,
      lat
    },
    position: CesiumLib.Cartesian3.fromDegrees(lon, lat, isLocalFacility ? 72 : 1600),
    point: {
      pixelSize: mapDataset === "wargame-projects" ? 12 : isLocalFacility ? 13 : 10,
      color: visualColor,
      outlineColor: CesiumLib.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: labelText,
      font: `900 ${labelFontSize}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`,
      fillColor: CesiumLib.Color.WHITE,
      outlineColor: CesiumLib.Color.BLACK,
      outlineWidth: mapDataset === "wargame-projects" ? 4 : 3,
      style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new CesiumLib.Cartesian2(0, mapDataset === "wargame-projects" ? -30 : -24),
      scaleByDistance: new CesiumLib.NearFarScalar(80000, labelNearScale, 420000, labelFarScale),
      translucencyByDistance: new CesiumLib.NearFarScalar(labelFadeStart, 1, labelFadeEnd, 0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    description: `<strong>${props.name || "--"}</strong><br>ID: ${props.id || "--"}<br>類別: ${props.category || "--"}<br>縣市: ${props.city || "--"}<br>狀態: ${props.status || "--"}<br>${props.note || ""}`
  });
  const rangeRadius = infrastructureRangeRadius(props.category);
  const range = viewer.entities.add({
    name: `${props.id || props.name || "設施"} 可能基地範圍`,
    position: CesiumLib.Cartesian3.fromDegrees(lon, lat, isLocalFacility ? 64 : 1300),
    ellipse: {
      semiMajorAxis: rangeRadius,
      semiMinorAxis: rangeRadius,
      material: visualColor.withAlpha(isLocalFacility ? 0.16 : mapDataset === "wargame-projects" ? 0.006 : 0.055),
      outline: true,
      outlineColor: visualColor.withAlpha(isLocalFacility ? 0.56 : mapDataset === "wargame-projects" ? 0.2 : 0.28),
      height: isLocalFacility ? 62 : 1280
    },
    show: point.show
  });
  const pulse = viewer.entities.add({
    name: `${props.id || props.name || "設施"} 脈衝`,
    position: CesiumLib.Cartesian3.fromDegrees(lon, lat, isLocalFacility ? 70 : 1550),
    ellipse: {
      semiMajorAxis: 6500,
      semiMinorAxis: 6500,
      material: visualColor.withAlpha(0.16),
      outline: true,
      outlineColor: visualColor.withAlpha(0.42),
      height: isLocalFacility ? 68 : 1500
    },
    show: point.show
  });
  point.rangeEntity = range;
  point.pulseEntity = pulse;
  point.timelineBase = {
    color: visualColor,
    pointSize: mapDataset === "wargame-projects" ? 12 : isLocalFacility ? 13 : 10,
    outlineColor: CesiumLib.Color.WHITE,
    outlineWidth: 2,
    updatedAt: props.updatedAt || ""
  };
  pulse.pulseBase = {
    category: props.category || "",
    updatedAt: props.updatedAt || "",
    temporalIntensity: temporalStyle?.intensity || 0.45,
    pulseRadiusScale: temporalStyle?.pulseRadiusScale || 1,
    isLocalFacility
  };
  return point;
}

function infrastructureRangeRadius(category) {
  const radii = {
    "發電": 18000,
    "電力": 16000,
    "能源": 17000,
    "石化": 20000,
    "水資源": 14500,
    "科學園區": 16000,
    "通訊": 11000,
    "交通": 12500,
    "兵棋設施": 15000,
    "關鍵基礎設施": 15000,
    "縣市": 12000,
    "區域": 22000
  };
  return radii[category] || 13000;
}

function infrastructureColor(category) {
  return CesiumLib.Color.fromCssColorString(infrastructureColorValue(category));
}

function wargameTemporalStyle(updatedAt) {
  const date = parseTaiwanDateTime(updatedAt);
  const ageHours = date ? Math.max(0, (Date.now() - date.getTime()) / (60 * 60 * 1000)) : 24;
  const freshness = Math.max(0, 1 - Math.min(ageHours, 24) / 24);
  const color = wargameTemporalColor(updatedAt);
  return {
    color,
    intensity: freshness,
    pointSize: 9 + freshness * 8,
    outlineColor: freshness > 0.72
      ? CesiumLib.Color.fromCssColorString("#f8fbff")
      : CesiumLib.Color.fromCssColorString("#1e293b"),
    outlineWidth: freshness > 0.72 ? 4 : freshness > 0.38 ? 3 : 2,
    rangeRadiusScale: 0.34 + freshness * 1.18,
    pulseRadiusScale: 0.42 + freshness * 1.35,
    rangeAlpha: 0.006 + freshness * 0.026,
    rangeOutlineAlpha: 0.24 + freshness * 0.44
  };
}

function wargameTemporalColor(updatedAt) {
  const date = parseTaiwanDateTime(updatedAt);
  if (!date) return CesiumLib.Color.fromCssColorString("#475569");
  const ageHours = Math.max(0, (Date.now() - date.getTime()) / (60 * 60 * 1000));
  const t = Math.min(ageHours / 24, 1);
  const newest = CesiumLib.Color.fromCssColorString("#f8fbff");
  const fresh = CesiumLib.Color.fromCssColorString("#22d3ee");
  const mid = CesiumLib.Color.fromCssColorString("#2563eb");
  const old = CesiumLib.Color.fromCssColorString("#4c1d95");
  if (t < 0.24) {
    return CesiumLib.Color.lerp(newest, fresh, t / 0.24, new CesiumLib.Color());
  }
  if (t < 0.62) {
    return CesiumLib.Color.lerp(fresh, mid, (t - 0.24) / 0.38, new CesiumLib.Color());
  }
  return CesiumLib.Color.lerp(mid, old, (t - 0.62) / 0.38, new CesiumLib.Color());
}

function infrastructureColorValue(category) {
  const colors = {
    "發電": "#7dd3fc",
    "電力": "#7dd3fc",
    "能源": "#93c5fd",
    "石化": "#818cf8",
    "港口": "#38bdf8",
    "機場": "#93c5fd",
    "水資源": "#67e8f9",
    "科學園區": "#60a5fa",
    "交通": "#22d3ee",
    "通訊": "#a5b4fc",
    "兵棋設施": "#38bdf8",
    "關鍵基礎設施": "#38bdf8",
    "縣市": "#60a5fa",
    "區域": "#22d3ee"
  };
  return colors[category] || "#bae6fd";
}

function pulseColor(frameWave) {
  const cyan = CesiumLib.Color.fromCssColorString("#67e8f9");
  const blue = CesiumLib.Color.fromCssColorString("#60a5fa");
  const violet = CesiumLib.Color.fromCssColorString("#818cf8");
  if (frameWave > 0.72) return CesiumLib.Color.lerp(blue, violet, (frameWave - 0.72) / 0.28, new CesiumLib.Color());
  return CesiumLib.Color.lerp(cyan, blue, frameWave / 0.72, new CesiumLib.Color());
}

async function loadTyphoonTrack() {
  try {
    const [trackResponse, probabilityResponse] = await Promise.all([
      fetch(`${TYPHOON_TRACK_URL}?v=20260807-dynamic`, { cache: "force-cache" }),
      fetch(`${TYPHOON_WIND_PROBABILITY_URL}?v=20260807-dynamic`, { cache: "force-cache" })
    ]);
    if (!trackResponse.ok) throw new Error(`路徑 HTTP ${trackResponse.status}`);
    if (!probabilityResponse.ok) throw new Error(`影響範圍 HTTP ${probabilityResponse.status}`);
    const [trackGeojson, probabilityGeojson] = await Promise.all([
      trackResponse.json(),
      probabilityResponse.json()
    ]);
    const trackEntities = trackGeojson.features.map(addTyphoonFeature).filter(Boolean).flat();
    const probabilityEntities = probabilityGeojson.features.map((feature) => addTyphoonFeature(feature, { probability: true })).filter(Boolean).flat();
    typhoonEntities = [...probabilityEntities, ...trackEntities];
    typhoonAnimationFrames = buildTyphoonAnimationFrames(trackGeojson.features);
    addAnimatedTyphoon();
    startTyphoonAnimation();
  } catch (error) {
    showCriticalError(`颱風路徑資料讀取失敗：${error.message}`);
  }
}

function addTyphoonFeature(feature, options = {}) {
  const geom = feature.geometry || {};
  const props = feature.properties || {};
  if (geom.type === "LineString") return [addTyphoonLine(geom.coordinates, props)].filter(Boolean);
  if (geom.type === "Point") return [addTyphoonPoint(geom.coordinates, props)].filter(Boolean);
  if (geom.type === "Polygon") return [addTyphoonPolygon(geom.coordinates, props, options)].filter(Boolean);
  if (geom.type === "MultiPolygon") return geom.coordinates.map((polygon) => addTyphoonPolygon(polygon, props, options)).filter(Boolean);
  return [];
}

function addTyphoonLine(coords, props) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const isForecast = props.kind === "forecast-track";
  return viewer.entities.add({
    name: props.label || "颱風路徑",
    polyline: {
      positions: CesiumLib.Cartesian3.fromDegreesArray(coords.flat()),
      width: isForecast ? 4 : 5,
      clampToGround: true,
      material: isForecast
        ? new CesiumLib.PolylineDashMaterialProperty({
            color: CesiumLib.Color.fromCssColorString("#fb7185").withAlpha(0.92),
            dashLength: 18
          })
        : new CesiumLib.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: CesiumLib.Color.fromCssColorString("#67e8f9").withAlpha(0.95)
          })
    },
    description: `${props.label || "颱風路徑"}<br>${props.initialTime || ""}`
  });
}

function addTyphoonPoint(coord, props) {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const isForecast = props.kind === "forecast-center";
  return viewer.entities.add({
    name: props.label || "颱風中心",
    position: CesiumLib.Cartesian3.fromDegrees(coord[0], coord[1], 2200),
    point: {
      pixelSize: isForecast ? 9 : 10,
      color: CesiumLib.Color.fromCssColorString(isForecast ? "#fb7185" : "#67e8f9"),
      outlineColor: CesiumLib.Color.WHITE,
      outlineWidth: 2,
      scaleByDistance: new CesiumLib.NearFarScalar(100000, 1, 950000, 0.35),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    description: `${props.label || "颱風中心"}<br>${props.datetime || props.initialTime || ""}<br>氣壓: ${props.pressure_hpa || "--"} hPa<br>風速: ${props.maxWindSpeed_ms || "--"} m/s`
  });
}

function addTyphoonPolygon(rings, props, options = {}) {
  const ring = rings?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const isForecast = String(props.kind || "").startsWith("forecast");
  const isProbability = options.probability || Number.isFinite(Number(props.probability));
  const probability = Number(props.probability || 0);
  const palette = isProbability
    ? typhoonProbabilityStyle(probability)
    : typhoonCircleStyle(props.kind, isForecast);
  return viewer.entities.add({
    name: props.label || (isProbability ? `${probability}% 侵襲機率範圍` : "颱風影響範圍"),
    polygon: {
      hierarchy: CesiumLib.Cartesian3.fromDegreesArray(ring.flat()),
      material: palette.fill,
      outline: true,
      outlineColor: palette.outline,
      height: isProbability ? 1200 : 900,
      perPositionHeight: false
    },
    description: `${props.label || "颱風影響範圍"}<br>${props.datetime || props.validTime || ""}<br>${props.radius_km ? `半徑: ${props.radius_km} km` : ""}${probability ? `<br>侵襲機率: ${probability}%` : ""}`
  });
}

function typhoonCircleStyle(kind = "", isForecast = false) {
  const strongWind = String(kind).includes("25ms");
  const color = strongWind ? "#a78bfa" : (isForecast ? "#fb7185" : "#67e8f9");
  return {
    fill: CesiumLib.Color.fromCssColorString(color).withAlpha(strongWind ? 0.07 : 0.045),
    outline: CesiumLib.Color.fromCssColorString(color).withAlpha(strongWind ? 0.44 : 0.28)
  };
}

function typhoonProbabilityStyle(probability) {
  const alpha = Math.min(0.14, 0.035 + probability / 900);
  const color = probability >= 80 ? "#93c5fd" : probability >= 60 ? "#67e8f9" : probability >= 40 ? "#38bdf8" : "#818cf8";
  return {
    fill: CesiumLib.Color.fromCssColorString(color).withAlpha(alpha),
    outline: CesiumLib.Color.fromCssColorString(color).withAlpha(0.28)
  };
}

function buildTyphoonAnimationFrames(features) {
  const circlesByTime = new Map();
  features.forEach((feature) => {
    const props = feature.properties || {};
    if (feature.geometry?.type !== "Polygon") return;
    if (!String(props.kind || "").includes("15ms-circle")) return;
    const radiusKm = Number(props.radius_km || props.circle15ms_km);
    if (props.datetime && Number.isFinite(radiusKm)) circlesByTime.set(props.datetime, radiusKm);
  });
  return features
    .filter((feature) => feature.geometry?.type === "Point" && String(feature.properties?.kind || "").includes("center"))
    .map((feature) => {
      const props = feature.properties || {};
      const [lon, lat] = feature.geometry.coordinates;
      return {
        lon,
        lat,
        datetime: props.datetime || props.initialTime || "",
        label: props.label || `${props.intlName || "DOLPHIN"} ${props.name || "白海豚"}`,
        pressure: props.pressure_hpa || "--",
        wind: props.maxWindSpeed_ms || "--",
        radiusKm: circlesByTime.get(props.datetime) || Number(props.circle15ms_km) || 120,
        forecast: String(props.kind || "").startsWith("forecast"),
        order: Number(props.frameIndex || props.forecastHour || 0)
      };
    })
    .filter((frame) => Number.isFinite(frame.lon) && Number.isFinite(frame.lat))
    .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)) || a.order - b.order);
}

function addAnimatedTyphoon() {
  if (!typhoonAnimationFrames.length) return;
  const frame = typhoonAnimationFrames[0];
  animatedTyphoonWindEntity = viewer.entities.add({
    name: "颱風動態影響圈",
    position: CesiumLib.Cartesian3.fromDegrees(frame.lon, frame.lat, 1600),
    ellipse: {
      semiMajorAxis: frame.radiusKm * 1000,
      semiMinorAxis: frame.radiusKm * 1000,
      material: CesiumLib.Color.fromCssColorString("#67e8f9").withAlpha(0.16),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#e0f2fe").withAlpha(0.72),
      height: 1600
    }
  });
  animatedTyphoonEntity = viewer.entities.add({
    name: "颱風動態中心",
    position: CesiumLib.Cartesian3.fromDegrees(frame.lon, frame.lat, 4200),
    point: {
      pixelSize: 20,
      color: CesiumLib.Color.fromCssColorString("#e0f2fe"),
      outlineColor: CesiumLib.Color.fromCssColorString("#22d3ee"),
      outlineWidth: 5,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: "DOLPHIN 白海豚",
      font: "800 14px sans-serif",
      fillColor: CesiumLib.Color.WHITE,
      outlineColor: CesiumLib.Color.BLACK,
      outlineWidth: 3,
      style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new CesiumLib.Cartesian2(0, -30),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
  typhoonEntities.push(animatedTyphoonWindEntity, animatedTyphoonEntity);
  updateTyphoonAnimation();
}

function startTyphoonAnimation() {
  if (typhoonAnimationTimer || !typhoonAnimationFrames.length) return;
  typhoonAnimationTimer = window.setInterval(updateTyphoonAnimation, 850);
}

function stopTyphoonAnimation() {
  if (!typhoonAnimationTimer) return;
  window.clearInterval(typhoonAnimationTimer);
  typhoonAnimationTimer = null;
}

function updateTyphoonAnimation() {
  if (!animatedTyphoonEntity || !animatedTyphoonWindEntity || !typhoonAnimationFrames.length) return;
  const frame = typhoonAnimationFrames[typhoonAnimationIndex % typhoonAnimationFrames.length];
  const position = CesiumLib.Cartesian3.fromDegrees(frame.lon, frame.lat, 4200);
  const windPosition = CesiumLib.Cartesian3.fromDegrees(frame.lon, frame.lat, 1600);
  const color = CesiumLib.Color.fromCssColorString(frame.forecast ? "#fb7185" : "#67e8f9");
  animatedTyphoonEntity.position = position;
  animatedTyphoonEntity.point.outlineColor = color;
  animatedTyphoonEntity.label.text = `${frame.forecast ? "預測" : "實測"} ${frame.datetime.slice(5, 16).replace("T", " ")}`;
  animatedTyphoonEntity.description = `${frame.label}<br>${frame.datetime}<br>氣壓: ${frame.pressure} hPa<br>風速: ${frame.wind} m/s`;
  animatedTyphoonWindEntity.position = windPosition;
  animatedTyphoonWindEntity.ellipse.semiMajorAxis = frame.radiusKm * 1000;
  animatedTyphoonWindEntity.ellipse.semiMinorAxis = frame.radiusKm * 1000;
  animatedTyphoonWindEntity.ellipse.material = color.withAlpha(frame.forecast ? 0.1 : 0.14);
  animatedTyphoonWindEntity.ellipse.outlineColor = color.withAlpha(0.82);
  typhoonAnimationIndex += 1;
  viewer.scene.requestRender();
}

function startInfrastructurePulse() {
  window.setInterval(() => {
    pulseFrame = (pulseFrame + 1) % 240;
    nationalInfrastructureEntities.forEach((entity, index) => {
      const pulse = entity.pulseEntity;
      if (!pulse) return;
      pulse.show = entity.show;
      const playbackBoost = pulse.pulseBase?.playbackCurrent ? 1.35 : pulse.pulseBase?.playbackDimmed ? 0.22 : 1;
      const intensity = (mapDataset === "wargame-projects" ? pulse.pulseBase?.temporalIntensity ?? 0.45 : 1) * playbackBoost;
      const radiusScale = mapDataset === "wargame-projects" ? pulse.pulseBase?.pulseRadiusScale ?? 1 : 1;
      const phase = (pulseFrame + index * 11) / 48;
      const wave = 0.5 + Math.sin(phase) * 0.5;
      const baseRadius = pulse.pulseBase?.isLocalFacility ? 95 : (3600 + intensity * 2200) * radiusScale;
      const radius = baseRadius + wave * (pulse.pulseBase?.isLocalFacility ? 80 : (2100 + intensity * 4300) * radiusScale);
      pulse.ellipse.semiMajorAxis = radius;
      pulse.ellipse.semiMinorAxis = radius;
      const glow = mapDataset === "wargame-projects"
        ? CesiumLib.Color.fromCssColorString("#67e8f9")
        : pulseColor(wave);
      pulse.ellipse.material = glow.withAlpha(mapDataset === "wargame-projects" ? 0.006 + intensity * 0.026 + wave * 0.018 : 0.035 + wave * 0.08);
      pulse.ellipse.outlineColor = glow.withAlpha(mapDataset === "wargame-projects" ? 0.22 + intensity * 0.44 + wave * 0.16 : 0.18 + wave * 0.34);
    });
    viewer.scene.requestRender();
  }, 90);
}

function addLiveCameras() {
  liveCameras.forEach((camera, index) => {
    cctvEntities.push(viewer.entities.add({
      name: camera.name,
      position: CesiumLib.Cartesian3.fromDegrees(camera.lon, camera.lat, 26),
      point: {
        pixelSize: 13,
        color: CesiumLib.Color.fromCssColorString("#fb7185"),
        outlineColor: CesiumLib.Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: camera.name,
        font: "800 13px sans-serif",
        fillColor: CesiumLib.Color.WHITE,
        outlineColor: CesiumLib.Color.BLACK,
        outlineWidth: 3,
        style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new CesiumLib.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      description: `<strong>${camera.name}</strong><br>${camera.distance}<br><button type="button" onclick="window.selectLiveCamera?.(${index})">切換頁面內影像</button><br><a href="${camera.url}" target="_blank" rel="noopener">開啟原始影像</a>`
    }));
  });
}

window.selectLiveCamera = selectLiveCamera;

function selectLiveCamera(index, options = {}) {
  const camera = liveCameras[index];
  if (!camera) return;
  selectedLiveCameraIndex = index;
  const title = document.querySelector("#critical-cctv-title");
  const link = document.querySelector("#critical-cctv-link");
  if (title) title.textContent = camera.name;
  if (link) link.href = camera.url;
  document.querySelectorAll("[data-cctv-index]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.cctvIndex) === index);
  });
  if (options.fly === false) return;
  viewer.camera.flyTo({
    destination: CesiumLib.Cartesian3.fromDegrees(camera.lon, camera.lat, 920),
    orientation: {
      heading: CesiumLib.Math.toRadians(35),
      pitch: CesiumLib.Math.toRadians(-35),
      roll: 0
    },
    duration: 0.9
  });
}

function setVideoStripCollapsed(collapsed) {
  document.querySelector("#critical-floating-video-card")?.classList.toggle("is-collapsed", collapsed);
}

function initLiveVideos() {
  liveCameras.forEach((camera, index) => {
    const video = document.querySelector(`#critical-cctv-video-${index}`);
    if (!video) return;
    video.title = camera.name;
    setVideoSource(video, camera.streamUrl, index);
  });
}

function setVideoSource(video, streamUrl, index = 0) {
  if (activeHls[index]) {
    activeHls[index].destroy();
    activeHls[index] = null;
  }
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = streamUrl;
    video.play().catch(() => {});
    return;
  }
  if (window.Hls?.isSupported()) {
    activeHls[index] = new window.Hls({
      lowLatencyMode: true,
      liveSyncDurationCount: 3
    });
    activeHls[index].loadSource(streamUrl);
    activeHls[index].attachMedia(video);
    activeHls[index].on(window.Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
    return;
  }
  video.removeAttribute("src");
}

async function loadRoads() {
  try {
    const response = await fetch(`${ROADS_URL}?v=20260807-real-roads`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();
    roadFlows = geojson.features
      .map(roadFeatureToFlow)
      .filter((road) => road.points.length >= 2)
      .sort((a, b) => Number(b.primary) - Number(a.primary));
    addRoadFlows();
    startRoadFlow();
  } catch (error) {
    showCriticalError(`真實道路資料讀取失敗：${error.message}`);
  }
}

function roadFeatureToFlow(feature) {
  const props = feature.properties || {};
  const name = props.name || "未命名道路";
  const coords = feature.geometry?.coordinates || [];
  return {
    name,
    highway: props.highway || "",
    primary: false,
    points: coords.map(([lon, lat]) => [lon, lat])
  };
}

function addRoadFlows() {
  roadEntities.forEach((entity) => viewer.entities.remove(entity));
  roadPulseEntities.forEach((entity) => viewer.entities.remove(entity));
  roadEntities = [];
  roadPulseEntities = [];
  roadFlows.forEach((road, roadIndex) => {
    const degrees = road.points.flat();
    const color = road.primary ? "#67e8f9" : "#38bdf8";
    const alpha = road.primary ? 0.95 : 0.34;
    const glowWidth = road.primary ? 11 : 5;
    const coreWidth = road.primary ? 3 : 1.5;
    const glow = viewer.entities.add({
      name: `${road.name} 流光路廊`,
      polyline: {
        positions: CesiumLib.Cartesian3.fromDegreesArray(degrees),
        width: glowWidth,
        clampToGround: true,
        material: new CesiumLib.PolylineGlowMaterialProperty({
          glowPower: road.primary ? 0.26 : 0.14,
          taperPower: 0.55,
          color: CesiumLib.Color.fromCssColorString(color).withAlpha(alpha)
        })
      }
    });
    const core = viewer.entities.add({
      name: `${road.name} 路線`,
      polyline: {
        positions: CesiumLib.Cartesian3.fromDegreesArray(degrees),
        width: coreWidth,
        clampToGround: true,
        material: CesiumLib.Color.fromCssColorString("#ecfeff").withAlpha(road.primary ? 0.92 : 0.3)
      }
    });
    roadEntities.push(glow, core);

    const pulseCount = road.primary ? 6 : 1;
    for (let index = 0; index < pulseCount; index += 1) {
      const pulse = viewer.entities.add({
        name: `${road.name} 流動光點`,
        position: CesiumLib.Cartesian3.fromDegrees(road.points[0][0], road.points[0][1], 3),
        point: {
          pixelSize: road.primary ? 10 : 6,
          color: CesiumLib.Color.fromCssColorString(road.primary ? "#ecfeff" : "#bae6fd").withAlpha(road.primary ? 1 : 0.45),
          outlineColor: CesiumLib.Color.fromCssColorString("#22d3ee").withAlpha(road.primary ? 1 : 0.45),
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      pulse.roadFlow = { roadIndex, offset: index / pulseCount };
      roadPulseEntities.push(pulse);
    }
  });
}

function startRoadFlow() {
  if (roadFlowTimer) return;
  roadFlowTimer = window.setInterval(updateRoadFlow, 70);
}

function stopRoadFlow() {
  if (!roadFlowTimer) return;
  window.clearInterval(roadFlowTimer);
  roadFlowTimer = null;
}

function updateRoadFlow() {
  roadFlowFrame = (roadFlowFrame + 1) % 1000;
  roadPulseEntities.forEach((entity) => {
    const meta = entity.roadFlow;
    const road = roadFlows[meta.roadIndex];
    const progress = (roadFlowFrame / (road.primary ? 130 : 220) + meta.offset) % 1;
    const [lon, lat] = interpolatePath(road.points, progress);
    entity.position = CesiumLib.Cartesian3.fromDegrees(lon, lat, 3);
    const wave = 0.5 + Math.sin((progress + meta.offset) * Math.PI * 2) * 0.5;
    entity.point.pixelSize = road.primary ? 8 + wave * 6 : 4 + wave * 2;
  });
  viewer.scene.requestRender();
}

function interpolatePath(points, progress) {
  if (points.length === 1) return points[0];
  const segmentCount = points.length - 1;
  const scaled = progress * segmentCount;
  const index = Math.min(Math.floor(scaled), segmentCount - 1);
  const local = scaled - index;
  const [lonA, latA] = points[index];
  const [lonB, latB] = points[index + 1];
  return [
    lonA + (lonB - lonA) * local,
    latA + (latB - latA) * local
  ];
}

async function loadBuildings() {
  setBuildingStatus("讀取中");
  try {
    const response = await fetch(`${BUILDINGS_URL}?v=20260807`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();
    buildingEntities = geojson.features.map(addBuilding).filter(Boolean);
    setBuildingStatus(`${buildingEntities.length} 棟`);
    viewer.scene.requestRender();
  } catch (error) {
    setBuildingStatus("讀取失敗");
    showCriticalError(`建物資料讀取失敗：${error.message}`);
  }
}

function addBuilding(feature) {
  const ring = feature.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const positions = ring.flatMap(([lon, lat]) => [lon, lat]);
  const props = feature.properties || {};
  const height = buildingHeight(props);
  return viewer.entities.add({
    name: props.code || `Building ${props.ID || props.record || ""}`,
    polygon: {
      hierarchy: CesiumLib.Cartesian3.fromDegreesArray(positions),
      height: 0,
      extrudedHeight: height,
      material: buildingColor(height).withAlpha(0.72),
      outline: true,
      outlineColor: CesiumLib.Color.fromCssColorString("#f8fafc").withAlpha(0.35)
    },
    description: `周邊建物<br>ID: ${props.ID || props.code || props.record || "--"}<br>MDATE: ${props.MDATE || "--"}`
  });
}

function buildingHeight(props) {
  const seed = Number.parseInt(props.ID || props.record || "0", 10) || 0;
  return 12 + (seed % 7) * 5;
}

function buildingColor(height) {
  if (height >= 38) return CesiumLib.Color.fromCssColorString("#fef3c7");
  if (height >= 28) return CesiumLib.Color.fromCssColorString("#fde68a");
  return CesiumLib.Color.fromCssColorString("#facc15");
}

function setBuildingStatus(text) {
  const element = document.querySelector("#critical-building-status");
  if (element) element.textContent = text;
}

function showCriticalError(message) {
  const container = document.querySelector("#critical-container");
  if (!container) return;
  const panel = document.createElement("div");
  panel.className = "cesium-error-panel";
  panel.textContent = message;
  container.append(panel);
}

function checkCesiumCanvas() {
  const canvas = document.querySelector("#critical-container canvas");
  if (!canvas) {
    showCriticalError("Cesium canvas 沒有建立，請重新整理或確認瀏覽器支援 WebGL。");
    return;
  }
  const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!context) {
    showCriticalError("瀏覽器沒有啟用 WebGL，Cesium 3D 地圖無法顯示。");
  }
}
