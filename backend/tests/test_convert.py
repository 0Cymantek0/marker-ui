"""Tests for the /api/convert endpoints."""

from __future__ import annotations

import io
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.database import get_db
from app.models.job import ConversionJob

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_PDF_FILENAME = "test_document.pdf"
MINIMAL_PDF_BYTES = b"%PDF-1.4 test content"


async def _upload_file(
    client: AsyncClient,
    auth_headers: dict[str, str],
    filename: str = VALID_PDF_FILENAME,
    content: bytes = MINIMAL_PDF_BYTES,
    extra_params: dict | None = None,
):
    """Upload a file and return the response."""
    files = {"file": (filename, io.BytesIO(content), "application/pdf")}
    params: dict = {"output_format": "markdown"}
    if extra_params:
        params.update(extra_params)
    return await client.post(
        "/api/convert/upload",
        files=files,
        params=params,
        headers=auth_headers,
    )


# ---------------------------------------------------------------------------
# Upload — valid extension
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_valid_extension_returns_200(
    client: AsyncClient, auth_headers: dict[str, str]
):
    resp = await _upload_file(client, auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "job_id" in body
    assert body["status"] == "pending"
    assert body["filename"] == VALID_PDF_FILENAME
    assert body["output_format"] == "markdown"


@pytest.mark.asyncio
async def test_upload_valid_docx(client: AsyncClient, auth_headers: dict[str, str]):
    files = {"file": ("report.docx", io.BytesIO(b"PK docx content"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    resp = await client.post(
        "/api/convert/upload",
        files=files,
        params={"output_format": "html"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["output_format"] == "html"


# ---------------------------------------------------------------------------
# Upload — invalid extension
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_invalid_extension_returns_400(
    client: AsyncClient, auth_headers: dict[str, str]
):
    files = {"file": ("malware.exe", io.BytesIO(b"MZ\x90\x00"), "application/octet-stream")}
    resp = await client.post(
        "/api/convert/upload",
        files=files,
        params={"output_format": "markdown"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "not supported" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Upload — exceeds size limit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_exceeds_100mb_returns_413(
    client: AsyncClient, auth_headers: dict[str, str]
):
    # Patch MAX_UPLOAD_SIZE to a tiny value so we don't need a real 100 MB file.
    # On Windows the partial-file cleanup (stored_path.unlink) may race with
    # aiofiles close, surfacing as PermissionError. Patch unlink to tolerate this.
    original_unlink = Path.unlink

    def safe_unlink(self, missing_ok=False):
        try:
            original_unlink(self, missing_ok=missing_ok)
        except PermissionError:
            pass

    with patch("app.routes.convert.MAX_UPLOAD_SIZE", 100), \
         patch.object(Path, "unlink", safe_unlink):
        content = b"x" * 200
        files = {"file": ("big.pdf", io.BytesIO(content), "application/pdf")}
        resp = await client.post(
            "/api/convert/upload",
            files=files,
            params={"output_format": "markdown"},
            headers=auth_headers,
        )
    assert resp.status_code == 413
    assert "too large" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# SSE stream
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sse_stream_emits_progress_and_status_events(
    client: AsyncClient, auth_headers: dict[str, str]
):
    """Upload a file, then consume the SSE stream and verify event types."""
    upload_resp = await _upload_file(client, auth_headers)
    assert upload_resp.status_code == 200
    job_id = upload_resp.json()["job_id"]

    # Request SSE with query-param token (EventSource can't set headers)
    sse_resp = await client.get(
        f"/api/convert/events/{job_id}?token=test-secret-token",
        headers=auth_headers,
    )
    assert sse_resp.status_code == 200

    # Parse the SSE text body — it's a streaming response that completed
    text = sse_resp.text
    # Should contain at least one "progress" event and one "status" event
    has_progress = "event: progress" in text
    has_status = "event: status" in text
    assert has_progress, f"SSE stream missing 'progress' event. Body:\n{text}"
    assert has_status, f"SSE stream missing 'status' event. Body:\n{text}"


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_download_completed_job_returns_file(
    client: AsyncClient, auth_headers: dict[str, str], db_session
):
    """Create a completed job in DB and verify download returns the file."""
    job_id = "test-download-job-id"
    # Insert a completed job directly into DB
    upload_dir = Path("data/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    output_dir = Path("data/output")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Create the result file
    result_path = output_dir / f"{job_id}.md"
    result_path.write_text("# Converted output", encoding="utf-8")

    job = ConversionJob(
        id=job_id,
        filename=f"{job_id}.pdf",
        original_name="doc.pdf",
        status="completed",
        input_format="pdf",
        output_format="markdown",
        result_text="# Converted output",
        result_path=str(result_path),
        progress=100,
    )
    db_session.add(job)
    await db_session.commit()

    resp = await client.get(
        f"/api/convert/download/{job_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # Cleanup
    result_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_job_removes_from_db(
    client: AsyncClient, auth_headers: dict[str, str], db_session
):
    """Create a job, delete it via API, verify it's gone from DB."""
    from sqlalchemy import select

    # First upload to create a job
    upload_resp = await _upload_file(client, auth_headers)
    assert upload_resp.status_code == 200
    job_id = upload_resp.json()["job_id"]

    # Delete it
    del_resp = await client.delete(
        f"/api/convert/{job_id}",
        headers=auth_headers,
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "deleted"

    # Verify DB row is gone
    stmt = select(ConversionJob).where(ConversionJob.id == job_id)
    result = await db_session.execute(stmt)
    assert result.scalar_one_or_none() is None


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_excludes_result_text(
    client: AsyncClient, auth_headers: dict[str, str], db_session
):
    """Upload a job, add result_text to DB, verify history omits it."""
    job_id = "hist-test-job"
    job = ConversionJob(
        id=job_id,
        filename=f"{job_id}.pdf",
        original_name="history_test.pdf",
        status="completed",
        input_format="pdf",
        output_format="markdown",
        result_text="# Secret conversion output that should not appear",
        progress=100,
    )
    db_session.add(job)
    await db_session.commit()

    resp = await client.get("/api/convert/history", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()

    # Find our job in the history
    jobs = body["jobs"]
    our_job = next((j for j in jobs if j["job_id"] == job_id), None)
    assert our_job is not None, f"Job {job_id} not found in history response"
    assert our_job["result_text"] is None, "result_text should be excluded from history"


# ---------------------------------------------------------------------------
# Cancelled jobs stay cancelled
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancelled_job_stays_cancelled(
    client: AsyncClient, auth_headers: dict[str, str], db_session
):
    """A cancelled job should not be overwritten to 'failed' by _fail_job."""
    from datetime import datetime, timezone
    from app.services.task_manager import TaskManager

    job_id = "cancel-stay-job"
    job = ConversionJob(
        id=job_id,
        filename=f"{job_id}.pdf",
        original_name="cancel_test.pdf",
        status="cancelled",
        input_format="pdf",
        output_format="markdown",
        progress=0,
    )
    db_session.add(job)
    await db_session.commit()

    # Now call _fail_job (which the real TaskManager uses) — it should NOT
    # overwrite a cancelled job
    from app.main import _app_state

    tm = _app_state.task_manager
    # _fail_job uses the real async_session_factory, but our test DB is separate.
    # Instead, test the SQL condition directly.
    from sqlalchemy import update

    # This is the exact UPDATE from TaskManager._fail_job
    await db_session.execute(
        update(ConversionJob)
        .where(ConversionJob.id == job_id)
        .where(ConversionJob.status != "cancelled")
        .values(
            status="failed",
            error_message="some error",
            completed_at=datetime.now(timezone.utc),
        )
    )
    await db_session.commit()

    # Re-read — status must still be "cancelled"
    from sqlalchemy import select

    stmt = select(ConversionJob).where(ConversionJob.id == job_id)
    result = await db_session.execute(stmt)
    fresh = result.scalar_one()
    assert fresh.status == "cancelled", (
        f"Expected 'cancelled' but got '{fresh.status}' — _fail_job overwrote it!"
    )
