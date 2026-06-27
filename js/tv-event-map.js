const DATA_URL = "../data/tv-monitor/tv-events.json";

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

function severityColor(severity) {
  if (severity === "high") return "#ff5c7a";
  if (severity === "medium") return "#ffd166";
  return "#59e6a4";
}

function createIcon(event) {
  const color = severityColor(event.severity);
  return L.divIcon({
    className: "tv-event-marker",
    html: `<span style="background:${color}"></span>`,
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

  photo.src = event.photo || "";
  photo.alt = event.title || "直播截圖";
  type.textContent = event.event_type || "事件";
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
    const coordinateText = Number.isFinite(event.lat) && Number.isFinite(event.lng)
      ? `${event.lat.toFixed(4)}, ${event.lng.toFixed(4)}`
      : "座標待補";
    const card = document.createElement("button");
    card.type = "button";
    card.className = "event-card";
    card.dataset.id = event.id;
    card.dataset.severity = event.severity || "normal";
    card.innerHTML = `
      <strong>${event.title}</strong>
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

    const marker = L.marker([event.lat, event.lng], {
      icon: createIcon(event)
    });
    marker.bindPopup(`
      <div class="map-popup">
        <strong>${event.location}</strong>
        <span>${event.event_type}</span>
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
  const events = payload.events || [];

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
