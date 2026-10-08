import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

DATA_DIR = BACKEND_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "papers.db"

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.meta.ai/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "muse-spark-1.3")
S2_API_KEY = os.getenv("S2_API_KEY", "")

# Safety cap on how much paper text is sent to the LLM per request.
MAX_CONTEXT_CHARS = int(os.getenv("MAX_CONTEXT_CHARS", "200000"))

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
