import JSZip from "jszip";
import { Project } from "./data";

export async function generateProjectZip(project?: Project): Promise<Blob> {
  const zip = new JSZip();

  // Root files
  zip.file(".env.example", `LOCAL_FIRST=TRUE
PAID_API_REQUIRED=FALSE
PRIVATE_DATA_MODE=TRUE

# Optional API Keys for online models
GEMINI_API_KEY=""
OPENROUTER_API_KEY=""
`);

  zip.file("docker-compose.yml", `version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    container_name: alo_avatar_backend
    ports:
      - "8000:8000"
    volumes:
      - ./storage:/storage
    environment:
      - LOCAL_FIRST=TRUE
      - PRIVATE_DATA_MODE=TRUE
    restart: unless-stopped

  frontend:
    image: nginx:alpine
    container_name: alo_avatar_frontend
    ports:
      - "3000:80"
    volumes:
      - ./frontend:/usr/share/nginx/html
    restart: unless-stopped
`);

  zip.file("database.sql", `-- ==========================================
-- ALO Labs Avatar Video Studio AI Agent
-- Complete MySQL Schema + Seed Data
-- ==========================================

CREATE DATABASE IF NOT EXISTS aloeduca_alo_crm;
USE aloeduca_alo_crm;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'counselor', 'student', 'partner') NOT NULL DEFAULT 'student',
  status ENUM('active', 'inactive') DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(50) PRIMARY KEY,
  project_name VARCHAR(255) NOT NULL,
  brand_name VARCHAR(100),
  video_type VARCHAR(100),
  language VARCHAR(50),
  duration INT,
  platform VARCHAR(100),
  script TEXT,
  avatar_id VARCHAR(50),
  voice_id VARCHAR(50),
  status VARCHAR(50)
);

INSERT INTO users (email, password, full_name, role) VALUES
('admin@aloeducation.com', 'admin123', 'ALO Labs Admin Operator', 'admin');
`);

  zip.file("README.md", `# ALO Labs Avatar Video Studio AI Agent
Run this repository on your macOS, Windows or Linux local machine for private speech video generation.

## 🛠️ Instructions
1. Run \`./scripts/install_mac.sh\` on Mac, or execute powershell setup on Windows.
2. Install **Ollama** and fetch model: \`ollama pull gemma:2b\`.
3. Launch via \`./scripts/run_local.sh\`.
4. Open \`http://localhost:8000\` in your browser!
`);

  // Scripts Folder
  const scriptsFolder = zip.folder("scripts");
  if (scriptsFolder) {
    scriptsFolder.file("install_mac.sh", `#!/bin/bash
echo "Installing ALO Avatar Video Studio dependencies macOS..."
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn requests Edge-TTS pydantic pydantic-settings
echo "Setup is complete. Start with run_local.sh"
`);
    
    scriptsFolder.file("run_local.sh", `#!/bin/bash
source venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
`);

    scriptsFolder.file("install_windows.ps1", `Write-Host "Setting up ALO Avatar Video Studio on Windows..."
python -m venv venv
.\\venv\\Scripts\\Activate.ps1
pip install fastapi uvicorn requests Edge-TTS pydantic pydantic-settings
Write-Host "Setup Completed! Run uvicorn backend.main:app --reload"
`);
  }

  // Backend Folder
  const backendFolder = zip.folder("backend");
  if (backendFolder) {
    backendFolder.file("main.py", `import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3

app = FastAPI(title="ALO Labs Avatar Studio")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "online", "message": "Offline Python-FastAPI Backend responding successfully!"}
`);
    
    backendFolder.file("config.py", `from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    LOCAL_FIRST: bool = True
    PAID_API_REQUIRED: bool = False
    OLLAMA_BASE_URL: str = "http://localhost:11434"

settings = Settings()
`);

    backendFolder.file("database.py", `import sqlite3
import os

DB_PATH = "storage/studio.db"

def get_connection():
    return sqlite3.connect(DB_PATH)
`);

    backendFolder.file("models.py", `from pydantic import BaseModel
from typing import Optional

class ProjectSchema(BaseModel):
    projectName: str
    brandName: str
    videoType: str
    language: str
    duration: str
    platform: str
`);
  }

  // If there's an active project being generated, write its details to the package
  if (project && project.script) {
    const projFolder = zip.folder("active_project_package");
    if (projFolder) {
      projFolder.file("project_info.json", JSON.stringify(project, null, 2));
      projFolder.file("generated_complete_script.txt", `=== SCRIPT BRIEF: ${project.projectName} ===
Brand: ${project.brandName}
Target Platform: ${project.platform}
Video Type: ${project.videoType}

--- THE HOOK ---
${project.script.hook}

--- BODY CONTENT ---
${project.script.mainScript}

--- CALL TO ACTION ---
${project.script.cta}

--- MARKETING CAPTION ---
${project.script.caption}

--- HASHTAGS ---
${project.script.tags}
`);

      // Write subtitle timings if available
      if (project.subtitles && project.subtitles.length > 0) {
        let srtContent = "";
        let vttContent = "WEBVTT\n\n";

        project.subtitles.forEach((s) => {
          srtContent += `${s.id}\n${s.startTime.replace(".", ",")} --> ${s.endTime.replace(".", ",")}\n${s.text}\n\n`;
          vttContent += `${s.startTime} --> ${s.endTime}\n${s.text}\n\n`;
        });

        projFolder.file("subtitles.srt", srtContent);
        projFolder.file("subtitles.vtt", vttContent);
      }
    }
  }

  return await zip.generateAsync({ type: "blob" });
}
