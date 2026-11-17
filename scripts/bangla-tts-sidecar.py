#!/usr/bin/env python3
"""
ALO Labs — Bangla speech sidecar (zero-cost, fully offline).

WHY THIS EXISTS
---------------
The voice product is Bangla-first, but Piper ships **no Bangla voice** and the
Silero/Kokoro model hosts are not always reachable. What *is* available in the
Piper wheel you already install from PyPI is the complete **espeak-ng** engine
binary (`espeakbridge.so`) *including its Bengali dictionary* (`bn_dict`,
`lang/inc/bn`). espeak-ng can synthesise Bangla directly.

This sidecar exposes that engine over the exact HTTP contracts
`src/lib/voice/speech-adapters/http-engine.ts` already speaks, so the product
needs no adapter changes:

    POST {base}?text=...            -> audio/wav        (contract: piper)
    POST {base}/audio/speech        -> JSON body        (contract: openai)
    GET  {base}/models              -> health payload   (openai health probe)
    GET  {base}                     -> health payload   (piper health probe)

HONEST QUALITY STATEMENT
------------------------
espeak-ng is a *formant synthesiser*, not a neural model. It produces
intelligible, correctly pronounced Bangla from real Bengali phonology
(verified: ঢাকা -> ɖʰˈaka), but it sounds synthetic and robotic. It is
appropriate for:

  * IVR prompts and number/date read-outs where clarity beats naturalness
  * development, testing and CI so the TTS pipeline is exercised end-to-end
  * an emergency fallback when a neural engine is down

It is NOT appropriate for customer-facing marketing copy, and it must not be
described as "human-like". Measure it with
`scripts/run-voice-benchmark.ts` and native speakers before any quality claim.

USAGE
-----
    python3 scripts/bangla-tts-sidecar.py --port 8880 --voice bn
    # then, in .env:
    #   VOICE_TTS_PROVIDER=piper
    #   VOICE_TTS_BASE_URL=http://127.0.0.1:8880
    #   VOICE_TTS_LANGUAGES=bn-BD
    #   VOICE_TTS_VOICE=bn

Dependencies: `piper-tts` from PyPI (for its bundled espeak-ng engine + Bengali
dictionary). No other packages, no network access at runtime, no API key.
"""
from __future__ import annotations

import argparse
import ctypes
import io
import json
import sys
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# ─── Locate Piper's bundled espeak-ng ────────────────────────────────────────

def find_espeak_bridge() -> tuple[str, str]:
    """Return (shared library path, espeak-ng data directory)."""
    try:
        import piper  # noqa: PLC0415 - imported lazily so --help works without it
    except ImportError:
        sys.exit(
            "piper-tts is required for its bundled espeak-ng engine.\n"
            "  pip install piper-tts\n"
            "No other dependency is needed; nothing is downloaded at runtime."
        )
    root = Path(piper.__file__).parent
    lib = root / "espeakbridge.so"
    data = root / "espeak-ng-data"
    if not lib.exists():
        # Some builds ship a differently-named object per platform.
        candidates = sorted(root.glob("espeakbridge*.so")) + sorted(root.glob("espeakbridge*.dylib"))
        if not candidates:
            sys.exit(f"Could not find Piper's espeakbridge library under {root}.")
        lib = candidates[0]
    if not data.is_dir():
        sys.exit(f"Could not find espeak-ng data directory at {data}.")
    return str(lib), str(data)


# ─── espeak-ng bindings ──────────────────────────────────────────────────────

AUDIO_OUTPUT_SYNCHRONOUS = 2
POS_CHARACTER = 1

