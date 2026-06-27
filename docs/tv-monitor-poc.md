# AI TV Monitor PoC

This module is isolated from the existing Disaster Oliver news, map, flood-potential, Google Apps Script, and Google Sheet workflows.

## Purpose

Validate whether a local pipeline can:

1. Capture recent audio from the ETtoday/EBC YouTube live stream.
2. Run local speech-to-text with faster-whisper.
3. Detect possible disaster-related segments with a simple keyword filter.
4. Write output files that `pages/tv-monitor.html` can display.

## Stream

```text
https://www.youtube.com/watch?v=V1p33hqPrUk
```

## Requirements

Install these locally:

```powershell
pip install faster-whisper yt-dlp
```

Install `ffmpeg` and make sure `ffmpeg.exe` is available in PATH.

## Run Once

```powershell
python scripts/tv_monitor_pipeline.py --once --model small --device cpu --compute-type int8
```

## Run Continuously

```powershell
python scripts/tv_monitor_pipeline.py --model small --device cpu --compute-type int8
```

The default loop captures about 10 seconds of audio, transcribes it, filters keywords, then waits about 10 seconds before the next cycle.

## Outputs

```text
logs/transcripts.log
data/tv-monitor/events.json
```

The dashboard reads:

```text
pages/tv-monitor.html
js/tv-monitor.js
css/tv-monitor.css
```

## Keyword Rule

If fewer than two disaster keywords are found:

```text
NORMAL
```

If two or more keywords are found:

```text
Possible Event
```

## Not Included In v1

- GPT
- OpenAI API
- Vision
- OCR
- GIS
- Maps
- Google News integration
- Multi-channel monitoring
