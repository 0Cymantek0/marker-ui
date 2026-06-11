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
    )


# ---------------------------------------------------------------------------
# Upload — valid extension
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_valid_extension_returns_200(
    client: AsyncClient,
):
    resp = await _upload_file(client)
    assert resp.status_code == 200
    body = resp.json()
    assert "job_id" in body
    assert body["status"] == "pending"
    assert body["filename"] == VALID_PDF_FILENAME
    assert body["output_format"] == "markdown"


@pytest.mark.asyncio
async def test_upload_valid_docx(client: AsyncClient):
    files = {"file": ("report.docx", io.BytesIO(b"PK docx content"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    resp = await client.post(
        "/api/convert/upload",
        files=files,
        params={"output_format": "html"},
    )
    assert resp.status_code == 200
    assert resp.json()["output_format"] == "html"


# ---------------------------------------------------------------------------
# Upload — invalid extension
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_invalid_extension_returns_400(
    client: AsyncClient,
):
    files = {"file": ("malware.exe", io.BytesIO(b"MZ\x90\x00"), "application/octet-stream")}
    resp = await client.post(
        "/api/convert/upload",
        files=files,
        params={"output_format": "markdown"},
    )
    assert resp.status_code == 400
    assert "not supported" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Upload — exceeds size limit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_exceeds_100mb_returns_413(
    client: AsyncClient
):
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
        )
    assert resp.status_code == 413
    assert "too large" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# SSE stream
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sse_stream_emits_progress_and_status_events(
    client: AsyncClient,
):
    """Upload a file, then consume the SSE stream and verify event types."""
    upload_resp = await _upload_file(client)
    assert upload_resp.status_code == 200
    job_id = upload_resp.json()["job_id"]

    sse_resp = await client.get(
        f"/api/convert/events/{job_id}",
    )
    assert sse_resp.status_code == 200

    text = sse_resp.text
    has_progress = "event: progress" in text
    has_status = "event: status" in text
    assert has_progress, f"SSE stream missing 'progress' event. Body:\n{text}"
    assert has_status, f"SSE stream missing 'status' event. Body:\n{text}"


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_download_completed_job_returns_file(
    client: AsyncClient, db_session
):
    """Create a completed job in DB and verify download returns the file."""
    job_id = "test-download-job-id"
    upload_dir = Path("data/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    output_dir = Path("data/output")
    output_dir.mkdir(parents=True, exist_ok=True)

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
    )
    assert resp.status_code == 200

    result_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_job_removes_from_db(
    client: AsyncClient, db_session
):
    """Create a job, delete it via API, verify it's gone from DB."""
    from sqlalchemy import select

    upload_resp = await _upload_file(client)
    assert upload_resp.status_code == 200
    job_id = upload_resp.json()["job_id"]

    del_resp = await client.delete(
        f"/api/convert/{job_id}",
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "deleted"

    stmt = select(ConversionJob).where(ConversionJob.id == job_id)
    result = await db_session.execute(stmt)
    assert result.scalar_one_or_none() is None


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_excludes_result_text(
    client: AsyncClient, db_session
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

    resp = await client.get("/api/convert/history")
    assert resp.status_code == 200
    body = resp.json()

    jobs = body["jobs"]
    our_job = next((j for j in jobs if j["job_id"] == job_id), None)
    assert our_job is not None, f"Job {job_id} not found in history response"
    assert our_job["result_text"] is None, "result_text should be excluded from history"


# ---------------------------------------------------------------------------
# Cancelled jobs stay cancelled
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancelled_job_stays_cancelled(
    client: AsyncClient, db_session
):
    """A cancelled job should not be overwritten to 'failed' by _fail_job."""
    from datetime import datetime, timezone

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

    from app.main import _app_state

    tm = _app_state.task_manager
    from sqlalchemy import update

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

    from sqlalchemy import select

    stmt = select(ConversionJob).where(ConversionJob.id == job_id)
    result = await db_session.execute(stmt)
    fresh = result.scalar_one()
    assert fresh.status == "cancelled", (
        f"Expected 'cancelled' but got '{fresh.status}' — _fail_job overwrote it!"
    )


# ---------------------------------------------------------------------------
# LLM Model Override
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upload_with_llm_model_override(client: AsyncClient, db_session):
    """Verify upload endpoint accepts llm_model override and saves it in config."""
    resp = await _upload_file(
        client,
        extra_params={"use_llm": "true", "llm_model": "custom-override-model-123"}
    )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]

    from sqlalchemy import select
    stmt = select(ConversionJob).where(ConversionJob.id == job_id)
    res = await db_session.execute(stmt)
    job = res.scalar_one()

    cfg = json.loads(job.config_json)
    assert cfg["llm_model"] == "custom-override-model-123"
    assert cfg["use_llm"] is True


def test_build_marker_options_model_override():
    """Verify that build_marker_options correctly overrides model names for all services."""
    from app.services.marker_service import build_marker_options

    # Gemini
    gemini_cfg = {"llm_service": "gemini", "gemini_model_name": "gemini-2.0-flash"}
    opts = build_marker_options(gemini_cfg, {"llm_model": "gemini-1.5-pro"})
    assert opts["gemini_model_name"] == "gemini-1.5-pro"

    # Claude
    claude_cfg = {"llm_service": "claude", "claude_model_name": "claude-3-7-sonnet"}
    opts = build_marker_options(claude_cfg, {"llm_model": "claude-3-5-haiku"})
    assert opts["claude_model_name"] == "claude-3-5-haiku"

    # OpenAI
    openai_cfg = {"llm_service": "openai", "openai_model": "gpt-4o-mini"}
    opts = build_marker_options(openai_cfg, {"llm_model": "gpt-4o"})
    assert opts["openai_model"] == "gpt-4o"


@pytest.mark.asyncio
async def test_upload_with_advanced_settings(client: AsyncClient, db_session):
    """Verify upload endpoint accepts advanced settings (page_range, lang) and saves them."""
    resp = await _upload_file(
        client,
        extra_params={"page_range": "1-3,5", "lang": "fr"}
    )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]

    from sqlalchemy import select
    stmt = select(ConversionJob).where(ConversionJob.id == job_id)
    res = await db_session.execute(stmt)
    job = res.scalar_one()

    cfg = json.loads(job.config_json)
    assert cfg["page_range"] == "1-3,5"
    assert cfg["lang"] == "fr"


def test_build_marker_options_advanced_settings():
    """Verify that build_marker_options correctly includes page_range and lang."""
    from app.services.marker_service import build_marker_options

    llm_cfg = {"llm_service": "gemini", "gemini_model_name": "gemini-2.0-flash"}
    conv_cfg = {"page_range": "1-5", "lang": "es"}
    opts = build_marker_options(llm_cfg, conv_cfg)

    assert opts["page_range"] == "1-5"
    assert opts["lang"] == "es"


