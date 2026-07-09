const SAMPLE_GEOJSON_URL = "../data/recovery/sample-recovery-roads.geojson";
const SHEET_API_URL = window.RECOVERY_SHEET_API_URL || "";

const PHOTO_URLS_BY_ROW = {
  3: [
    "https://drive.google.com/file/d/1oe1e0UprpgtXg8SNHFVVJN8WCa8Ha3gW/view?usp=sharing",
    "https://drive.google.com/file/d/12m4sgmxIbKX_VaPoXBE0QMl5qFKyGDq0/view?usp=drive_link",
    "https://drive.google.com/file/d/18jYg-5YIm5pfC5ohfSKlpQvauINY09q4/view?usp=drive_link",
    "https://drive.google.com/file/d/1FzBDPEcGn0nx5Xen9jd9ELp9QPCqIN1t/view?usp=drive_link"
  ],
  4: ["https://drive.google.com/file/d/12m4sgmxIbKX_VaPoXBE0QMl5qFKyGDq0/view?usp=drive_link"],
  5: ["https://drive.google.com/file/d/18jYg-5YIm5pfC5ohfSKlpQvauINY09q4/view?usp=drive_link"],
  6: ["https://drive.google.com/file/d/1FzBDPEcGn0nx5Xen9jd9ELp9QPCqIN1t/view?usp=drive_link"]
};

const ROAD_GEOMETRY_LIBRARY = {
  "長興街____基隆路__芳蘭路": [[121.5427, 25.0209], [121.5473, 25.0222]],
  "復興南路__東側__辛亥路__市民大道": [[121.5438, 25.0212], [121.5439, 25.0452]],
  "復興北路__東側____": [[121.5440, 25.0520], [121.5444, 25.0642]],
  "復興南路中央分隔島______": [[121.5438, 25.0250], [121.5440, 25.0212]],
  "復興南北路中央分隔島____和平東路以北__民族東路": [[121.5439, 25.0250], [121.5444, 25.0680]],
  "和平東路3段__兩側__麟光站__莊敬隧道口": [[121.5568, 25.0189], [121.5740, 25.0172]],
  "建國南北路__單號側____": [[121.5365, 25.0260], [121.5368, 25.0476]],
  "建國北路及建國南路一段__雙號側__建國北路及建國南路一段雙號側__忠孝東路段": [[121.5368, 25.0415], [121.5370, 25.0520]],
  "建國南路一段及二段__單號側__忠孝東路__辛亥路間": [[121.5368, 25.0415], [121.5372, 25.0212]],
  "信義路1~5段__南側____": [[121.5166, 25.0330], [121.5704, 25.0332]],
  "信義路5段__北側____": [[121.5615, 25.0338], [121.5704, 25.0338]],
  "信義路1段__北側____": [[121.5166, 25.0338], [121.5255, 25.0338]],
  "信義路2~4段__北側____": [[121.5255, 25.0338], [121.5615, 25.0338]],
  "仁愛路3段____建國南路__新生南路": [[121.5370, 25.0375], [121.5331, 25.0375]],
  "忠孝東路五~七段__北側____": [[121.5758, 25.0416], [121.6150, 25.0417]],
  "忠孝東路六~七段__南側____": [[121.5858, 25.0410], [121.6150, 25.0411]],
  "忠孝東路一段及忠孝西路____": [[121.5153, 25.0463], [121.5321, 25.0444]],
  "忠孝東路五段__南側____": [[121.5740, 25.0410], [121.5864, 25.0410]]
};

export async function loadRecoveryDataset(url = SAMPLE_GEOJSON_URL) {
  const sourceUrl = SHEET_API_URL || url;
  const separator = sourceUrl.includes("?") ? "&" : "?";
  const response = await fetch(`${sourceUrl}${separator}cacheBust=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`復原資料讀取失敗：${response.status}`);
  }
  return transformRecoveryApiResponse(await response.json());
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
      remark: text(properties.remark),
      roadText: text(properties.roadText),
      photoUrl: directPhotoUrl(properties.photoUrl),
      photoCaption: text(properties.photoCaption),
      photoUrls: normalizePhotoUrls(properties.photoUrls || properties.photoUrl),
      photoCaptions: normalizePhotoCaptions(properties.photoCaptions || properties.photoCaption)
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
  if (status === "completed" || status === "complete" || status === "已完成") return "Completed";
  if (status === "not started" || status === "not-started") return "Not Started";
  return "In Progress";
}

function clampPercentage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function transformRecoveryApiResponse(data) {
  if (data?.type === "FeatureCollection") return data;
  if (!Array.isArray(data?.tasks)) return data;

  return {
    type: "FeatureCollection",
    metadata: {
      source: data.sheetName || "Google Sheet",
      reportTitle: data.reportTitle,
      lastUpdate: data.reportTime || data.updatedAt,
      summary: data.summary
    },
    features: data.tasks.filter(isCompletedTask).map((task) => {
      const roadId = text(task.roadId) || buildRoadId(task);
      const geometry = task.geometry || geometryFromRoadId(roadId);
      const status = normalizeStatus(task.status);
      return {
        type: "Feature",
        properties: {
          id: text(task.id) || roadId,
          roadId,
          roadName: text(task.roadName) || text(task.roadText) || "未命名路段",
          responsibleUnit: text(task.unit),
          contractor: text(task.supportLocation),
          status,
          completionPercentage: task.completionPercentage ?? (status === "Completed" ? 100 : 45),
          estimatedFinishTime: text(task.eta) || "--",
          lastUpdate: data.reportTime || data.updatedAt || "",
          remark: text(task.remark),
          photoUrl: directPhotoUrl(text(task.photoUrl) || defaultPhotoUrls(task)[0]),
          photoCaption: text(task.photoCaption) || text(task.roadText) || "完成照片",
          photoUrls: normalizePhotoUrls(task.photoUrls?.length ? task.photoUrls : defaultPhotoUrls(task)),
          photoCaptions: normalizePhotoCaptions(task.photoCaptions?.length ? task.photoCaptions : task.photoCaption),
          roadText: text(task.roadText),
          side: text(task.side),
          start: text(task.start),
          end: text(task.end),
          locationType: text(task.locationType),
          rowNumber: task.rowNumber
        },
        geometry
      };
    })
  };
}

function isCompletedTask(task) {
  return normalizeStatus(task.status) === "Completed";
}

function buildRoadId(task) {
  return [
    normalizeRoadKeyPart(task.roadName),
    normalizeRoadKeyPart(task.side),
    normalizeRoadKeyPart(task.start),
    normalizeRoadKeyPart(task.end)
  ].join("__");
}

function normalizeRoadKeyPart(value) {
  return text(value)
    .replace(/[()（）]/g, "")
    .replace(/\s+/g, "")
    .replace(/至$/g, "");
}

function geometryFromRoadId(roadId) {
  const coordinates = ROAD_GEOMETRY_LIBRARY[roadId];
  return coordinates ? { type: "LineString", coordinates } : null;
}

function defaultPhotoUrls(task) {
  return PHOTO_URLS_BY_ROW[Number(task.rowNumber)] || [];
}

function directPhotoUrl(url) {
  const value = text(url);
  if (!value) return "";

  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (fileMatch) return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1200`;

  const idMatch = value.match(/[?&]id=([^&]+)/);
  if (value.includes("drive.google.com") && idMatch) {
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1200`;
  }

  return value;
}

function normalizePhotoUrls(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(directPhotoUrl).filter(Boolean);
}

function normalizePhotoCaptions(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(text).filter(Boolean);
}
