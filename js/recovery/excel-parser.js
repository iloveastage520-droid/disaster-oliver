const SAMPLE_GEOJSON_URL = "../data/recovery/sample-recovery-roads.geojson";

export async function loadRecoveryDataset(url = SAMPLE_GEOJSON_URL) {
  const response = await fetch(`${url}?cacheBust=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`復原資料讀取失敗：${response.status}`);
  }
  return response.json();
}

export function normalizeRecoveryFeature(feature) {
  const properties = feature.properties || {};
  return {
    ...feature,
    properties: {
      id: text(properties.id),
      roadName: text(properties.roadName),
      responsibleUnit: text(properties.responsibleUnit),
      contractor: text(properties.contractor),
      status: normalizeStatus(properties.status),
      completionPercentage: clampPercentage(properties.completionPercentage),
      estimatedFinishTime: text(properties.estimatedFinishTime) || "--",
      lastUpdate: text(properties.lastUpdate),
      remark: text(properties.remark)
    }
  };
}

export function normalizeRecoveryDataset(geojson) {
  return {
    ...geojson,
    features: (geojson.features || []).map(normalizeRecoveryFeature)
  };
}

export async function parseExcelFile() {
  throw new Error("Excel 上傳解析功能保留給下一階段整合。");
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeStatus(value) {
  const status = text(value).toLowerCase();
  if (status === "completed" || status === "complete") return "Completed";
  if (status === "not started" || status === "not-started") return "Not Started";
  return "In Progress";
}

function clampPercentage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}
