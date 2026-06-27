const DATA_URL = "../data/tv-monitor/tv-events.json";
const RETENTION_DAYS = 3;

const eventList = document.querySelector("#event-list");
const eventMetric = document.querySelector("#metric-events");
const photo = document.querySelector("#detail-photo");
const type = document.querySelector("#detail-type");
const title = document.querySelector("#detail-title");
const locationText = document.querySelector("#detail-location");
const summary = document.querySelector("#detail-summary");
const keywords = document.querySelector("#detail-keywords");
const evidence = document.querySelector("#detail-evidence");

let map;
let markerLayer;
let activeId = "";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseEventDate(event) {
  const dateText = event.observed_date || event.recorded_at || event.time || "";
  const match = String(dateText).match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : localDateKey();
}

function daysBetween(dateKey, todayKey = localDateKey()) {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = new Date(`${dateKey}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  return Math.round((today - start) / dayMs);
}

function recencyInfo(event) {
  const age = daysBetween(parseEventDate(event));
  if (age <= 0) return { key: "today", label: "今天", color: "#44d7ff", marker: "#ff5c7a" };
  if (age === 1) return { key: "yesterday", label: "昨天", color: "#a9b6c8", marker: "#a9b6c8" };
  return { key: "older", label: "前天", color: "#707b8c", marker: "#707b8c" };
}

function eventTimestamp(event) {
  if (event.recorded_at) return new Date(event.recorded_at).getTime();
  const dateKey = parseEventDate(event);
  return new Date(`${dateKey}T00:00:00`).getTime();
}

function filterRecentEvents(events, retentionDays) {
  return events
    .filter((event) => daysBetween(parseEventDate(event)) < retentionDays)
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a));
}

function createIcon(event) {
  const recency = recencyInfo(event);
  return L.divIcon({
    className: `tv-event-marker marker-${recency.key}`,
    html: `<span style="background:${recency.marker}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function initMap() {
  map = L.map("event-map", {
    center: [23.85, 120.75],
    zoom: 8,
    scrollWheelZoom: true
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  const style = document.createElement("style");
  style.textContent = `
    .tv-event-marker span {
      display: block;
      width: 18px;
      height: 18px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 0 6px rgba(255,255,255,0.18), 0 8px 18px rgba(0,0,0,0.35);
    }

    .tv-event-marker.marker-yesterday span {
      opacity: 0.72;
      box-shadow: 0 0 0 5px rgba(169,182,200,0.18), 0 6px 14px rgba(0,0,0,0.28);
    }

    .tv-event-marker.marker-older span {
      opacity: 0.48;
      box-shadow: 0 0 0 4px rgba(112,123,140,0.14), 0 4px 10px rgba(0,0,0,0.22);
    }
  `;
  document.head.append(style);
}

function setActiveCard(eventId) {
  document.querySelectorAll(".event-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.id === eventId);
  });
}

function renderDetail(event) {
  activeId = event.id;
  setActiveCard(event.id);

  const recency = recencyInfo(event);
  photo.src = event.photo || "";
  photo.alt = event.title || "直播截圖";
  type.textContent = `${recency.label} · ${event.event_type || "事件"}`;
  title.textContent = event.title || "未命名事件";
  locationText.textContent = `${event.location || "未知地點"} · ${event.time || "--"}`;
  summary.textContent = event.summary || "";

  keywords.innerHTML = "";
  (event.keywords || []).forEach((keyword) => {
    const item = document.createElement("span");
    item.textContent = keyword;
    keywords.append(item);
  });

  evidence.innerHTML = "";
  (event.evidence || []).forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    evidence.append(item);
  });

  if (map && Number.isFinite(event.lat) && Number.isFinite(event.lng)) {
    map.setView([event.lat, event.lng], 11, { animate: true });
  }
}

function renderList(events) {
  eventList.innerHTML = "";

  events.forEach((event) => {
    const recency = recencyInfo(event);
    const coordinateText = Number.isFinite(event.lat) && Number.isFinite(event.lng)
      ? `${event.lat.toFixed(4)}, ${event.lng.toFixed(4)}`
      : "座標待補";
    const card = document.createElement("button");
    card.type = "button";
    card.className = `event-card event-${recency.key}`;
    card.dataset.id = event.id;
    card.dataset.severity = event.severity || "normal";
    card.innerHTML = `
      <div class="event-card-topline">
        <strong>${event.title}</strong>
        <span class="recency-badge">${recency.label}</span>
      </div>
      <span>${event.location}</span>
      <span class="event-coordinate">座標 ${coordinateText}</span>
      <small>${event.event_type} · ${event.time}</small>
    `;
    card.addEventListener("click", () => renderDetail(event));
    eventList.append(card);
  });
}

function renderMarkers(events) {
  markerLayer.clearLayers();
  const bounds = [];

  events.forEach((event) => {
    if (!Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return;

    const recency = recencyInfo(event);
    const marker = L.marker([event.lat, event.lng], {
      icon: createIcon(event)
    });
    marker.bindPopup(`
      <div class="map-popup">
        <strong>${event.location}</strong>
        <span>${recency.label} · ${event.event_type}</span>
      </div>
    `);
    marker.on("click", () => renderDetail(event));
    marker.addTo(markerLayer);
    bounds.push([event.lat, event.lng]);
  });

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [28, 28] });
  }
}

async function loadEvents() {
  const response = await fetch(`${DATA_URL}?cacheBust=${Date.now()}`);
  if (!response.ok) throw new Error(`Cannot load ${DATA_URL}`);
  const payload = await response.json();
  const retentionDays = payload.retention_days || RETENTION_DAYS;
  const events = filterRecentEvents(payload.events || [], retentionDays);

  eventMetric.textContent = String(events.length);
  renderList(events);
  renderMarkers(events);

  if (events.length) renderDetail(events[0]);
}

initMap();
loadEvents().catch((error) => {
  console.error(error);
  eventList.innerHTML = '<p class="empty-state">無法載入直播事件資料。</p>';
});
