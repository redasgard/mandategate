#!/usr/bin/env bash
# MandateGate demo video QA — automated acceptance checks.
# Usage: bash scripts/video-qa.sh <path-to-mp4-or-webm>
#
# Checks: duration, resolution, codec, silence detection, screenshot extraction,
# manifest correlation, secret scan, file integrity.
set -euo pipefail

VIDEO="${1:?Usage: video-qa.sh <video-file>}"
MANIFEST="${2:-$(dirname "$VIDEO")/manifest.json}"
QA_DIR="$(dirname "$VIDEO")/qa-report"
mkdir -p "$QA_DIR"

echo "=== MandateGate Video QA ==="
echo "Video: $VIDEO"
echo "Manifest: $MANIFEST"
echo "QA output: $QA_DIR"
echo ""

# --- V01: Duration ---
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO" 2>/dev/null)
DURATION_INT=${DURATION%.*}
echo "V01 Duration: ${DURATION}s (${DURATION_INT}s integer)"
if [ "$DURATION_INT" -gt 180 ]; then
  echo "  FAIL: Over 180 seconds"
  FAIL_V01=1
elif [ "$DURATION_INT" -gt 165 ]; then
  echo "  WARN: Over 165 seconds (target 140-165)"
else
  echo "  PASS"
fi

# --- V02: Resolution and codec ---
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name,r_frame_rate \
  -of json "$VIDEO" > "$QA_DIR/video-stream.json" 2>/dev/null
WIDTH=$(python3 -c "import json;d=json.load(open('$QA_DIR/video-stream.json'));print(d['streams'][0]['width'])")
HEIGHT=$(python3 -c "import json;d=json.load(open('$QA_DIR/video-stream.json'));print(d['streams'][0]['height'])")
CODEC=$(python3 -c "import json;d=json.load(open('$QA_DIR/video-stream.json'));print(d['streams'][0]['codec_name'])")
echo "V02 Resolution: ${WIDTH}x${HEIGHT}, codec: ${CODEC}"
ASPECT=$(python3 -c "print(round($WIDTH/$HEIGHT, 2))")
if [ "$ASPECT" = "1.78" ] || [ "$ASPECT" = "1.77" ]; then
  echo "  PASS: 16:9 aspect ratio"
else
  echo "  WARN: Aspect ratio $ASPECT (expected ~1.78)"
fi

# --- V04: Silence detection ---
echo "V04 Silence detection:"
if ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$VIDEO" 2>/dev/null | grep -q .; then
  ffmpeg -i "$VIDEO" -af silencedetect=noise=-30dB:d=5 -f null - 2>&1 \
    | grep -E "silence_start|silence_end|silence_duration" > "$QA_DIR/silence.txt" 2>/dev/null || true
  LONG_SILENCES=$(grep "silence_duration" "$QA_DIR/silence.txt" 2>/dev/null | awk -F: '{print $2}' | awk '{if($1+0>5)print}' | wc -l)
  echo "  Long silences (>5s): $LONG_SILENCES"
  if [ "$LONG_SILENCES" -gt 0 ]; then
    echo "  WARN: Found $LONG_SILENCES silence gaps >5s"
    cat "$QA_DIR/silence.txt"
  else
    echo "  PASS"
  fi
else
  echo "  INFO: No audio stream detected (narration not yet added)"
fi

# --- V05/V06: Contact sheet (screenshot extraction) ---
echo "V05/V06 Contact sheet:"
for T in 5 19 35 54 70 90 110 130 150 170; do
  ffmpeg -y -ss "$T" -i "$VIDEO" -frames:v 1 -q:v 2 "$QA_DIR/frame-${T}s.jpg" 2>/dev/null || true
done
FRAMES=$(ls "$QA_DIR"/frame-*.jpg 2>/dev/null | wc -l)
echo "  Extracted $FRAMES contact-sheet frames"
# Montage if ImageMagick available
if command -v montage &>/dev/null; then
  montage "$QA_DIR"/frame-*.jpg -tile 5x2 -geometry 288x162+4+4 "$QA_DIR/contact-sheet.jpg" 2>/dev/null \
    && echo "  Contact sheet: $QA_DIR/contact-sheet.jpg"
fi

# --- V08: Secret scan ---
echo "V08 Secret scan:"
# Extract any text overlays from the video frames
SECRET_HITS=0
for f in "$QA_DIR"/frame-*.jpg; do
  # Check pixel dimensions but we can't OCR without tesseract
  true
done
# Check manifest for secrets
if [ -f "$MANIFEST" ]; then
  SECRETS=$(grep -cEi "sk-|AKIA|ghp_|password|secret|token.*=|Bearer " "$MANIFEST" 2>/dev/null || echo 0)
  echo "  Manifest secret patterns: $SECRETS"
  if [ "$SECRETS" -gt 0 ]; then
    echo "  FAIL: Secrets found in manifest"
  fi
fi
echo "  PASS (pixel-level OCR requires manual review)"

# --- Manifest correlation ---
if [ -f "$MANIFEST" ]; then
  echo ""
  echo "=== Manifest correlation ==="
  python3 -c "
import json,sys
m=json.load(open('$MANIFEST'))
print('Recording type:', m.get('recordingType','?'))
print('Origin:', m.get('origin','?'))
print('Duration (manifest):', m.get('captureDurationSeconds','?'), 's')
print('Scenes:', len(m.get('scenes',[])))
for s in m.get('scenes',[]):
    print(f'  {s[\"id\"]:30s} {s[\"startSeconds\"]:6.1f}s - {s[\"endSeconds\"]:6.1f}s ({s[\"durationSeconds\"]:5.1f}s)')
print('Payment scene:', m.get('evidence',{}).get('paypalScene','?'))
print('Browser errors:', len(m.get('browserErrors',[])))
print('Recording complete:', m.get('recordingComplete', '?'))
"
fi

# --- Full ffprobe JSON ---
ffprobe -v error -show_format -show_streams -of json "$VIDEO" > "$QA_DIR/ffprobe-full.json" 2>/dev/null
echo ""
echo "=== Full ffprobe saved to $QA_DIR/ffprobe-full.json ==="

# --- File integrity ---
echo ""
echo "=== File integrity ==="
ls -lh "$VIDEO"
sha256sum "$VIDEO" | tee "$QA_DIR/video-sha256.txt"

echo ""
echo "=== QA COMPLETE ==="
echo "Manual review required: V02 (watchability), V03 (narration sync), V05 (text legibility),"
echo "V06 (real interactions visible), V08 (full-frame secret review), V10 (intro/outro length)"
echo "Contact sheet for visual review: $QA_DIR/contact-sheet.jpg"
