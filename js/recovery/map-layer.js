import { renderSelectedRoad } from "./dashboard.js";

export const RECOVERY_LAYER_NAMES = [
  "復原進度"
];

const STATUS_STYLES = {
  Completed: "#00aeef",
  "In Progress": "#ffb000",
  "Not Started": "#e84a5f"
};

const GROUP_STYLES = {
  "組1": "#00aeef",
  "組2": "#ffb000",
  "組3": "#f15bb5",
  "組4": "#7c3aed",
  "組5": "#14b8a6",
  "組6": "#f97316"
};

let activeLayer;
const layerByFeatureId = new Map();

export function initRecoveryMap() {
  const map = L.map("recovery-map", {
    center: [25.039, 121.548],
    zoom: 13,
    zoomControl: true,
    fullscreenControl: true
  });

  const googleMap = L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
    maxZoom: 20,
    subdomains: ["0", "1", "2", "3"],
    attribution: "&copy; Google"
  }).addTo(map);

  const googleSatellite = L.tileLayer("https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    maxZoom: 20,
    subdomains: ["0", "1", "2", "3"],
    attribution: "&copy; Google"
  });

  L.control.scale({ imperial: false }).addTo(map);

  return {
    map,
    baseLayers: {
      "Google 地圖": googleMap,
      "Google 衛星": googleSatellite
    }
  };
}

export function createRecoveryLayer(map, geojson) {
  layerByFeatureId.clear();
  activeLayer = L.geoJSON(geojson, {
    style: roadStyle,
    onEachFeature: (feature, layer) => {
      layerByFeatureId.set(feature.properties.id, layer);
      bindRoadEvents(map, feature, layer);
    }
  }).addTo(map);

  if (activeLayer.getLayers().length) {
    map.fitBounds(activeLayer.getBounds(), { padding: [28, 28] });
  }

  return activeLayer;
}

export function focusRecoveryRoad(map, featureId) {
  const layer = layerByFeatureId.get(featureId);
  if (!layer) return;

  selectRoadLayer(map, layer, true);
}

export function createLayerControl(map, baseLayers, recoveryLayer) {
  const overlays = {
    復原進度: recoveryLayer
  };

  return L.control.layers(baseLayers, overlays, {
    position: "topright",
    collapsed: false,
    autoZIndex: true
  }).addTo(map);
}

function roadStyle(feature) {
  const color = featureColor(feature);
  const isPolygon = feature.geometry?.type?.includes("Polygon");

  return {
    color,
    weight: isPolygon ? 4 : 7,
    opacity: 0.96,
    fillColor: color,
    fillOpacity: isPolygon ? 0.22 : 0,
    lineCap: "round",
    lineJoin: "round",
    className: "recovery-road-line"
  };
}

function featureColor(feature) {
  const unit = feature.properties.responsibleUnit;
  return GROUP_STYLES[unit] || STATUS_STYLES[feature.properties.status] || STATUS_STYLES["Not Started"];
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
    layer.setStyle({ weight: lineWeight(feature, 10, 5), opacity: 1 });
    layer.bringToFront();
  });

  layer.on("mouseout", () => {
    if (!isActive(layer)) layer.setStyle(roadStyle(feature));
  });

  layer.on("click", () => {
    selectRoadLayer(map, layer, false);
  });
}

function selectRoadLayer(map, layer, openPopup) {
  setActiveRoad(layer);
  renderSelectedRoad(layer.feature.properties);
  map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 15 });

  if (openPopup) layer.openPopup();

  document.dispatchEvent(new CustomEvent("recovery:road-selected", {
    detail: { id: layer.feature.properties.id }
  }));
}

function setActiveRoad(selectedLayer) {
  activeLayer.eachLayer((layer) => {
    layer.setStyle({
      ...roadStyle(layer.feature),
      weight: layer === selectedLayer ? lineWeight(layer.feature, 10, 5) : lineWeight(layer.feature, 7, 4),
      opacity: layer === selectedLayer ? 1 : 0.96
    });
    layer._recoveryActive = layer === selectedLayer;
  });
}

function lineWeight(feature, lineValue, polygonValue) {
  return feature.geometry?.type?.includes("Polygon") ? polygonValue : lineValue;
}

function isActive(layer) {
  return Boolean(layer._recoveryActive);
}

function popupHtml(properties) {
  const title = properties.roadName || properties.roadText || "未命名路段";
  const dateAndUnit = [properties.reportDate, properties.responsibleUnit].filter(Boolean).join(" / ");
  const resources = [properties.manpower, properties.equipment].filter(Boolean).join(" / ");
  return `
    <strong>${escapeHtml(title)}</strong><br>
    ${dateAndUnit ? `${escapeHtml(dateAndUnit)}<br>` : ""}
    ${resources ? `${escapeHtml(resources)}<br>` : ""}
    ${escapeHtml(properties.remark || "")}
  `;
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
