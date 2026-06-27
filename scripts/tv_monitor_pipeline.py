import argparse
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

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


def run_command(args):
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(message)
    return result.stdout.strip()


def get_audio_stream_url(youtube_url):
    clients = ["web", "mweb", "android"]
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
            print(f"Trying yt-dlp YouTube client: {client}")
            return run_command(command)
        except RuntimeError as exc:
            errors.append(f"{client}: {exc}")

    raise RuntimeError("yt-dlp could not resolve the live audio stream:\n" + "\n".join(errors))


def capture_audio(stream_url, output_path, seconds, ffmpeg_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_bin = ffmpeg_path or shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg was not found. Add ffmpeg to PATH or pass --ffmpeg-path.")
    command = [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        stream_url,
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
    run_command(command)


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

    print("Capture Audio...")
    stream_url = get_audio_stream_url(args.youtube_url)
    capture_audio(stream_url, audio_path, args.seconds, args.ffmpeg_path)
    print("Audio Captured")
    print("↓")
    print("Speech To Text...")

    transcript = transcribe_audio(model, audio_path)
    append_transcript(args.transcripts_log, timestamp, transcript)
    print("Whisper Done")
    print("↓")
    print("Keyword Filter...")

    status, keywords = keyword_filter(transcript)
    if status == "Possible Event":
        append_event(args.events_json, timestamp, keywords, transcript)
        print("Possible Event Detected")
        print("")
        print("Keyword:")
        for keyword in keywords:
            print(keyword)
    else:
        print("NORMAL")

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