# Windows/Unix argument types for the subset of the C API we need.
class EspeakEngine:
    def __init__(self, lib_path: str, data_dir: str, voice: str) -> None:
        self._lock = threading.Lock()
        self._lib = ctypes.CDLL(lib_path)
        lib = self._lib
        lib.espeak_Initialize.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
        lib.espeak_Initialize.restype = ctypes.c_int
        lib.espeak_SetSynthCallback.argtypes = [ctypes.c_void_p]
        lib.espeak_SetVoiceByName.argtypes = [ctypes.c_char_p]
        lib.espeak_SetVoiceByName.restype = ctypes.c_int
        lib.espeak_SetParameter.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
        lib.espeak_SetParameter.restype = ctypes.c_int
        lib.espeak_Synth.argtypes = [
            ctypes.c_char_p, ctypes.c_size_t, ctypes.c_uint, ctypes.c_int,
            ctypes.c_uint, ctypes.c_uint, ctypes.POINTER(ctypes.c_uint), ctypes.c_void_p,
        ]
        lib.espeak_Synth.restype = ctypes.c_int

        self._chunks: list[bytes] = []
        self._callback = ctypes.CFUNCTYPE(
            ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p
        )(self._on_chunk)
        lib.espeak_SetSynthCallback(ctypes.cast(self._callback, ctypes.c_void_p))

        rate = lib.espeak_Initialize(AUDIO_OUTPUT_SYNCHRONOUS, 0, data_dir.encode(), 0)
        if rate <= 0:
            sys.exit("espeak-ng failed to initialise. Is the espeak-ng-data directory intact?")
        self.sample_rate = int(rate)

        if lib.espeak_SetVoiceByName(voice.encode()) != 0:
            available = self._list_bengali_voices(data_dir)
            sys.exit(
                f"espeak-ng does not have voice '{voice}'.\n"
                f"Bengali voices present in this build: {available or 'none'}"
            )
        self.voice = voice

    @staticmethod
    def _list_bengali_voices(data_dir: str) -> list[str]:
        """Report which language files actually exist, instead of guessing."""
        lang_root = Path(data_dir) / "lang"
        found: list[str] = []
        for path in lang_root.rglob("*"):
            if path.is_file() and path.name in {"bn", "bn1", "bnt"}:
                found.append(path.name)
        return sorted(set(found))

    def _on_chunk(self, wav, nsamples, _events) -> int:
        if nsamples > 0 and wav:
            self._chunks.append(ctypes.string_at(wav, nsamples * 2))
        return 0

    # espeak parameter ids
    _RATE, _PITCH, _VOLUME = 1, 2, 32

    def synthesize(self, text: str, speed: float = 1.0, pitch: int = 50) -> bytes:
        """Return 16-bit mono PCM bytes for `text`."""
        # espeak's default is 175 words/minute; clamp to its documented 80–450.
        rate = int(max(80, min(450, round(175 * speed))))
        with self._lock:
            self._chunks.clear()
            self._lib.espeak_SetParameter(self._RATE, rate, 0)
            self._lib.espeak_SetParameter(self._PITCH, max(0, min(99, pitch)), 0)
            rc = self._lib.espeak_Synth(
                text.encode("utf-8"), 0, 0, POS_CHARACTER, 0, 0, None, None
            )
            if rc != 0:
                raise RuntimeError(f"espeak_Synth returned {rc}")
            return b"".join(self._chunks)

    def wav_bytes(self, text: str, speed: float = 1.0) -> bytes:
        pcm = self.synthesize(text, speed=speed)
        if not pcm:
            raise RuntimeError("espeak-ng produced no audio for this text")
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(self.sample_rate)
            handle.writeframes(pcm)
        return buffer.getvalue()


# ─── HTTP server ─────────────────────────────────────────────────────────────

SENTENCE_LIMIT = 4000  # characters per request; longer text is rejected, not truncated


def make_handler(engine: EspeakEngine, base_path: str):
    class Handler(BaseHTTPRequestHandler):
        server_version = "ALOLabsBanglaTTS/1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):  # quieter default logging
            sys.stderr.write("[tts] %s\n" % (fmt % args))

        def _json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _wav(self, payload: bytes) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):  # noqa: N802 - BaseHTTPRequestHandler API
            path = urlparse(self.path).path.rstrip("/") or "/"
            if path.endswith("/models") or path in {"/", base_path.rstrip("/") or "/"}:
                self._json(200, {
                    "object": "list",
                    "engine": "espeak-ng",
                    "voice": engine.voice,
                    "sample_rate": engine.sample_rate,
                    "languages": ["bn-BD"],
                    # Stated in the health payload so no caller can mistake this
                    # for a neural voice.
                    "quality": "formant-synthesis: intelligible, not human-like",
                })
                return
            self._json(404, {"error": "not found", "hint": "POST text to synthesize"})

        def do_POST(self):  # noqa: N802 - BaseHTTPRequestHandler API
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/")
            query = parse_qs(parsed.query)

            text = ""
            speed = 1.0
            if path.endswith("/audio/speech"):
                length = int(self.headers.get("Content-Length") or 0)
                if length <= 0:
                    self._json(400, {"error": "JSON body with 'input' is required"})
                    return
                try:
                    payload = json.loads(self.rfile.read(length) or b"{}")
                except json.JSONDecodeError:
                    self._json(400, {"error": "invalid JSON"})
                    return
                text = str(payload.get("input") or "")
                if isinstance(payload.get("speed"), (int, float)):
                    speed = float(payload["speed"])
            else:
                text = (query.get("text") or [""])[0]

            if not text.strip():
                self._json(400, {"error": "no text supplied"})
                return
            if len(text) > SENTENCE_LIMIT:
                self._json(413, {
                    "error": f"text exceeds {SENTENCE_LIMIT} characters",
                    "hint": "split the text; it is refused rather than silently truncated",
                })
                return

            try:
                audio = engine.wav_bytes(text, speed=max(0.5, min(2.0, speed)))
            except Exception as exc:  # noqa: BLE001 - reported to the caller verbatim
                self._json(500, {"error": str(exc)})
                return
            self._wav(audio)

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline Bangla TTS sidecar (espeak-ng).")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8880)
    parser.add_argument("--voice", default="bn", help="espeak-ng voice name (default: bn)")
    parser.add_argument("--base-path", default="", help="optional URL prefix, e.g. /v1")
    args = parser.parse_args()

    lib, data = find_espeak_bridge()
    engine = EspeakEngine(lib, data, args.voice)
    handler = make_handler(engine, args.base_path)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(
        f"Bangla TTS sidecar (espeak-ng) listening on http://{args.host}:{args.port}{args.base_path}\n"
        f"  voice={engine.voice}  rate={engine.sample_rate}Hz  engine={lib}\n"
        f"  quality: intelligible formant synthesis — NOT human-like audio.",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping", flush=True)
        server.shutdown()


if __name__ == "__main__":
    main()
