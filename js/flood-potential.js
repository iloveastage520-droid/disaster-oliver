const FLOOD_NEWS_API_URL = "https://script.google.com/macros/s/AKfycby2iT5glXEN116qYHqk9YXQmswkJ-kv_zPPfH2cso0GRYnxecXCJaUhs2WljhSpmmPV9g/exec";

const potentialAreas = [
  {
    name: "新竹沿海低窪區",
    level: "high",
    center: [24.84, 120.98],
    bounds: [
      [24.93, 120.89],
      [24.91, 121.04],
      [24.76, 121.05],
      [24.72, 120.91]
    ]
  },
  {
    name: "台南都會排水敏感區",
    level: "mid",
    center: [23.0, 120.21],
    bounds: [
      [23.08, 120.11],
      [23.08, 120.31],
      [22.91, 120.32],
      [22.91, 120.12]
    ]
  },
  {
    name: "高屏平原低窪區",
    level: "high",
    center: [22.63, 120.39],
    bounds: [
      [22.82, 120.23],
      [22.77, 120.56],
      [22.45, 120.57],
      [22.43, 120.26]
    ]
  },
  {
    name: "基隆河谷邊坡及排水敏感區",
    level: "low",
    center: [25.12, 121.74],
    bounds: [
      [25.17, 121.66],
      [25.17, 121.83],
      [25.07, 121.84],
      [25.06, 121.67]
    ]
  }
];

const riskStyles = {
  low: { color: "#facc15", fillColor: "#facc15", fillOpacity: 0.16, weight: 1 },
  mid: { color: "#fb923c", fillColor: "#fb923c", fillOpacity: 0.2, weight: 1 },
  high: { color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.24, weight: 1 }
};

let floodMap;
let newsLayer;
let potentialLayer;
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
  return text(value).split(/[;\n\r|、]+/).map((part) => part.trim()).filter(Boolean);
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
  return [item.county, item.district].map(text).filter(Boolean).join(" ") || "未標示行政區";
}

function estimateRisk(point) {
  let bestArea = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  potentialAreas.forEach((area) => {
    const distance = Math.hypot(point[0] - area.center[0], point[1] - area.center[1]);
    if (distance < bestDistance) {
      bestArea = area;
      bestDistance = distance;
    }
  });

  if (!bestArea || bestDistance > 0.35) {
    return { label: "尚未比對到示意潛勢區", level: "low" };
  }

  const labels = { low: "低", mid: "中", high: "高" };
  return { label: `${bestArea.name} / ${labels[bestArea.level]}潛勢`, level: bestArea.level };
}

function createNewsIcon(level) {
  const colors = { low: "#facc15", mid: "#fb923c", high: "#ef4444" };
  return L.divIcon({
    className: "flood-news-marker",
    html: `<span style="background:${colors[level] || colors.low}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

async function fetchLocatedNews() {
  const response = await fetch(`${FLOOD_NEWS_API_URL}?located=1&limit=160&cacheBust=${Date.now()}`);
  if (!response.ok) throw new Error(`API error ${response.status}`);

  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.items)) throw new Error("Invalid API payload");

  return expandLocatedNews(payload.items);
}

function renderPotentialLayer() {
  potentialLayer = L.layerGroup();

  potentialAreas.forEach((area) => {
    L.polygon(area.bounds, riskStyles[area.level])
      .bindPopup(`<strong>${escapeHtml(area.name)}</strong><br>淹水潛勢示意圖層`)
      .addTo(potentialLayer);
  });

  potentialLayer.addTo(floodMap);
}

function renderNewsMarkers(items) {
  markerById.clear();
  newsLayer.clearLayers();

  items.forEach((item) => {
    const risk = estimateRisk(item.point);
    const marker = L.marker(item.point, { icon: createNewsIcon(risk.level) })
      .bindPopup(`
        <strong>${escapeHtml(item.title || "未命名新聞")}</strong><br>
        ${escapeHtml(item.source)} / ${escapeHtml(item.publishedAt)}<br>
        ${escapeHtml(formatPlace(item))}<br>
        ${escapeHtml(risk.label)}<br>
        <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">開啟新聞</a>
      `)
      .addTo(newsLayer);

    markerById.set(item.id, marker);
  });
}

function setStatus(message) {
  const status = document.querySelector("#flood-status");
  if (status) status.textContent = message;
}

function setCount(count) {
  const counter = document.querySelector("#flood-count");
  if (counter) counter.textContent = String(count);
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

function renderNewsList(items) {
  const list = document.querySelector("#flood-news-list");
  if (!list) return;

  list.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "沒有符合條件的定位新聞。";
    list.append(empty);
    return;
  }

  items.forEach((item) => {
    const risk = estimateRisk(item.point);
    const button = document.createElement("button");
    button.className = "flood-news-card";
    button.type = "button";
    button.dataset.newsId = item.id;
    button.addEventListener("click", () => focusNewsItem(item));

    const meta = document.createElement("span");
    meta.textContent = `${item.publishedAt || "未標示時間"} / ${item.source}`;

    const title = document.createElement("strong");
    title.textContent = item.title || "未命名新聞";

    const place = document.createElement("span");
    place.textContent = `${formatPlace(item)} / ${risk.label}`;

    button.append(meta, title, place);
    list.append(button);
  });
}

function filterItems() {
  const keyword = text(document.querySelector("#flood-search")?.value).toLowerCase();
  if (!keyword) return activeItems;

  return activeItems.filter((item) => [
    item.title,
    item.source,
    item.county,
    item.district,
    item.publishedAt
  ].map(text).join(" ").toLowerCase().includes(keyword));
}

function refreshView() {
  const filteredItems = filterItems();
  renderNewsList(filteredItems);
  renderNewsMarkers(filteredItems);
  setCount(filteredItems.length);

  if (filteredItems.length) {
    const bounds = L.latLngBounds(filteredItems.map((item) => item.point));
    floodMap.fitBounds(bounds.pad(0.2), { maxZoom: 11 });
  }
}

async function loadFloodNews() {
  setStatus("Loading");
  setCount("--");

  try {
    activeItems = await fetchLocatedNews();
    refreshView();
    setStatus("Ready");
  } catch (error) {
    console.error(error);
    activeItems = [];
    refreshView();
    setStatus("Error");
  }
}

function initFloodPage() {
  const mapElement = document.querySelector("#flood-map");
  if (!mapElement || typeof L === "undefined") return;

  floodMap = L.map(mapElement, { zoomControl: true }).setView([23.75, 121.0], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(floodMap);

  newsLayer = L.layerGroup().addTo(floodMap);
  renderPotentialLayer();

  document.querySelector("#flood-search")?.addEventListener("input", refreshView);
  document.querySelector("#flood-refresh")?.addEventListener("click", loadFloodNews);
  document.querySelector("#flood-layer-toggle")?.addEventListener("change", (event) => {
    if (event.target.checked) {
      potentialLayer.addTo(floodMap);
    } else {
      potentialLayer.removeFrom(floodMap);
    }
  });

  loadFloodNews();
}

initFloodPage();
