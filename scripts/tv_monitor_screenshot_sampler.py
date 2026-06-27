"""Capture desktop screenshots for the TV Monitor PoC.

Run this from the user's interactive PowerShell session while the YouTube live
window is visible. Some sandboxed/background sessions cannot capture the screen.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    from PIL import ImageGrab
except ImportError:
    ImageGrab = None


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "tv-monitor" / "screenshots"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture timed screenshots for TV Monitor testing.")
    parser.add_argument("--minutes", type=float, default=10, help="Total capture duration in minutes.")
    parser.add_argument("--interval", type=float, default=60, help="Seconds between screenshots.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Screenshot output folder.")
    parser.add_argument("--quality", type=int, default=88, help="JPEG quality, 1-95.")
    return parser.parse_args()


def capture_once(output_dir: Path, quality: int) -> dict[str, str]:
    if ImageGrab is None:
        raise RuntimeError("Pillow is not installed. Run: python -m pip install pillow")

    captured_at = datetime.now()
    filename = f"tv-monitor-{captured_at:%Y%m%d-%H%M%S}.jpg"
    file_path = output_dir / filename

    image = ImageGrab.grab(all_screens=True)
    image.save(file_path, "JPEG", quality=quality)

    return {
        "time": captured_at.isoformat(timespec="seconds"),
        "file": filename,
    }


def write_index(output_dir: Path, screenshots: list[dict[str, str]]) -> None:
    index_path = output_dir / "index.json"
    index_path.write_text(
        json.dumps(
            {
                "updated_at": datetime.now().isoformat(timespec="seconds"),
                "screenshots": screenshots,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    if args.minutes <= 0:
        print("minutes must be greater than 0", file=sys.stderr)
        return 2
    if args.interval <= 0:
        print("interval must be greater than 0", file=sys.stderr)
        return 2

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    total_seconds = args.minutes * 60
    count = max(1, int(total_seconds // args.interval))
    screenshots: list[dict[str, str]] = []

    print("TV Monitor screenshot sampler")
    print(f"Output: {output_dir}")
    print(f"Duration: {args.minutes:g} minutes")
    print(f"Interval: {args.interval:g} seconds")
    print("Keep the YouTube live window visible during capture.")

    started_at = time.monotonic()
    for index in range(count):
        print(f"Capture {index + 1}/{count}...")
        result = capture_once(output_dir, args.quality)
        screenshots.append(result)
        write_index(output_dir, screenshots)
        print(f"Saved: {result['file']}")

        if index == count - 1:
            break

        next_capture_at = started_at + ((index + 1) * args.interval)
        sleep_seconds = max(0, next_capture_at - time.monotonic())
        time.sleep(sleep_seconds)

    print("Done.")
    print(f"Index: {output_dir / 'index.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
