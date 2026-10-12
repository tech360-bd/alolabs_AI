import os
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import sqlite3

app = FastAPI(
    title="ALO Labs Avatar Video Studio AI Agent Backend",
    description="Local-first speaking head video creation and multi-agent workflow platform",
    version="1.0.0"
)

# Enable CORS for local React/Vite communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SQLite database setup helper
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "storage", "studio.db")

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            project_name TEXT NOT NULL,
            brand_name TEXT,
            video_type TEXT,
            language TEXT,
            duration TEXT,
            platform TEXT,
            script TEXT,
            avatar_id TEXT,
            voice_id TEXT,
            status TEXT,
            output_folder TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS brand_kits (
            brand_key TEXT PRIMARY KEY,
            brand_name TEXT NOT NULL,
            primary_color TEXT,
            accent_color TEXT,
            cta_text TEXT,
            website TEXT,
            phone TEXT,
            email TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()

# Models
class ProjectCreate(BaseModel):
    projectName: str
    brandName: str
    videoType: str
    language: str
    duration: str
    platform: str
    avatarId: str
    voiceId: str

@app.get("/")
def read_root():
    return {"status": "online", "message": "ALO Labs Avatar Video Studio running locally!"}

@app.get("/api/projects")
def get_projects():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM projects ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(ix) for ix in rows]

@app.post("/api/projects")
def create_project(proj: ProjectCreate):
    import uuid
    from datetime import datetime
    proj_id = f"proj_{uuid.uuid4().hex[:8]}"
    created_at = datetime.utcnow().isoformat()
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO projects (id, project_name, brand_name, video_type, language, duration, platform, status, avatar_id, voice_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        proj_id, proj.projectName, proj.brandName, proj.videoType, proj.language,
        proj.duration, proj.platform, "draft", proj.avatarId, proj.voiceId, created_at, created_at
    ))
    conn.commit()
    conn.close()
    return {"id": proj_id, "projectName": proj.projectName, "status": "draft"}

@app.post("/api/ai/command")
def process_command(payload: dict):
    command = payload.get("command", "")
    # Simulation orchestration logic for the multi-agent system
    return {
        "status": "success",
        "logs": [
            "🤖 [Boss Agent] Parsing visual intent for command: " + command,
            "✍️ [Script Agent] Composing high-quality b-roll segments & vocal overlays...",
            "🗣️ [Voice Agent] Rendering script lines locally off Edge-TTS core...",
            "⚖️ [Compliance Agent] Content authenticated against impersonation standards. All clear!",
            "🎬 [Video Editor Agent] Video assets packaged into /exports successfully!"
        ],
        "project": {
            "projectName": "Quick-Created Avatar Video",
            "brandName": "ALO Education",
            "videoType": "social_reel",
            "status": "ready"
        }
    }
