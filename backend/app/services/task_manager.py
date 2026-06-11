"""Async task manager for background conversion jobs."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator

import aiofiles
from fastapi import Request
from sse_starlette.event import ServerSentEvent

from app.database import async_session_factory
from app.models.job import ConversionJob

logger = logging.getLogger(__name__)

SSE_TIMEOUT_SECONDS = 30 * 60  # 30 minutes


class TaskManager:
    """Manages background conversion tasks with progress tracking."""

    def __init__(self, max_workers: int = 2) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._tasks: dict[str, asyncio.Future[Any]] = {}
        self._progress: dict[str, int] = {}
        self._pids: dict[str, int] = {}

    # ------------------------------------------------------------------
    # Submit
    # ------------------------------------------------------------------

    def submit_job(
        self,
        job_id: str,
        filepath: str,
        config: dict[str, Any],
        marker_service: Any,
    ) -> None:
        """Start conversion in the thread pool and track the future."""
        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(
            self._executor,
            self._run_conversion,
            job_id,
            filepath,
            config,
            marker_service,
        )
        self._tasks[job_id] = future
        self._progress[job_id] = 0

        def _on_done(fut: asyncio.Future[Any]) -> None:
            exc = fut.exception()
            if exc:
                logger.error("Job %s failed: %s", job_id, exc)
            self._tasks.pop(job_id, None)

        future.add_done_callback(_on_done)

    # ------------------------------------------------------------------
    # Status helpers
    # ------------------------------------------------------------------

    def get_status(self, job_id: str) -> dict[str, Any]:
        """Return current in-memory progress for *job_id*."""
        progress = self._progress.get(job_id, 0)
        future = self._tasks.get(job_id)
        if future is None:
            status = "completed" if progress >= 100 else "pending"
        elif future.done():
            exc = future.exception()
            status = "failed" if exc else "completed"
        else:
            status = "processing"
        return {"job_id": job_id, "status": status, "progress": progress}

    async def cancel_job(self, job_id: str) -> bool:
        """Attempt to cancel a running job and kill its underlying process."""
        future = self._tasks.get(job_id)
        if future and not future.done():
            cancelled = future.cancel()
            self._progress.pop(job_id, None)
            self._tasks.pop(job_id, None)

            pid = self._pids.pop(job_id, None)
            if pid is not None:
                self._kill_pid(pid)

            await self._update_job_status(job_id, "cancelled")
            return cancelled
        return False

    @staticmethod
    def _kill_pid(pid: int) -> None:
        try:
            if sys.platform == "win32":
                subprocess.call(
                    ["taskkill", "/F", "/PID", str(pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                os.kill(pid, signal.SIGTERM)
                for _ in range(10):
                    try:
                        os.waitpid(pid, os.WNOHANG)
                    except ChildProcessError:
                        break
                    import time
                    time.sleep(0.5)
                else:
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
        except (ProcessLookupError, PermissionError, OSError):
            pass

    # ------------------------------------------------------------------
    # SSE event generator
    # ------------------------------------------------------------------

    async def job_events(self, request: Request, job_id: str) -> AsyncGenerator[ServerSentEvent, None]:
        """Yield SSE events with progress updates until the job is done.

        Detects client disconnects via *request* and enforces an overall
        timeout of SSE_TIMEOUT_SECONDS.
        """
        last_progress = -1
        elapsed = 0.0

        while True:
            if await request.is_disconnected():
                # Release the SSE connection handler, but DO NOT pop/cancel the background task!
                # This allows the background conversion task to continue executing and allows
                # the client to reconnect or query status later.
                return

            info = self.get_status(job_id)
            progress = info["progress"]
            status = info["status"]

            if progress != last_progress or status in ("completed", "failed", "cancelled"):
                last_progress = progress
                is_terminal = status in ("completed", "failed", "cancelled")
                event_type = "status" if is_terminal else "progress"
                yield ServerSentEvent(
                    data=json.dumps(info),
                    event=event_type,
                )

            if status in ("completed", "failed", "cancelled"):
                break

            await asyncio.sleep(0.5)
            elapsed += 0.5
            if elapsed >= SSE_TIMEOUT_SECONDS:
                yield ServerSentEvent(
                    data=json.dumps({"job_id": job_id, "status": "timeout", "progress": progress}),
                    event="progress",
                )
                break

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _run_conversion(
        self,
        job_id: str,
        filepath: str,
        config: dict[str, Any],
        marker_service: Any,
    ) -> dict[str, Any]:
        """Runs inside ThreadPoolExecutor — updates DB on completion."""
        self._pids[job_id] = os.getpid()
        try:
            self._progress[job_id] = 10
            result = marker_service.convert_file(filepath, dict(config))
            self._progress[job_id] = 90

            # Persist result synchronously via a new async loop
            try:
                asyncio.run(
                    self._finalize_job(job_id, result, config)
                )
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    loop.run_until_complete(
                        self._finalize_job(job_id, result, config)
                    )
                finally:
                    loop.close()
            self._progress[job_id] = 100
            return result
        except Exception as exc:
            logger.exception("Conversion failed for job %s", job_id)
            self._progress[job_id] = 0
            try:
                asyncio.run(self._fail_job(job_id, str(exc)))
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    loop.run_until_complete(self._fail_job(job_id, str(exc)))
                finally:
                    loop.close()
            except Exception:
                logger.exception("Failed to record error for job %s", job_id)
            raise
        finally:
            self._pids.pop(job_id, None)

    # ------------------------------------------------------------------
    # DB helpers (async — called via asyncio.run from thread)
    # ------------------------------------------------------------------

    async def _update_job_status(self, job_id: str, status: str) -> None:
        async with async_session_factory() as session:
            from sqlalchemy import select, update

            await session.execute(
                update(ConversionJob)
                .where(ConversionJob.id == job_id)
                .values(status=status)
            )
            await session.commit()

    async def _finalize_job(
        self,
        job_id: str,
        result: dict[str, Any],
        config: dict[str, Any],
    ) -> None:
        result_text = result.get("text", "")
        images = result.get("images", {})
        output_format = config.get("output_format", "markdown")
        original_name = config.get("original_name", "output")
        local_filepath = config.get("local_filepath")
        output_dir = config.get("output_dir")

        ext_map = {"markdown": "md", "json": "json", "html": "html", "chunks": "json"}
        extension = ext_map.get(output_format, "md")

        # Determine target base directory
        if output_dir:
            target_dir = Path(output_dir)
        elif local_filepath:
            target_dir = Path(local_filepath).parent
        else:
            target_dir = Path("data/output")

        target_dir.mkdir(parents=True, exist_ok=True)

        # We save as a directory if images are extracted
        has_images = bool(images) and not config.get("disable_image_extraction", False)

        if has_images:
            if output_dir or local_filepath:
                stem = Path(original_name).stem
                job_output_dir = target_dir / stem
            else:
                job_output_dir = target_dir / job_id

            job_output_dir.mkdir(parents=True, exist_ok=True)

            # Save the main document
            doc_name = f"{Path(original_name).stem}.{extension}"
            doc_path = job_output_dir / doc_name
            async with aiofiles.open(doc_path, "w", encoding="utf-8") as f:
                await f.write(result_text)

            # Save extracted images
            for img_name, img in images.items():
                img_path = job_output_dir / img_name
                try:
                    if hasattr(img, "save"):
                        img.save(img_path)
                    else:
                        img_path.write_bytes(img)
                except Exception as e:
                    logger.error("Failed to save image %s: %s", img_name, e)

            final_path = job_output_dir
        else:
            if output_dir or local_filepath:
                stem = Path(original_name).stem
                doc_path = target_dir / f"{stem}.{extension}"
            else:
                doc_path = target_dir / f"{job_id}.{extension}"

            async with aiofiles.open(doc_path, "w", encoding="utf-8") as f:
                await f.write(result_text)

            final_path = doc_path

        async with async_session_factory() as session:
            from sqlalchemy import update

            await session.execute(
                update(ConversionJob)
                .where(ConversionJob.id == job_id)
                .values(
                    status="completed",
                    result_text=result_text,
                    result_path=str(final_path),
                    progress=100,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()

    async def _fail_job(self, job_id: str, error_message: str) -> None:
        async with async_session_factory() as session:
            from sqlalchemy import update

            # Only mark as failed if not already in a terminal state (e.g. cancelled)
            await session.execute(
                update(ConversionJob)
                .where(ConversionJob.id == job_id)
                .where(ConversionJob.status != "cancelled")
                .values(
                    status="failed",
                    error_message=error_message,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()
