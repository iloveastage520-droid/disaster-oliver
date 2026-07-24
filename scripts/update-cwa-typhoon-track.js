const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2] || path.join(process.env.TEMP || ".", "cwa_typhoon_latest.json");
const outputPath = path.join(__dirname, "..", "data", "cwa-typhoon-track.geojson");

const raw = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const data = JSON.parse(raw);
const cyclones = data.records?.TropicalCyclones?.TropicalCyclone
  || data.records?.tropicalCyclones?.tropicalCyclone
  || [];
const tc = Array.isArray(cyclones) ? cyclones[0] : cyclones;

function number(value) {
  return Number.parseFloat(value);
}

function point(fix) {
  return [number(fix.CoordinateLongitude), number(fix.CoordinateLatitude)];
}

function isValidFix(fix) {
  const [lng, lat] = point(fix);
  return Number.isFinite(lng) && Number.isFinite(lat);
}

function circleGeometry(lng, lat, radiusKm, steps = 72) {
  const coords = [];
  const radius = radiusKm / 6371;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lng * Math.PI / 180;

  for (let i = 0; i <= steps; i += 1) {
    const bearing = 2 * Math.PI * i / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(radius) +
      Math.cos(lat1) * Math.sin(radius) * Math.cos(bearing)
    );
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(radius) * Math.cos(lat1),
      Math.cos(radius) - Math.sin(lat1) * Math.sin(lat2)
    );
    coords.push([
      Number((lon2 * 180 / Math.PI).toFixed(6)),
      Number((lat2 * 180 / Math.PI).toFixed(6))
    ]);
  }

  return { type: "Polygon", coordinates: [coords] };
}

const features = [];
const name = "紅霞";
const intlName = tc.TyphoonName || "NOUL";
const label = `${intlName} ${name}`;
const analysis = (Array.isArray(tc.AnalysisData?.Fix) ? tc.AnalysisData.Fix : [tc.AnalysisData?.Fix])
  .filter(Boolean)
  .filter(isValidFix);
const forecast = (Array.isArray(tc.ForecastData?.Fix) ? tc.ForecastData.Fix : [tc.ForecastData?.Fix])
  .filter(Boolean)
  .filter(isValidFix);

if (analysis.length > 1) {
  features.push({
    type: "Feature",
    properties: { kind: "analysis-track", name, intlName, label: `${label} 分析路徑` },
    geometry: { type: "LineString", coordinates: analysis.map(point) }
  });
}

const latest = analysis.at(-1);
if (latest && forecast.length) {
  features.push({
    type: "Feature",
    properties: {
      kind: "forecast-track",
      name,
      intlName,
      label: `${label} 預報路徑`,
      initialTime: forecast[0].InitialTime || latest.DateTime
    },
    geometry: { type: "LineString", coordinates: [point(latest), ...forecast.map(point)] }
  });
}

analysis.forEach((fix, index) => {
  const isLatest = index === analysis.length - 1;
  const [lng, lat] = point(fix);
  features.push({
    type: "Feature",
    properties: {
      kind: isLatest ? "current-center" : "analysis-center",
      name,
      intlName,
      frameIndex: index,
      datetime: fix.DateTime,
      maxWindSpeed_ms: fix.MaxWindSpeed,
      pressure_hpa: fix.Pressure,
      label: isLatest ? `${label} 目前位置` : `${label} 分析位置`
    },
    geometry: { type: "Point", coordinates: [lng, lat] }
  });

  const radius15 = number(fix.Circle15ms?.Radius);
  if (Number.isFinite(radius15) && radius15 > 0) {
    features.push({
      type: "Feature",
      properties: {
        kind: isLatest ? "current-15ms-circle" : "analysis-15ms-circle",
        name,
        intlName,
        datetime: fix.DateTime,
        radius_km: String(radius15),
        circle15ms_km: String(radius15),
        label: `${label} 7級風暴風圈`
      },
      geometry: circleGeometry(lng, lat, radius15)
    });
  }

  const radius25 = number(fix.Circle25ms?.Radius);
  if (Number.isFinite(radius25) && radius25 > 0) {
    features.push({
      type: "Feature",
      properties: {
        kind: isLatest ? "current-25ms-circle" : "analysis-25ms-circle",
        name,
        intlName,
        datetime: fix.DateTime,
        radius_km: String(radius25),
        circle25ms_km: String(radius25),
        label: `${label} 10級風暴風圈`
      },
      geometry: circleGeometry(lng, lat, radius25)
    });
  }
});

forecast.forEach((fix, index) => {
  const [lng, lat] = point(fix);
  const initialTime = fix.InitialTime || latest?.DateTime || "";
  features.push({
    type: "Feature",
    properties: {
      kind: "forecast-center",
      name,
      intlName,
      frameIndex: analysis.length + index,
      initialTime,
      forecastHour: fix.ForecastHour,
      maxWindSpeed_ms: fix.MaxWindSpeed,
      pressure_hpa: fix.Pressure,
      radius70Probability_km: fix.Radius70PercentProbability,
      label: `${fix.ForecastHour}小時預報`
    },
    geometry: { type: "Point", coordinates: [lng, lat] }
  });

  const radius70 = number(fix.Radius70PercentProbability);
  if (Number.isFinite(radius70) && radius70 > 0) {
    features.push({
      type: "Feature",
      properties: {
        kind: "forecast-70prob-circle",
        name,
        intlName,
        forecastHour: fix.ForecastHour,
        initialTime,
        radius_km: String(radius70),
        label: `70%機率圈 ${fix.ForecastHour}小時`
      },
      geometry: circleGeometry(lng, lat, radius70)
    });
  }

  [
    ["Circle15ms", "forecast-15ms-circle", "circle15ms_km", "7級風暴風圈"],
    ["Circle25ms", "forecast-25ms-circle", "circle25ms_km", "10級風暴風圈"]
  ].forEach(([field, kind, prop, circleLabel]) => {
    const radius = number(fix[field]?.Radius);
    if (!Number.isFinite(radius) || radius <= 0) return;
    features.push({
      type: "Feature",
      properties: {
        kind,
        name,
        intlName,
        forecastHour: fix.ForecastHour,
        initialTime,
        radius_km: String(radius),
        [prop]: String(radius),
        label: `${circleLabel} ${fix.ForecastHour}小時`
      },
      geometry: circleGeometry(lng, lat, radius)
    });
  });
});

const geojson = {
  type: "FeatureCollection",
  name: "CWA_active_typhoon_track",
  generated: new Date().toISOString(),
  source: "CWA W-C0034-005",
  typhoon: {
    year: tc.Year,
    name,
    intlName,
    cwaTdNo: tc.CwaTdNo,
    cwaTyNo: tc.CwaTyNo,
    latestAnalysisTime: latest?.DateTime || null
  },
  features
};

fs.writeFileSync(outputPath, `${JSON.stringify(geojson, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  intlName,
  name,
  latest: latest?.DateTime,
  analysis: analysis.length,
  forecast: forecast.length,
  features: features.length
}, null, 2));
