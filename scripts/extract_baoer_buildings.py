import json
import math
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
SHP_PATH = WORKSPACE / "F_BUILD" / "F_BUILD.shp"
DBF_PATH = WORKSPACE / "F_BUILD" / "F_BUILD.dbf"
OUT_PATH = ROOT / "data" / "baoer-zongdui" / "buildings-500m.geojson"

LAT = 24.97784625792294
LON = 121.55016630895584
RADIUS_M = 500

A = 6378137.0
INV_F = 298.257222101
F = 1 / INV_F
E2 = 2 * F - F * F
EP2 = E2 / (1 - E2)
K0 = 0.9999
LON0 = math.radians(121.0)
FE = 250000.0


def wgs84_to_tm2(lat, lon):
    phi = math.radians(lat)
    lam = math.radians(lon)
    e4 = E2 * E2
    e6 = e4 * E2
    meridian = A * (
        (1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
        - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
        + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi)
        - (35 * e6 / 3072) * math.sin(6 * phi)
    )
    n = A / math.sqrt(1 - E2 * math.sin(phi) ** 2)
    t = math.tan(phi) ** 2
    c = EP2 * math.cos(phi) ** 2
    aa = (lam - LON0) * math.cos(phi)
    x = FE + K0 * n * (
        aa
        + (1 - t + c) * aa**3 / 6
        + (5 - 18 * t + t * t + 72 * c - 58 * EP2) * aa**5 / 120
    )
    y = K0 * (
        meridian
        + n
        * math.tan(phi)
        * (
            aa**2 / 2
            + (5 - t + 9 * c + 4 * c * c) * aa**4 / 24
            + (61 - 58 * t + t * t + 600 * c - 330 * EP2) * aa**6 / 720
        )
    )
    return x, y


def tm2_to_wgs84(x, y):
    e1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))
    m = y / K0
    mu = m / (A * (1 - E2 / 4 - 3 * E2**2 / 64 - 5 * E2**3 / 256))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
        + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
        + (151 * e1**3 / 96) * math.sin(6 * mu)
        + (1097 * e1**4 / 512) * math.sin(8 * mu)
    )
    c1 = EP2 * math.cos(phi1) ** 2
    t1 = math.tan(phi1) ** 2
    n1 = A / math.sqrt(1 - E2 * math.sin(phi1) ** 2)
    r1 = A * (1 - E2) / (1 - E2 * math.sin(phi1) ** 2) ** 1.5
    d = (x - FE) / (n1 * K0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * EP2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * EP2 - 3 * c1**2) * d**6 / 720
    )
    lon = LON0 + (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * EP2 + 24 * t1**2) * d**5 / 120
    ) / math.cos(phi1)
    return [math.degrees(lon), math.degrees(lat)]


def bbox_distance(px, py, bbox):
    xmin, ymin, xmax, ymax = bbox
    dx = max(xmin - px, 0, px - xmax)
    dy = max(ymin - py, 0, py - ymax)
    return math.hypot(dx, dy)


def read_dbf(path):
    with path.open("rb") as f:
        header = f.read(32)
        record_count = struct.unpack("<I", header[4:8])[0]
        header_len = struct.unpack("<H", header[8:10])[0]
        record_len = struct.unpack("<H", header[10:12])[0]
        fields = []
        while f.tell() < header_len - 1:
            field = f.read(32)
            if field[0] == 0x0D:
                break
            name = field[:11].split(b"\x00", 1)[0].decode("big5", "ignore")
            fields.append((name, field[16]))
        attrs = {}
        for index in range(1, record_count + 1):
            record = f.read(record_len)
            offset = 1
            row = {}
            for name, length in fields:
                raw = record[offset : offset + length]
                offset += length
                value = raw.decode("big5", "ignore").strip()
                if value:
                    row[name] = value
            attrs[index] = row
        return attrs


def iter_polygons(path):
    with path.open("rb") as f:
        header = f.read(100)
        file_len = struct.unpack(">i", header[24:28])[0] * 2
        while f.tell() < file_len:
            rec_header = f.read(8)
            if len(rec_header) < 8:
                break
            rec_no, rec_len_words = struct.unpack(">2i", rec_header)
            data = f.read(rec_len_words * 2)
            if len(data) < 44:
                continue
            shape_type = struct.unpack("<i", data[:4])[0]
            if shape_type != 5:
                continue
            xmin, ymin, xmax, ymax = struct.unpack("<4d", data[4:36])
            num_parts, num_points = struct.unpack("<2i", data[36:44])
            parts_offset = 44
            points_offset = parts_offset + num_parts * 4
            parts = list(struct.unpack(f"<{num_parts}i", data[parts_offset:points_offset]))
            points = [
                struct.unpack("<2d", data[points_offset + i * 16 : points_offset + i * 16 + 16])
                for i in range(num_points)
            ]
            rings = []
            for idx, start in enumerate(parts):
                end = parts[idx + 1] if idx + 1 < len(parts) else num_points
                ring = [tm2_to_wgs84(px, py) for px, py in points[start:end]]
                if ring and ring[0] != ring[-1]:
                    ring.append(ring[0])
                rings.append(ring)
            yield rec_no, (xmin, ymin, xmax, ymax), rings


def main():
    px, py = wgs84_to_tm2(LAT, LON)
    attrs = read_dbf(DBF_PATH)
    features = []
    for rec_no, bbox, rings in iter_polygons(SHP_PATH):
        if bbox_distance(px, py, bbox) > RADIUS_M:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {
                    **attrs.get(rec_no, {}),
                    "record": rec_no,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": rings,
                },
            }
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "name": "baoer_zongdui_buildings_500m",
                "features": features,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"Wrote {len(features)} features to {OUT_PATH}")


if __name__ == "__main__":
    main()
