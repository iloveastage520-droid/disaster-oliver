export function renderDashboard(features, statistics) {
  animateNumber("#summary-total", statistics.total);
  animateNumber("#summary-completed", statistics.completed);
  animateNumber("#summary-progress", statistics.inProgress);
  animateNumber("#summary-not-started", statistics.notStarted);

  setText("#summary-rate", `${statistics.completionRate}%`);
  setText("#summary-eta", statistics.estimatedFinishTime);

  const bar = document.querySelector("#summary-bar");
  if (bar) bar.style.width = `${statistics.completionRate}%`;

  if (features.length) renderSelectedRoad(features[0].properties);
  renderRecoveryDataList(features);
}

export function renderSelectedRoad(properties) {
  setText("#selected-road-name", properties.roadName || "未命名路段");

  const rows = [
    ["權責單位", unitText(properties)],
    ["狀態", statusLabel(properties.status)],
    ["完成度", `${properties.completionPercentage}%`],
    ["預計完成", properties.estimatedFinishTime],
    ["更新時間", properties.lastUpdate || "--"],
    ["備註", properties.remark || "--"]
  ];

  const detail = document.querySelector("#selected-road-detail");
  if (!detail) return;
  detail.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    return row;
  }));
}

export function renderLayerStatus(layerNames) {
  const list = document.querySelector("#layer-status-list");
  if (!list) return;

  list.replaceChildren(...layerNames.map((name, index) => {
    const item = document.createElement("span");
    const swatch = document.createElement("i");
    swatch.className = index === 0 ? "status-completed" : "status-not-started";
    item.append(swatch, name);
    return item;
  }));
}

export function renderRecoveryDataList(features) {
  const body = document.querySelector("#recovery-data-list");
  if (!body) return;

  if (!features.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = "目前沒有資料";
    row.append(cell);
    body.replaceChildren(row);
    return;
  }

  body.replaceChildren(...features.map((feature) => {
    const properties = feature.properties;
    const row = document.createElement("tr");
    row.append(
      tableCell(properties.responsibleUnit || "--"),
      tableCell(properties.roadName || "--", "road-name-cell"),
      tableCell(statusLabel(properties.status), statusClass(properties.status)),
      tableCell(properties.estimatedFinishTime || "--")
    );
    row.title = [
      `支援廠商：${properties.contractor || "--"}`,
      `完成度：${properties.completionPercentage}%`,
      `更新時間：${properties.lastUpdate || "--"}`,
      `備註：${properties.remark || "--"}`
    ].join("\n");
    row.addEventListener("click", () => renderSelectedRoad(properties));
    return row;
  }));
}

function unitText(properties) {
  return [properties.responsibleUnit, properties.contractor].filter(Boolean).join(" / ") || "--";
}

function statusLabel(status) {
  return {
    Completed: "已完成",
    "In Progress": "處理中",
    "Not Started": "未開始"
  }[status] || "未開始";
}

function statusClass(status) {
  return {
    Completed: "table-status-completed",
    "In Progress": "table-status-progress",
    "Not Started": "table-status-not-started"
  }[status] || "table-status-not-started";
}

function tableCell(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  return cell;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function animateNumber(selector, target) {
  const element = document.querySelector(selector);
  if (!element) return;

  const start = Number(element.textContent) || 0;
  const duration = 450;
  const startedAt = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - startedAt) / duration);
    const value = Math.round(start + (target - start) * progress);
    element.textContent = String(value);
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
