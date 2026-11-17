#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ALOLabs Bangla TTS — one-time local setup
#
# Installs the ONLY dependency of the Bangla speech sidecar and verifies that
# the bundled espeak-ng engine really can synthesise Bangla on this machine.
# If verification fails, it says so and exits non-zero — it does not print a
# success message for something it did not prove.
#
# Usage:  bash scripts/setup-bangla-tts.sh [install-dir]
# Default install dir: ./.tts-venv   (git-ignored; nothing global is touched)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${1:-$REPO_ROOT/.tts-venv}"
cd "$REPO_ROOT"

echo "==> Bangla TTS setup"
echo "    install dir: $VENV_DIR"
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found. Install Python 3.10+ and retry." >&2
  exit 1
fi

PY_VERSION=$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
echo "    python: $PY_VERSION"

if [ ! -d "$VENV_DIR" ]; then
  echo "==> creating install dir"
  python3 -m venv "$VENV_DIR" 2>/dev/null || python3 -m pip install --target "$VENV_DIR" --quiet
fi

# piper-tts is used *only* for its bundled espeak-ng binary + Bengali
# dictionary. Piper's own neural voices do NOT include Bangla, so no .onnx
# model is downloaded or needed here.
echo "==> installing piper-tts (engine only, ~34 MB)"
if [ -x "$VENV_DIR/bin/pip" ]; then
  "$VENV_DIR/bin/pip" install --quiet --upgrade piper-tts
else
  python3 -m pip install --quiet --target "$VENV_DIR" piper-tts
fi

echo
echo "==> verifying the Bangla voice actually works"
PYTHONPATH="$VENV_DIR" python3 - <<'PY'
import sys, wave, io
sys.path.insert(0, 'scripts')
from importlib.machinery import SourceFileLoader
sidecar = SourceFileLoader('sidecar', 'scripts/bangla-tts-sidecar.py').load_module()

lib, data = sidecar.find_espeak_bridge()
engine = sidecar.EspeakEngine(lib, data, 'bn')
audio = engine.wav_bytes('আসসালামু আলাইকুম, আপনার অর্ডার প্রস্তুত আছে।')

with wave.open(io.BytesIO(audio), 'rb') as w:
    frames, rate = w.getnframes(), w.getframerate()

if frames < rate * 0.5:
    print(f"FAIL: only {frames} samples ({frames / rate:.2f}s) — expected real speech", file=sys.stderr)
    sys.exit(1)
if rate < 8000:
    print(f"FAIL: implausible sample rate {rate}", file=sys.stderr)
    sys.exit(1)

print(f"    OK  {frames} samples, {frames / rate:.2f}s @ {rate} Hz, {len(audio)} bytes")
print(f"    engine: {lib}")
print(f"    voice:  bn  (Bengali dictionary present: {bool(engine._list_bengali_voices(data))})")
PY

cat <<EOF

==> Verified. Now:
    1. start the engine:
         PYTHONPATH=$VENV_DIR python3 scripts/bangla-tts-sidecar.py --port 8880
    2. point the app at it (.env):
         VOICE_TTS_PROVIDER=piper
         VOICE_TTS_BASE_URL=http://127.0.0.1:8880
         VOICE_TTS_LANGUAGES=bn-BD
         VOICE_TTS_VOICE=bn
    3. check the app agrees:
         curl -s localhost:3011/api/voice/health | grep -o '"tts":{[^}]*}'

QUALITY NOTE: this is espeak-ng formant synthesis. It pronounces Bangla
correctly and is intelligible, but it is robotic, not neural. Do not describe
it as human-like. See docs/BANGLA_SPEECH_ENGINE.md.
EOF
