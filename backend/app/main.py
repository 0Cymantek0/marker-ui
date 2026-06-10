"""Marker UI FastAPI application."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # Load .env file if present

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.auth import get_api_token, verify_token


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

    logger.info("API Token: %s", get_api_token())

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


class AccessTokenMiddleware(BaseHTTPMiddleware):
    """Optional access token check. Only active if MARKER_ACCESS_TOKEN is set."""

    async def dispatch(self, request, call_next):
        from app.core.config import ACCESS_TOKEN

        # Skip non-API paths (frontend static files)
        if not request.url.path.startswith("/api/"):
            return await call_next(request)
        # Skip health endpoint
        if request.url.path == "/api/health":
            return await call_next(request)
        # If no token configured, allow all
        if not ACCESS_TOKEN:
            return await call_next(request)
        # Check header
        provided = request.headers.get("x-access-token", "")
        if provided != ACCESS_TOKEN:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing access token"},
            )
        return await call_next(request)


app.add_middleware(AccessTokenMiddleware)

# Routers
app.include_router(convert.router, dependencies=[Depends(verify_token)])
app.include_router(settings.router, dependencies=[Depends(verify_token)])



@app.get("/api/health")
async def health_check() -> dict[str, str]:
    """Lightweight liveness probe."""
    return {"status": "ok"}
