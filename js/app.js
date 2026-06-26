const NEWS_API_URL = "https://script.google.com/macros/s/AKfycby2iT5glXEN116qYHqk9YXQmswkJ-kv_zPPfH2cso0GRYnxecXCJaUhs2WljhSpmmPV9g/exec";

const statusLabels = document.querySelectorAll(".status-grid strong");

statusLabels.forEach((label) => {
  label.dataset.state = "placeholder";
});

function normalizeText(value) {
  return String(value || "").trim();
}

function hasCoordinate(item) {
  return Boolean(normalizeText(item.coordinate));
}

function locationText(item) {
  return [item.matched_county, item.matched_district]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
}

function formatNewsDate(value) {
  const text = normalizeText(value);
  return text || "時間未明";
}

function createNewsCard(item, index, onSelect) {
  const button = document.createElement("button");
  button.className = "news-result-card";
  button.type = "button";
  button.addEventListener("click", () => onSelect(item));

  const meta = document.createElement("span");
  meta.className = "news-result-meta";
  meta.textContent = `${formatNewsDate(item.published_at)} / ${normalizeText(item.source) || "Unknown"}`;

  const title = document.createElement("strong");
  title.textContent = normalizeText(item.title) || `未命名新聞 ${index + 1}`;

  const location = document.createElement("span");
  location.className = "news-result-location";
  location.textContent = locationText(item) || "尚無定位";

  button.append(meta, title, location);
  return button;
}

function renderDetail(item) {
  const detail = document.querySelector("#news-detail");
  if (!detail) return;

  const title = normalizeText(item.title) || "未命名新聞";
  const link = normalizeText(item.link);
  const coordinate = normalizeText(item.coordinate) || "尚無座標";
  const place = locationText(item) || "尚無地點";
  const source = normalizeText(item.source) || "Unknown";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const definitionList = document.createElement("dl");
  [
    ["來源", source],
    ["時間", formatNewsDate(item.published_at)],
    ["地點", place],
    ["座標", coordinate]
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    definitionList.append(row);
  });

  detail.replaceChildren(heading, definitionList);

  if (link) {
    const anchor = document.createElement("a");
    anchor.className = "button button-secondary";
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.textContent = "開啟新聞";
    detail.append(anchor);
  }
}

function updateSummary(items, filteredItems, statusText) {
  const newsCount = document.querySelector("#news-count");
  const locatedCount = document.querySelector("#located-count");
  const sourceCount = document.querySelector("#source-count");
  const status = document.querySelector("#news-status");

  const sources = new Set(items.map((item) => normalizeText(item.source)).filter(Boolean));

  if (newsCount) newsCount.textContent = String(filteredItems.length);
  if (locatedCount) locatedCount.textContent = String(filteredItems.filter(hasCoordinate).length);
  if (sourceCount) sourceCount.textContent = String(sources.size);
  if (status) status.textContent = statusText;
}

function populateSourceFilter(items) {
  const select = document.querySelector("#source-filter");
  if (!select) return;

  const selectedValue = select.value;
  const sources = [...new Set(items.map((item) => normalizeText(item.source)).filter(Boolean))].sort();

  select.innerHTML = '<option value="">全部來源</option>';
  sources.forEach((source) => {
    const option = document.createElement("option");
    option.value = source;
    option.textContent = source;
    select.append(option);
  });
  select.value = selectedValue;
}

function filterNews(items) {
  const search = normalizeText(document.querySelector("#news-search")?.value).toLowerCase();
  const source = normalizeText(document.querySelector("#source-filter")?.value);
  const locatedOnly = Boolean(document.querySelector("#located-only")?.checked);

  return items.filter((item) => {
    const searchable = [
      item.title,
      item.source,
      item.domain,
      item.matched_county,
      item.matched_district,
      item.coordinate
    ].map(normalizeText).join(" ").toLowerCase();

    if (source && normalizeText(item.source) !== source) return false;
    if (locatedOnly && !hasCoordinate(item)) return false;
    if (search && !searchable.includes(search)) return false;
    return true;
  });
}

function renderNews(items) {
  const list = document.querySelector("#news-list");
  if (!list) return;

  const filteredItems = filterNews(items);
  list.innerHTML = "";

  if (!filteredItems.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "目前沒有符合條件的新聞。";
    list.append(empty);
  } else {
    filteredItems.forEach((item, index) => {
      list.append(createNewsCard(item, index, renderDetail));
    });
    renderDetail(filteredItems[0]);
  }

  updateSummary(items, filteredItems, "Ready");
}

async function fetchNews() {
  const url = `${NEWS_API_URL}?limit=120&cacheBust=${Date.now()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`News API error: ${response.status}`);
  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.items)) {
    throw new Error("News API returned invalid data");
  }
  return payload.items;
}

async function initNewsPage() {
  const list = document.querySelector("#news-list");
  if (!list) return;

  let items = [];

  const load = async () => {
    updateSummary(items, [], "Loading");
    list.innerHTML = '<p class="empty-state">正在讀取災情新聞...</p>';
    try {
      items = await fetchNews();
      populateSourceFilter(items);
      renderNews(items);
    } catch (error) {
      console.error(error);
      updateSummary(items, [], "Error");
      list.innerHTML = '<p class="empty-state">新聞資料讀取失敗，請稍後再試。</p>';
    }
  };

  ["#news-search", "#source-filter", "#located-only"].forEach((selector) => {
    document.querySelector(selector)?.addEventListener("input", () => renderNews(items));
    document.querySelector(selector)?.addEventListener("change", () => renderNews(items));
  });

  document.querySelector("#refresh-news")?.addEventListener("click", load);

  await load();
}

initNewsPage();

console.info("Disaster Oliver initialized.");
