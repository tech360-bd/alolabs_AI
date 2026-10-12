#!/bin/bash

echo "=========================================================="
echo "   ALO Labs Avatar Video Studio - macOS Installation      "
echo "=========================================================="

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed."
    echo "Please download and install python3 from python.org."
    exit 1
fi

# Check for FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️ Warning: FFmpeg command utility not found on your path."
    echo "Please run: 'brew install ffmpeg' to ensure seamless video rendering!"
fi

# Check for Ollama
if ! command -v ollama &> /dev/null; then
    echo "💡 Tip: Ollama is not installed. To run models local-first,"
    echo "visit https://ollama.com to install and download gemma2 / llama3 models."
fi

# Setup Virtual Environment
echo "📦 Setting up Python virtual environment (venv)..."
python3 -m venv venv
source venv/bin/activate

# Install requirements
echo "📥 Installing python packages..."
pip install --upgrade pip
pip install fastapi uvicorn pydantic pydantic-settings requests Edge-TTS

# Done
echo "=========================================================="
echo "⭐️ Setup Complete!"
echo "Run this command to boot the local FastAPI server:"
echo "  ./scripts/run_local.sh"
echo "=========================================================="
