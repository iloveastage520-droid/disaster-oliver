import { loadRecoveryDataset, normalizeRecoveryDataset } from "./excel-parser.js";
import { calculateStatistics } from "./statistics.js";
import { renderDashboard, renderLayerStatus, setRecoveryRowSelectHandler } from "./dashboard.js";
import { initRecoveryMap, createRecoveryLayer, createLayerControl, focusRecoveryRoad, RECOVERY_LAYER_NAMES } from "./map-layer.js";
import { renderTimeline } from "./timeline.js";

async function initRecoveryPage() {
  const mapElement = document.querySelector("#recovery-map");
  if (!mapElement) return;

  const { map, baseLayers } = initRecoveryMap();
  updateRecoveryTitle();
  renderTimeline();
  renderLayerStatus(RECOVERY_LAYER_NAMES);

  try {
    const geojson = normalizeRecoveryDataset(await loadRecoveryDataset());
    const recoveryLayer = createRecoveryLayer(map, geojson);
    createLayerControl(map, baseLayers, recoveryLayer);
    setRecoveryRowSelectHandler((featureId) => focusRecoveryRoad(map, featureId));
    renderDashboard(geojson.features, calculateStatistics(geojson.features));
    updateLastUpdate(geojson.metadata?.lastUpdate);
  } catch (error) {
    console.error(error);
    showLoadError();
  }
}

function updateLastUpdate(value) {
  const element = document.querySelector("#recovery-last-update");
  if (element && value) element.textContent = value;
}

function updateRecoveryTitle() {
  const element = document.querySelector("#recovery-title");
  if (!element) return;

  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric"
  }).formatToParts(new Date());
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (month && day) element.textContent = `${month}/${day} 北水處及廠商支援情形統計`;
}

function showLoadError() {
  const element = document.querySelector("#selected-road-name");
  if (element) element.textContent = "復原資料載入失敗";
}

document.addEventListener("DOMContentLoaded", initRecoveryPage);
