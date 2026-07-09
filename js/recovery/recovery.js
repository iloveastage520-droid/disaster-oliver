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
  if (element) element.textContent = formatTaipeiRocDateTime(new Date());
}

function updateRecoveryTitle() {
  const element = document.querySelector("#recovery-title");
  if (!element) return;

  element.textContent = "陽明分處災後市容復原作業情形統計";
}

function formatTaipeiRocDateTime(date) {
  const parts = taipeiDateParts(date);
  const rocYear = Number(parts.year) - 1911;
  return `${rocYear}年${parts.month}月${parts.day}日${parts.hour}時${parts.minute}分`;
}

function taipeiDateParts(date) {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function showLoadError() {
  const element = document.querySelector("#selected-road-name");
  if (element) element.textContent = "復原資料載入失敗";
}

document.addEventListener("DOMContentLoaded", initRecoveryPage);
