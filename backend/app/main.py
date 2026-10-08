import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import LLM_API_KEY, LLM_MODEL
from .db import init_db
from .routes import ai, papers, search

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="AI Research Assistant", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(search.router)
app.include_router(papers.router)
app.include_router(ai.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "llm_model": LLM_MODEL, "llm_configured": bool(LLM_API_KEY)}
