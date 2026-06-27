import argparse
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

YOUTUBE_URL = "https://www.youtube.com/watch?v=V1p33hqPrUk"
KEYWORDS = [
    "豪雨",
    "暴雨",
    "淹水",
    "積水",
    "颱風",
    "地震",
    "火災",
    "爆炸",
    "土石流",
    "坍方",
    "封橋",
    "封路",
    "道路中斷",
    "停電",
    "撤離",
    "避難",
    "消防局",
    "警戒",
    "水位",
]


def now_text():
    return datetime.now().strftime("%Y/%m/%d %H:%M:%S")


def run_command(args, timeout=None):
    result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=timeout)
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(message)
    return result.stdout.strip()


def get_audio_stream_url(youtube_url):
    clients = ["mweb", "android", "web"]
    errors = []

    for client in clients:
        command = [
            "yt-dlp",
            "--extractor-args",
            f"youtube:player_client={client}",
            "-f",
            "bestaudio/best",
            "-g",
            youtube_url,
        ]
        try:
            print(f"Trying yt-dlp YouTube client: {client}", flush=True)
            stream_url = run_command(command, timeout=35)
            print("YouTube stream resolved", flush=True)
            return stream_url
        except subprocess.TimeoutExpired:
            errors.append(f"{client}: timed out")
        except RuntimeError as exc:
            errors.append(f"{client}: {exc}")

    raise RuntimeError("yt-dlp could not resolve the live audio stream:\n" + "\n".join(errors))


def capture_audio(stream_url, output_path, seconds, ffmpeg_path, youtube_url):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_bin = ffmpeg_path or shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg was not found. Add ffmpeg to PATH or pass --ffmpeg-path.")
    try:
        source_path = capture_hls_segments(stream_url, output_path.with_suffix(".ts"))
    except HTTPError as exc:
        if exc.code != 403:
            raise
        print("Direct HLS segment download was forbidden; falling back to yt-dlp download.", flush=True)
        source_path = capture_with_ytdlp(youtube_url, output_path, seconds)
    command = [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        str(source_path),
        "-t",
        str(seconds),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        str(output_path),
    ]
    run_command(command, timeout=seconds + 45)
    source_path.unlink(missing_ok=True)


def capture_with_ytdlp(youtube_url, output_path, seconds):
    output_template = str(output_path.with_suffix(".%(ext)s"))
    before = set(output_path.parent.glob(f"{output_path.stem}.*"))
    command = [
        "yt-dlp",
        "--extractor-args",
        "youtube:player_client=mweb",
        "--force-overwrites",
        "--no-part",
        "--hls-use-mpegts",
        "--downloader",
        "ffmpeg",
        "--downloader-args",
        f"ffmpeg_i:-t {seconds}",
        "-f",
        "bestaudio/best",
        "-o",
        output_template,
        youtube_url,
    ]
    run_command(command, timeout=seconds + 120)
    after = set(output_path.parent.glob(f"{output_path.stem}.*"))
    created = sorted(after - before, key=lambda path: path.stat().st_mtime, reverse=True)
    for path in created:
        if path.suffix.lower() != ".wav":
            return path
    raise RuntimeError("yt-dlp fallback did not create an audio file.")


def request_headers():
    return {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.youtube.com/",
        "Origin": "https://www.youtube.com",
    }


def fetch_text(url):
    request = Request(url, headers=request_headers())
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_bytes(url):
    request = Request(url, headers=request_headers())
    with urlopen(request, timeout=30) as response:
        return response.read()


def capture_hls_segments(playlist_url, output_path, segment_count=4):
    playlist = fetch_text(playlist_url)
    if "#EXT-X-STREAM-INF" in playlist:
        nested_playlists = [
            urljoin(playlist_url, line.strip())
            for line in playlist.splitlines()
            if line.strip() and not line.startswith("#")
        ]
        if not nested_playlists:
            raise RuntimeError("No nested HLS playlists found in master playlist.")
        playlist_url = nested_playlists[-1]
        playlist = fetch_text(playlist_url)

    segment_urls = []

    for line in playlist.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ".m3u8" in line:
            playlist_url = urljoin(playlist_url, line)
            playlist = fetch_text(playlist_url)
            segment_urls = []
            continue
        segment_urls.append(urljoin(playlist_url, line))

    if not segment_urls:
        raise RuntimeError("No HLS media segments found in playlist.")

    selected_segments = segment_urls[-segment_count:]
    with output_path.open("wb") as output:
        for segment_url in selected_segments:
            output.write(fetch_bytes(segment_url))

    return output_path


