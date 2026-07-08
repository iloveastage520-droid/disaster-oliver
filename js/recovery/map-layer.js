import { renderSelectedRoad } from "./dashboard.js";

export const RECOVERY_LAYER_NAMES = [
  "復原進度",
  "監視器",
  "倒伏樹木",
  "道路封閉",
  "搶修車輛",
  "雨量",
  "災情通報",
  "停電",
  "停水",
  "醫療資源"
];

const STATUS_STYLES = {
  Completed: "#22c55e",
  "In Progress": "#facc15",
  "Not Started": "#ef4444"
};

let activeLayer;

export function initRecoveryMap() {
  const map = L.map("recovery-map", {
    center: [25.039, 121.548],
    zoom: 13,
    zoomControl: true,
    fullscreenControl: true
  });

  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; 開放街圖貢獻者"
  }).addTo(map);

  L.control.scale({ imperial: false }).addTo(map);

  return { map, baseLayers: { 開放街圖: osm } };
}

export function createRecoveryLayer(map, geojson) {
  activeLayer = L.geoJSON(geojson, {
    style: roadStyle,
    onEachFeature: (feature, layer) => bindRoadEvents(map, feature, layer)
  }).addTo(map);

  if (activeLayer.getLayers().length) {
    map.fitBounds(activeLayer.getBounds(), { padding: [28, 28] });
  }

  return activeLayer;
}

export function createLayerControl(map, baseLayers, recoveryLayer) {
  const overlays = {
    復原進度: recoveryLayer,
    監視器: L.layerGroup(),
    倒伏樹木: L.layerGroup(),
    道路封閉: L.layerGroup(),
    搶修車輛: L.layerGroup(),
    雨量: L.layerGroup(),
    災情通報: L.layerGroup(),
    停電: L.layerGroup(),
    停水: L.layerGroup(),
    醫療資源: L.layerGroup()
  };

  Object.entries(overlays).forEach(([name, layer]) => {
    if (name !== "復原進度") layer.addTo(map);
  });

  return L.control.layers(baseLayers, overlays, {
    position: "topright",
    collapsed: false,
    autoZIndex: true
  }).addTo(map);
}

function roadStyle(feature) {
  return {
    color: STATUS_STYLES[feature.properties.status] || STATUS_STYLES["Not Started"],
    weight: 6,
    opacity: 0.9,
    lineCap: "round",
    lineJoin: "round"
  };
}

function bindRoadEvents(map, feature, layer) {
  layer.bindTooltip(feature.properties.roadName, {
    sticky: true,
    direction: "top"
  });

  layer.bindPopup(popupHtml(feature.properties), {
    maxWidth: 320
  });

  layer.on("mouseover", () => {
    layer.setStyle({ weight: 8, opacity: 1 });
    layer.bringToFront();
  });

  layer.on("mouseout", () => {
    if (!isActive(layer)) layer.setStyle(roadStyle(feature));
  });

  layer.on("click", () => {
    setActiveRoad(layer);
    renderSelectedRoad(feature.properties);
    map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 15 });
  });
}

function setActiveRoad(selectedLayer) {
  activeLayer.eachLayer((layer) => {
    layer.setStyle({
      ...roadStyle(layer.feature),
      weight: layer === selectedLayer ? 8 : 6,
      opacity: layer === selectedLayer ? 1 : 0.9
    });
    layer._recoveryActive = layer === selectedLayer;
  });
}

function isActive(layer) {
  return Boolean(layer._recoveryActive);
}

function popupHtml(properties) {
  return `
    <strong>${escapeHtml(properties.roadName)}</strong><br>
    ${escapeHtml(properties.responsibleUnit)} / ${escapeHtml(properties.contractor)}<br>
    狀態：${escapeHtml(statusLabel(properties.status))}（${properties.completionPercentage}%）<br>
    預計完成：${escapeHtml(properties.estimatedFinishTime)}<br>
    ${escapeHtml(properties.remark || "")}
  `;
}

function statusLabel(status) {
  return {
    Completed: "已完成",
    "In Progress": "處理中",
    "Not Started": "未開始"
  }[status] || "未開始";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}
