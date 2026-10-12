#!/bin/bash

echo "=========================================================="
echo "   Starting ALO Labs Avatar Video Studio Locally...       "
echo "=========================================================="

# Activate virtual environment if exists
if [ -d "venv" ]; then
    echo "⚡ Activating Python Virtual Environment..."
    source venv/bin/activate
fi

# Run FastAPI under standard port 8000
echo "🚀 Booting FastAPI on http://localhost:8000..."
python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
