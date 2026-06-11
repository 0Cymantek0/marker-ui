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
from app.routes import convert, settings, models
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
    from app.services.model_tracker import tracker, check_models_downloaded

    # If already initialized, do nothing
    if tracker.get_status_dict()["initialized"]:
        return

    # Reset tracker state for a fresh session
    tracker.reset()

    # If already downloaded, set to loading state
    if check_models_downloaded():
        tracker.set_loading(True)

    def _worker() -> None:
        t0 = time.perf_counter()
        try:
            _app_state.marker_service.initialize()
            logger.info(
                "MarkerService initialised in %.1f s", time.perf_counter() - t0
            )
        except Exception as exc:
            if tracker.cancel_requested:
                tracker.set_cancelled()
                logger.info("MarkerService initialization cancelled by user.")
            else:
                tracker.set_failed(str(exc))
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

    # Load secrets cache and register live API interceptor monkeypatch
    from app.core.api_manager import load_secrets_from_db, setup_api_manager_monkeypatch
    from app.routes.settings import init_llm_providers_if_missing
    from app.database import async_session_factory
    async with async_session_factory() as session:
        await init_llm_providers_if_missing(session)
    await load_secrets_from_db()
    setup_api_manager_monkeypatch()

    # Mark stale pending/processing jobs from previous sessions as failed
    from app.database import async_session_factory
    from app.models.job import ConversionJob
    from sqlalchemy import update
    from datetime import datetime, timezone
    async with async_session_factory() as session:
        try:
            await session.execute(
                update(ConversionJob)
                .where(ConversionJob.status.in_(["pending", "processing"]))
                .values(
                    status="failed",
                    error_message="Interrupted by server restart",
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()
            logger.info("Stale pending/processing jobs from prior session marked as failed.")
        except Exception as e:
            logger.error("Failed to clean up stale jobs on startup: %s", e)

    # Apply download tracker monkeypatching
    from app.services.model_tracker import setup_monkeypatch, register_retry_callback
    setup_monkeypatch()
    register_retry_callback(_load_models_background)

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
app.include_router(models.router)



@app.get("/api/health")
async def health_check() -> dict[str, str]:
    """Lightweight liveness probe."""
    return {"status": "ok"}
