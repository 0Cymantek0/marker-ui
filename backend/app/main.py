"""Marker UI FastAPI application."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # Load .env file if present

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import UPLOAD_DIR, OUTPUT_DIR
from app.database import create_tables
from app.routes import convert, settings
from app.services.marker_service import MarkerService
from app.services.task_manager import TaskManager

logger = logging.getLogger(__name__)


class _AppState:
    """Holds long-lived service instances for the running app."""

    def __init__(self) -> None:
        self.marker_service: MarkerService = MarkerService()
        self.task_manager: TaskManager = TaskManager()


_app_state = _AppState()


def _load_models_background() -> None:
    import threading

    def _worker() -> None:
        t0 = time.perf_counter()
        try:
            _app_state.marker_service.initialize()
            logger.info(
                "MarkerService initialised in %.1f s", time.perf_counter() - t0
            )
        except Exception:
            logger.warning(
                "MarkerService could not load models - conversion endpoints will "
                "retry lazily on first request.",
                exc_info=True,
            )

    t = threading.Thread(target=_worker, daemon=True)
    t.start()


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    """Startup: initialise models & tables. Shutdown: cleanup."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Ensure data dirs
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Create DB tables
    await create_tables()

    _load_models_background()

    yield

    # Shutdown
    _app_state.task_manager._executor.shutdown(wait=False)
    logger.info("Shutdown complete")


app = FastAPI(
    title="Marker UI API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(convert.router)
app.include_router(settings.router)



@app.get("/api/health")
async def health_check() -> dict[str, str]:
    """Lightweight liveness probe."""
    return {"status": "ok"}