def load_model(model_name, device, compute_type):
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(
            "faster-whisper is not installed. Install with: pip install faster-whisper"
        ) from exc
    return WhisperModel(model_name, device=device, compute_type=compute_type)


def transcribe_audio(model, audio_path):
    segments, _info = model.transcribe(str(audio_path), language="zh", vad_filter=True)
    return "".join(segment.text.strip() for segment in segments).strip()


def keyword_filter(transcript):
    found = []
    for keyword in KEYWORDS:
        if keyword in transcript and keyword not in found:
            found.append(keyword)
    status = "Possible Event" if len(found) >= 2 else "NORMAL"
    return status, found


def append_transcript(log_path, timestamp, transcript):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as file:
        file.write(f"[{timestamp}] {transcript}\n")


def load_events(events_path):
    if not events_path.exists():
        return []
    try:
        with events_path.open("r", encoding="utf-8") as file:
            payload = json.load(file)
    except json.JSONDecodeError:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("events"), list):
        return payload["events"]
    return []


def write_events(events_path, events):
    events_path.parent.mkdir(parents=True, exist_ok=True)
    with events_path.open("w", encoding="utf-8") as file:
        json.dump({"events": events[-100:]}, file, ensure_ascii=False, indent=2)


def append_event(events_path, timestamp, keywords, transcript):
    events = load_events(events_path)
    events.append(
        {
            "time": timestamp,
            "keywords": keywords,
            "transcript": transcript,
            "status": "Possible Event",
        }
    )
    write_events(events_path, events)


def run_once(args, model):
    timestamp = now_text()
    audio_path = args.audio_dir / f"tv-audio-{datetime.now().strftime('%Y%m%d-%H%M%S')}.wav"

    print("Capture Audio...", flush=True)
    stream_url = get_audio_stream_url(args.youtube_url)
    capture_audio(stream_url, audio_path, args.seconds, args.ffmpeg_path, args.youtube_url)
    print("Audio Captured", flush=True)
    print("↓", flush=True)
    print("Speech To Text...", flush=True)

    transcript = transcribe_audio(model, audio_path)
    append_transcript(args.transcripts_log, timestamp, transcript)
    print("Whisper Done", flush=True)
    print("↓", flush=True)
    print("Keyword Filter...", flush=True)

    status, keywords = keyword_filter(transcript)
    if status == "Possible Event":
        append_event(args.events_json, timestamp, keywords, transcript)
        print("Possible Event Detected", flush=True)
        print("", flush=True)
        print("Keyword:", flush=True)
        for keyword in keywords:
            print(keyword, flush=True)
    else:
        print("NORMAL", flush=True)

    if not args.keep_audio:
        audio_path.unlink(missing_ok=True)


def parse_args():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Disaster Oliver AI TV Monitor PoC pipeline")
    parser.add_argument("--youtube-url", default=YOUTUBE_URL)
    parser.add_argument("--seconds", type=int, default=10)
    parser.add_argument("--interval", type=int, default=10)
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--ffmpeg-path", default="")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--keep-audio", action="store_true")
    parser.add_argument("--audio-dir", type=Path, default=root / "data" / "tv-monitor" / "audio")
    parser.add_argument("--events-json", type=Path, default=root / "data" / "tv-monitor" / "events.json")
    parser.add_argument("--transcripts-log", type=Path, default=root / "logs" / "transcripts.log")
    return parser.parse_args()


def main():
    args = parse_args()
    print("Loading faster-whisper model...")
    model = load_model(args.model, args.device, args.compute_type)
    print("Pipeline Ready")

    while True:
        try:
            run_once(args, model)
        except KeyboardInterrupt:
            print("Stopped")
            return 0
        except Exception as exc:
            print(f"Pipeline Error: {exc}", file=sys.stderr)

        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
