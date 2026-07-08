import { loadRecoveryDataset, normalizeRecoveryDataset } from "./excel-parser.js";
import { calculateStatistics } from "./statistics.js";
import { renderDashboard, renderLayerStatus } from "./dashboard.js";
import { initRecoveryMap, createRecoveryLayer, createLayerControl, RECOVERY_LAYER_NAMES } from "./map-layer.js";
import { renderTimeline } from "./timeline.js";

async function initRecoveryPage() {
  const mapElement = document.querySelector("#recovery-map");
  if (!mapElement) return;

  const { map, baseLayers } = initRecoveryMap();
  renderTimeline();
  renderLayerStatus(RECOVERY_LAYER_NAMES);

  try {
    const geojson = normalizeRecoveryDataset(await loadRecoveryDataset());
    const recoveryLayer = createRecoveryLayer(map, geojson);
    createLayerControl(map, baseLayers, recoveryLayer);
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

function showLoadError() {
  const element = document.querySelector("#selected-road-name");
  if (element) element.textContent = "復原資料載入失敗";
}

document.addEventListener("DOMContentLoaded", initRecoveryPage);
