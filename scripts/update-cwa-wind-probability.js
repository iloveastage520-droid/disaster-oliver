const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2] || path.join(process.env.TEMP || ".", "cwa_wind_probability.kml");
const outputPath = path.join(__dirname, "..", "data", "cwa-typhoon-wind-probability.geojson");

const raw = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const timeMatch = raw.match(/<description>\s*([^<]+?)\s*<\/description>/i);
const generatedFromCwa = timeMatch ? timeMatch[1].trim() : null;
const placemarkPattern = /<Placemark\b[\s\S]*?<name>\s*([^<]+?)\s*<\/name>[\s\S]*?<styleUrl>\s*#?([^<]+?)\s*<\/styleUrl>[\s\S]*?<coordinates>\s*([\s\S]*?)\s*<\/coordinates>[\s\S]*?<\/Placemark>/gi;
const features = [];
let match;

function parseCoordinates(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((item) => item.split(",").slice(0, 2).map(Number))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

while ((match = placemarkPattern.exec(raw))) {
  const name = match[1].trim();
  const probability = Number.parseInt(name, 10);
  const coordinates = parseCoordinates(match[3]);
  if (!coordinates.length || !Number.isFinite(probability)) continue;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
  features.push({
    type: "Feature",
    properties: {
      name,
      probability,
      styleUrl: match[2].trim(),
      source: "CWA W-C0034-003 KMZ 暴風圈侵襲機率",
      cwaTime: generatedFromCwa
    },
    geometry: {
      type: "Polygon",
      coordinates: [coordinates]
    }
  });
}

features.sort((a, b) => b.properties.probability - a.properties.probability);

const geojson = {
  type: "FeatureCollection",
  name: "CWA_typhoon_wind_probability",
  generated: new Date().toISOString(),
  source: "CWA W-C0034-003 KMZ",
  cwaTime: generatedFromCwa,
  features
};

fs.writeFileSync(outputPath, `${JSON.stringify(geojson, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  cwaTime: generatedFromCwa,
  features: features.length,
  probabilities: features.map((feature) => feature.properties.name)
}, null, 2));
