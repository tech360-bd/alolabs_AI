from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class Project(BaseModel):
    id: str
    project_name: str
    brand_name: str
    video_type: str
    language: str
    duration: str
    platform: str
    script: Optional[str] = None
    avatar_id: Optional[str] = None
    voice_id: Optional[str] = None
    status: str = "draft"
    output_folder: Optional[str] = None

class BrandKit(BaseModel):
    brand_key: str
    brand_name: str
    primary_color: str
    accent_color: str
    cta_text: str
    website: str
    phone: Optional[str] = None
    email: Optional[str] = None
