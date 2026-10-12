import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    LOCAL_FIRST: bool = True
    PAID_API_REQUIRED: bool = False
    PRIVATE_DATA_MODE: bool = True
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_DEFAULT_MODEL: str = "gemma2:2b"
    TTS_ENGINE: str = "edge-tts"
    WHISPER_MODEL_SIZE: str = "base"
    DEFAULT_LANGUAGE: str = "Bilingual"

    class Config:
        env_file = ".env"

settings = Settings()
