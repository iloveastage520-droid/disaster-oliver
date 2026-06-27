const EVENTS_URL = "../data/tv-monitor/events.json";
const TRANSCRIPTS_URL = "../logs/transcripts.log";
const REFRESH_MS = 10000;

const eventList = document.querySelector("#event-list");
const transcriptList = document.querySelector("#transcript-list");
const consoleLog = document.querySelector("#console-log");
const monitorStatus = document.querySelector("#monitor-status");
const eventCount = document.querySelector("#event-count");
const lastUpdate = document.querySelector("#last-update");

function setStatus(text, state = "idle") {
  if (!monitorStatus) return;
  monitorStatus.textContent = text;
  monitorStatus.dataset.state = state;
}

async function fetchText(url) {
  const response = await fetch(`${url}?cacheBust=${Date.now()}`);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(`${url}?cacheBust=${Date.now()}`);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function normalizeEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.events)) return payload.events;
  return [];
}

function renderEvents(events) {
  if (!eventList) return;
  eventList.innerHTML = "";

  if (eventCount) eventCount.textContent = String(events.length);

  if (!events.length) {
    eventList.innerHTML = '<p class="empty-state">目前沒有可能災害事件。</p>';
    return;
  }

  events.slice().reverse().forEach((event) => {
    const card = document.createElement("article");
    card.className = "event-card";

    const keywordText = Array.isArray(event.keywords)
      ? event.keywords.join(" / ")
      : String(event.keywords || "");

    card.innerHTML = `
      <div class="event-card-header">
        <strong>${event.status || "Possible Event"}</strong>
        <span>${event.time || "--"}</span>
      </div>
      <p class="event-keywords">${keywordText || "No keywords"}</p>
      <p class="event-transcript">${event.transcript || ""}</p>
    `;
    eventList.append(card);
  });
}

function parseTranscriptBlocks(logText) {
  const blocks = logText
    .split(/\n(?=\[[^\]]+\]\s)/)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.slice(-8).reverse();
}

function renderTranscripts(logText) {
  if (!transcriptList) return;
  const blocks = parseTranscriptBlocks(logText);
  transcriptList.innerHTML = "";

  if (!blocks.length) {
    transcriptList.innerHTML = '<p class="empty-state">尚未讀取到逐字稿。</p>';
    return;
  }

  blocks.forEach((block) => {
    const item = document.createElement("article");
    item.className = "transcript-card";
    item.textContent = block;
    transcriptList.append(item);
  });
}

function renderConsole(events, transcriptLog) {
  if (!consoleLog) return;

  const latestEvent = events[events.length - 1];
  const latestTranscript = parseTranscriptBlocks(transcriptLog)[0] || "";

  if (latestEvent) {
    consoleLog.textContent = [
      "Capture Audio...",
      "↓",
      "Speech To Text...",
      "↓",
      "Keyword Filter...",
      "↓",
      "Possible Event Detected",
      "",
      `Keyword: ${(latestEvent.keywords || []).join(" / ")}`,
      "",
      latestEvent.transcript || ""
    ].join("\n");
    return;
  }

  consoleLog.textContent = [
    "Capture Audio...",
    "↓",
    "Speech To Text...",
    "↓",
    "Keyword Filter...",
    "↓",
    "NORMAL",
    "",
    latestTranscript
  ].join("\n");
}

async function refreshDashboard() {
  try {
    const [eventPayload, transcriptLog] = await Promise.all([
      fetchJson(EVENTS_URL).catch(() => []),
      fetchText(TRANSCRIPTS_URL).catch(() => "")
    ]);

    const events = normalizeEvents(eventPayload);
    renderEvents(events);
    renderTranscripts(transcriptLog);
    renderConsole(events, transcriptLog);

    if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setStatus("Ready", "ready");
  } catch (error) {
    console.error(error);
    setStatus("No Data", "error");
  }
}

refreshDashboard();
window.setInterval(refreshDashboard, REFRESH_MS);
