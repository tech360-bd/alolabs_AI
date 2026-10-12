# ALO Labs Avatar Video Studio AI Agent
### The Ultimate Local-First Speaking Head Video Creator

ALO Labs Avatar Video Studio AI Agent is a privacy-first, local-capable talking-head video generator. It runs locally using your own laptop resources (macOS, Windows, or Linux) and integrates with **Ollama** and popular free LLMs (OpenRouter, Gemini, Groq) to let you write scripts, compile voices, synthesize speech waveforms, auto-generate subtitle timings, and package complete promotional reels or explainer videos with brand themes (like ALO Labs, Tech360, ALO Education).

---

## 🚀 Core Features
1. **Interactive Multi-Agent Orchestrator**
   - **Boss Agent**: Manages sequence state and routes tasks across individual agents.
   - **Script Agent**: Generates professional hooks, scene visual breakdowns, and bilingual scripts.
   - **Compliance Agent**: Checks content to ensure there is no deception, copyright risk, or misinformation.
   - **Voice Agent**: Orchestrates with TTS engines (Piper, Edge-TTS) to structure pacing, pitch, and duration.
   - **Video Editor Agent**: Integrates FFmpeg scripting to compile assets, overlays, watermark, and subtitles.
   - **Subtitle Agent**: Synchronizes speech transcripts with precise timestamps (VTT/SRT).
   - **Marketing Agent**: Automatically outputs description meta, captions, and tags.
2. **Local-First Audio/Video Pipeline**
   - Fallback video generator drawing responsive speech soundwaves on top of custom background animations in case of lower-end CPU hardware limitations.
   - Integration with ffmpeg command line scripts for swift combination.
3. **Pristine Brand Kit Customizer**
   - Auto-applies custom colors, hex styling, primary instructor avatars, contact numbers, and lower-third typography for multiple target brands like ALO Education, Tech360, etc.

---

## 🛠️ Local Machine Setup

### Prerequisites
- **Python**: v3.9+ installed.
- **FFmpeg**: Must be available on system `$PATH` for video stitching.
- **Ollama**: Installed and running locally (optional but recommended for complete offline support).

### macOS Quick Install
```bash
cd alo-avatar-video-studio
chmod +x scripts/install_mac.sh
./scripts/install_mac.sh
```

### Windows Install (PowerShell)
```powershell
Set-ExecutionPolicy Bypass -Scope Process
.\scripts\install_windows.ps1
```

---

## 🤖 Activating Local Models (Ollama)
1. Install Ollama from [ollama.com](https://ollama.com).
2. Download any lightweight LLM (e.g. `gemma2:2b`, `llama3:8b`, or `qwen2.5:1.5b`):
   ```bash
   ollama pull gemma:2b
   ```
3. Make sure Ollama is listening locally on its default port (`http://localhost:11434`). The studio will auto-detect and router requests offline through it!

---

## 🌟 License & Governance
Designed under ALO Labs. Safe usage is guaranteed via non-deepfake compliance auditing logic. AI disclosure marker badges are suggested during visual compilations. All video clips and subtitles are generated local-first with zero tracking.
