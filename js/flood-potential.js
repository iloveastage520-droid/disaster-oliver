const FLOOD_NEWS_API_URL = "https://script.google.com/macros/s/AKfycby2iT5glXEN116qYHqk9YXQmswkJ-kv_zPPfH2cso0GRYnxecXCJaUhs2WljhSpmmPV9g/exec";
const FLOOD_LAYER_URL = "../data/flood-potential/south-taiwan-24h-200mm-test.geojson";

let floodMap;
let newsLayer;
let floodLayer;
let activeItems = [];
const markerById = new Map();

function text(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return text(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function splitMultiValue(value) {
  return text(value).split(/[;\n\r|、；]+/).map((part) => part.trim()).filter(Boolean);
}

function parseCoordinate(value) {
  const parts = text(value).split(/[,，]/).map((part) => part.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

function parseCoordinateList(value) {
  const direct = parseCoordinate(value);
  if (direct) return [direct];
  return splitMultiValue(value).map(parseCoordinate).filter(Boolean);
}

function pick(values, index) {
  if (index < values.length) return values[index];
  return values.length === 1 ? values[0] : "";
}

function expandLocatedNews(rows) {
  const items = [];
  rows.forEach((row, rowIndex) => {
    const points = parseCoordinateList(row.coordinate);
    if (!points.length) return;

    const counties = splitMultiValue(row.matched_county);
    const districts = splitMultiValue(row.matched_district);
    const count = Math.max(points.length, counties.length, districts.length, 1);

    for (let index = 0; index < count; index += 1) {
      const point = points[index] || (points.length === 1 ? points[0] : null);
      if (!point) continue;
      items.push({
        id: `${rowIndex + 1}-${index + 1}`,
        title: text(row.title),
        source: text(row.source) || "Unknown",
        publishedAt: text(row.published_at),
        link: text(row.link),
        county: pick(counties, index),
        district: pick(districts, index),
        point
      });
    }
  });
  return items;
}

function formatPlace(item) {
  return [item.county, item.district].map(text).filter(Boolean).join(" ") || "未標示地點";
}

function setStatus(message) {
  const status = document.querySelector("#flood-status");
  if (status) status.textContent = message;
}

function setCount(count) {
  const counter = document.querySelector("#flood-count");
  if (counter) counter.textContent = String(count);
}

function createNewsIcon() {
  return L.divIcon({
    className: "flood-news-marker",
    html: "<span></span>",
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function setActiveCard(id) {
  document.querySelectorAll(".flood-news-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.newsId === id);
  });
}

function focusNewsItem(item) {
  setActiveCard(item.id);
  floodMap.setView(item.point, 13);
  markerById.get(item.id)?.openPopup();
}

function filteredItems() {
  const query = text(document.querySelector("#flood-search")?.value).toLowerCase();
  if (!query) return activeItems;
  return activeItems.filter((item) => [
    item.title,
    item.source,
    item.county,
    item.district,
    item.publishedAt
  ].map(text).join(" ").toLowerCase().includes(query));
}

function renderNewsMarkers(items) {
  markerById.clear();
  newsLayer.clearLayers();

  items.forEach((item) => {
    const marker = L.marker(item.point, { icon: createNewsIcon() })
      .bindPopup(`
        <strong>${escapeHtml(item.title || "定位新聞")}</strong><br>
        ${escapeHtml(item.source)} / ${escapeHtml(item.publishedAt)}<br>
        ${escapeHtml(formatPlace(item))}<br>
        <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">開啟新聞</a>
      `)
      .addTo(newsLayer);
    markerById.set(item.id, marker);
  });
}

function renderNewsList(items) {
  const list = document.querySelector("#flood-news-list");
  if (!list) return;
  list.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "目前沒有符合條件的定位新聞。";
    list.append(empty);
    return;
  }

  items.forEach((item) => {
    const button = document.createElement("button");
    button.className = "flood-news-card";
    button.type = "button";
    button.dataset.newsId = item.id;
    button.addEventListener("click", () => focusNewsItem(item));

    const meta = document.createElement("span");
    meta.textContent = `${item.publishedAt || "未標示時間"} / ${item.source}`;

    const title = document.createElement("strong");
    title.textContent = item.title || "定位新聞";

    const place = document.createElement("span");
    place.textContent = formatPlace(item);

    button.append(meta, title, place);
    list.append(button);
  });
}

function refreshVisibleNews() {
  const items = filteredItems();
  setCount(items.length);
  renderNewsList(items);
  renderNewsMarkers(items);
}

async function fetchLocatedNews() {
  const response = await fetch(`${FLOOD_NEWS_API_URL}?located=1&limit=160&cacheBust=${Date.now()}`);
  if (!response.ok) throw new Error(`News API error ${response.status}`);
  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.items)) throw new Error("Invalid API payload");
  return expandLocatedNews(payload.items);
}

async function loadFloodLayer() {
  const response = await fetch(`${FLOOD_LAYER_URL}?cacheBust=${Date.now()}`);
  if (!response.ok) throw new Error(`Flood layer error ${response.status}`);
  const geojson = await response.json();
  floodLayer = L.geoJSON(geojson, {
    style: {
      color: "#ef4444",
      fillColor: "#ef4444",
      fillOpacity: 0.24,
      opacity: 0.82,
      weight: 1
    },
    onEachFeature: (feature, layer) => {
      const gridCode = feature?.properties?.GRIDCODE ?? "";
      layer.bindPopup(`<strong>24H / 200mm 淹水潛勢</strong><br>GRIDCODE: ${escapeHtml(gridCode)}`);
    }
  }).addTo(floodMap);
}

async function loadNews() {
  setStatus("Loading");
  activeItems = await fetchLocatedNews();
  refreshVisibleNews();
  setStatus("Ready");
  if (activeItems.length) {
    const bounds = L.latLngBounds(activeItems.map((item) => item.point));
    floodMap.fitBounds(bounds, { padding: [24, 24] });
  }
}

function initMap() {
  floodMap = L.map("flood-map", {
    center: [23.4, 120.5],
    zoom: 8,
    zoomControl: true
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(floodMap);

  newsLayer = L.layerGroup().addTo(floodMap);
}

function bindControls() {
  document.querySelector("#flood-search")?.addEventListener("input", refreshVisibleNews);
  document.querySelector("#flood-refresh")?.addEventListener("click", () => {
    loadNews().catch((error) => {
      console.error(error);
      setStatus("Error");
    });
  });
  document.querySelector("#flood-layer-toggle")?.addEventListener("change", (event) => {
    if (!floodLayer) return;
    if (event.target.checked) {
      floodLayer.addTo(floodMap);
    } else {
      floodMap.removeLayer(floodLayer);
    }
  });
}

async function initFloodPotentialPage() {
  const mapElement = document.querySelector("#flood-map");
  if (!mapElement) return;

  initMap();
  bindControls();

  try {
    await loadFloodLayer();
  } catch (error) {
    console.error(error);
  }

  try {
    await loadNews();
  } catch (error) {
    console.error(error);
    setStatus("Error");
  }
}

document.addEventListener("DOMContentLoaded", initFloodPotentialPage);
