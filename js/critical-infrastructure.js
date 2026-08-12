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
const TYPHOON_TRACK_URL = "../data/cwa-typhoon-track.geojson";
const TYPHOON_WIND_PROBABILITY_URL = "../data/cwa-typhoon-wind-probability.geojson";

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
    url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    credit: "CartoDB Dark Matter, OpenStreetMap",
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
    destination: CesiumLib.Cartesian3.fromDegrees(121.0, 23.75, 820000),
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
const resourceCard = document.querySelector("#critical-resource-card");
const resourceCategory = document.querySelector("#critical-resource-category");
const resourceTitle = document.querySelector("#critical-resource-title");
const resourceList = document.querySelector("#critical-resource-list");
const scenarioList = document.querySelector("#critical-scenario-list");
const resourceClose = document.querySelector("#critical-resource-close");

document.querySelectorAll("[data-camera]").forEach((button) => {
  button.addEventListener("click", () => flyToView(button.dataset.camera));
});

document.querySelector("#critical-basemap-select")?.addEventListener("change", (event) => {
  setBasemap(event.target.value);
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
  });
});

document.querySelector("#critical-typhoon-toggle").addEventListener("change", (event) => {
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
  resourceCard?.classList.add("is-hidden");
  clearSelectedInfrastructureFocus();
});

setCameraView("low");
addFacility();
addLiveCameras();
addRadius();
loadNationalInfrastructure();
loadTyphoonTrack();
loadRoads();
loadBuildings();
initLiveVideos();
selectLiveCamera(0, { fly: false });
setVideoStripCollapsed(true);
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
  const lon = Number(props.lon?.getValue?.());
  const lat = Number(props.lat?.getValue?.());
  const resources = buildFacilityResources(category, name);
  resourceCard?.style.setProperty("--resource-accent", infrastructureColorValue(category));
  if (resourceCategory) resourceCategory.textContent = `${category} | ${id}`;
  if (resourceTitle) resourceTitle.textContent = name;
  if (resourceList) {
    resourceList.innerHTML = resources.items.map((item) => `
      <li>
        <span aria-hidden="true">${item.icon}</span>
        <span>${item.label}</span>
        <b>${item.value}</b>
      </li>
    `).join("");
  }
  renderScenarioList(name, category);
  resourceCard?.classList.remove("is-hidden");
  replayResourceCardAnimation();
}

function replayResourceCardAnimation() {
  if (!resourceCard) return;
  resourceCard.classList.remove("is-active");
  void resourceCard.offsetWidth;
  resourceCard.classList.add("is-active");
}

function renderScenarioList(name, category) {
  if (!scenarioList) return;
  const scenarioBase = category === "水資源" ? "水庫" : category === "石化" ? "廠區" : category === "通訊" ? "通訊站" : "設施";
  const scenarios = [
    {
      title: `${name}${scenarioBase}緊急應變`,
      agency: "內政部警政署保安警察第二總隊",
      time: "2026/06/17 15:08"
    },
    {
      title: `總隊-${name}支援調度`,
      agency: "內政部警政署保安警察第二總隊",
      time: "2026/06/17 15:08"
    }
  ];
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
  const staff = 14 + categoryBoost * 2 + seed;
  const readiness = Math.min(99, 90 + categoryBoost + seed);
  return {
    staff,
    readiness,
    comms: readiness >= 94 ? "正常" : "需複核",
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
    const response = await fetch(`${NATIONAL_INFRASTRUCTURE_URL}?v=20260812-ncdr`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();
    nationalInfrastructureEntities = geojson.features.map(addNationalInfrastructurePoint).filter(Boolean);
  } catch (error) {
    showCriticalError(`全台設施資料讀取失敗：${error.message}`);
  }
}

function addNationalInfrastructurePoint(feature) {
  const [lon, lat] = feature.geometry?.coordinates || [];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const props = feature.properties || {};
  const isLocalFacility = Math.abs(lon - facility.lon) < 0.002 && Math.abs(lat - facility.lat) < 0.002;
  const point = viewer.entities.add({
    name: props.name || props.id || "關鍵基礎設施",
    properties: {
      criticalInfrastructure: true,
      id: props.id || "",
      name: props.name || "",
      category: props.category || "",
      status: props.status || "",
      lon,
      lat
    },
    position: CesiumLib.Cartesian3.fromDegrees(lon, lat, isLocalFacility ? 72 : 1600),
    point: {
      pixelSize: isLocalFacility ? 13 : 10,
      color: infrastructureColor(props.category),
      outlineColor: CesiumLib.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: props.name || props.id || "",
      font: '800 17px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
      fillColor: CesiumLib.Color.WHITE,
      outlineColor: CesiumLib.Color.BLACK,
      outlineWidth: 3,
      style: CesiumLib.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new CesiumLib.Cartesian2(0, -24),
      scaleByDistance: new CesiumLib.NearFarScalar(80000, 1, 380000, 0.34),
      translucencyByDistance: new CesiumLib.NearFarScalar(180000, 1, 520000, 0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    description: `<strong>${props.name || "--"}</strong><br>ID: ${props.id || "--"}<br>類別: ${props.category || "--"}<br>縣市: ${props.city || "--"}<br>狀態: ${props.status || "--"}<br>${props.note || ""}`
  });
  const pulse = viewer.entities.add({
    name: `${props.id || props.name || "設施"} 脈衝`,
    position: CesiumLib.Cartesian3.fromDegrees(lon, lat, isLocalFacility ? 70 : 1550),
    ellipse: {
      semiMajorAxis: 6500,
      semiMinorAxis: 6500,
      material: infrastructureColor(props.category).withAlpha(0.16),
      outline: true,
      outlineColor: infrastructureColor(props.category).withAlpha(0.42),
      height: isLocalFacility ? 68 : 1500
    },
    show: point.show
  });
  point.pulseEntity = pulse;
  pulse.pulseBase = {
    category: props.category || "",
    isLocalFacility
  };
  return point;
}

function infrastructureColor(category) {
  return CesiumLib.Color.fromCssColorString(infrastructureColorValue(category));
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
    "通訊": "#a5b4fc"
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
      const phase = (pulseFrame + index * 11) / 48;
      const wave = 0.5 + Math.sin(phase) * 0.5;
      const baseRadius = pulse.pulseBase?.isLocalFacility ? 95 : 5200;
      const radius = baseRadius + wave * (pulse.pulseBase?.isLocalFacility ? 80 : 4200);
      pulse.ellipse.semiMajorAxis = radius;
      pulse.ellipse.semiMinorAxis = radius;
      const glow = pulseColor(wave);
      pulse.ellipse.material = glow.withAlpha(0.035 + wave * 0.08);
      pulse.ellipse.outlineColor = glow.withAlpha(0.18 + wave * 0.34);
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
