"""Application configuration loaded from environment variables."""

import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
OUTPUT_DIR = DATA_DIR / "output"
DB_PATH = DATA_DIR / "marker_ui.db"

# Server
HOST: str = os.getenv("MARKER_HOST", "127.0.0.1")
PORT: int = int(os.getenv("MARKER_PORT", "8000"))
DEBUG: bool = os.getenv("MARKER_DEBUG", "false").lower() in ("true", "1", "yes")

MAX_UPLOAD_SIZE: int = int(os.getenv("MARKER_MAX_UPLOAD_SIZE_MB", "100")) * 1024 * 1024

# Database
DATABASE_URL: str = os.getenv("MARKER_DATABASE_URL", f"sqlite+aiosqlite:///{DB_PATH}")

# Encryption
SECRET_KEY_PATH: Path = DATA_DIR / ".secret_key"
