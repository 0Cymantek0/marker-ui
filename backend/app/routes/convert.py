"""Conversion endpoints — upload, status, download, history."""

from __future__ import annotations

import json
import logging
import tempfile
import uuid
import zipfile
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

import aiofiles

from app.core.config import UPLOAD_DIR, OUTPUT_DIR
from app.database import get_db
from app.models.job import ConversionJob
from app.models.schemas import ConversionResponse, JobStatusResponse, HistoryResponse

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".pptx", ".xlsx", ".epub", ".html",
    ".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp"
}
MAX_UPLOAD_SIZE = 100 * 1024 * 1024  # 100 MB

router = APIRouter(prefix="/api/convert", tags=["convert"])

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def _load_llm_config(db: AsyncSession) -> dict[str, Any]:
    """Load stored LLM config from settings table.

    Decrypts sensitive keys (API keys) so marker-pdf receives plaintext credentials.
    """
    from app.models.settings import Setting
    from app.utils.secrets import decrypt_value, is_sensitive_key
    import json

    stmt = select(Setting).where(Setting.category == "llm")
    result = await db.execute(stmt)
    rows = result.scalars().all()

    data: dict[str, Any] = {}
    for r in rows:
        try:
            parsed = json.loads(r.value)
        except (json.JSONDecodeError, TypeError):
            parsed = r.value
        # Decrypt sensitive keys before passing to marker
        if is_sensitive_key(r.key) and isinstance(parsed, str):
            parsed = decrypt_value(parsed)
        data[r.key] = parsed
    return data


# ------------------------------------------------------------------
# Upload & start conversion
# ------------------------------------------------------------------


@router.post("/upload", response_model=ConversionResponse)
async def upload_file(
    file: UploadFile = File(...),
    output_format: str = Query("markdown", description="Output format: markdown, json, html, chunks"),
    converter: Optional[str] = Query(None, description="Converter class: PdfConverter, TableConverter, OCRConverter"),
    use_llm: bool = Query(False, description="Enable LLM-assisted conversion"),
    force_ocr: bool = Query(False, description="Force OCR on all pages"),
    paginate_output: bool = Query(False, description="Add page separators in output"),
    disable_image_extraction: bool = Query(False, description="Skip extracting images"),
    page_range: Optional[str] = Query(None, description="Page range e.g. '1-5,8,10-12'"),
    lang: Optional[str] = Query(None, description="Document language hint"),
    disable_multiprocessing: bool = Query(False, description="Run single-threaded"),
    strip_existing_ocr: bool = Query(False, description="Strip existing OCR text"),
    redo_inline_math: bool = Query(False, description="Re-render inline math"),
    debug: bool = Query(False, description="Enable debug output"),
    db: AsyncSession = Depends(get_db),
) -> ConversionResponse:
    """Accept a document upload, create a job, and start conversion."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = Path(file.filename).suffix.lower()
    # Validate file extension
    if suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}' (not supported). Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    input_format = suffix.lstrip(".")

    job_id = str(uuid.uuid4())
    stored_name = f"{job_id}{suffix}"
    stored_path = UPLOAD_DIR / stored_name

    # Stream upload to disk with size limit
    limit_exceeded = False
    try:
        total_size = 0
        async with aiofiles.open(stored_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1 MB chunks
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE:
                    limit_exceeded = True
                    break
                await f.write(chunk)
    except Exception as exc:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}") from exc

    if limit_exceeded:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size (too large) of {MAX_UPLOAD_SIZE} bytes.",
        )

    # Build conversion config from query params
    config: dict[str, Any] = {"output_format": output_format}
    if converter:
        config["converter_cls"] = converter
    if use_llm:
        config["use_llm"] = True
    if force_ocr:
        config["force_ocr"] = True
    if paginate_output:
        config["paginate_output"] = True
    if disable_image_extraction:
        config["disable_image_extraction"] = True
    if page_range:
        config["page_range"] = page_range
    if lang:
        config["lang"] = lang
    if disable_multiprocessing:
        config["disable_multiprocessing"] = True
    if strip_existing_ocr:
        config["strip_existing_ocr"] = True
    if redo_inline_math:
        config["redo_inline_math"] = True
    if debug:
        config["debug"] = True

    # DB record
    job = ConversionJob(
        id=job_id,
        filename=stored_name,
        original_name=file.filename,
        status="pending",
        input_format=input_format,
        output_format=output_format,
        config_json=json.dumps(config),
    )
    db.add(job)
    await db.flush()

    from app.main import _app_state

    marker_service = _app_state.marker_service
    task_manager = _app_state.task_manager

    llm_config = await _load_llm_config(db)

    from app.services.marker_service import build_marker_options
    options = build_marker_options(llm_config, config)

    task_manager.submit_job(job_id, str(stored_path), options, marker_service)

    return ConversionResponse(
        job_id=job_id,
        status="pending",
        filename=file.filename,
        output_format=output_format,
    )


# ------------------------------------------------------------------
# Status
# ------------------------------------------------------------------


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
) -> JobStatusResponse:
    """Return current job status."""
    stmt = select(ConversionJob).where(ConversionJob.id == job_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Merge in-memory progress from task manager if still processing
    from app.main import _app_state

    live = _app_state.task_manager.get_status(job_id)
    progress = live.get("progress", job.progress)

    # Parse config to extract converter
    converter = "PdfConverter"
    if job.config_json:
        try:
            import json
            cfg = json.loads(job.config_json)
            converter = cfg.get("converter_cls", "PdfConverter")
        except Exception:
            pass

    return JobStatusResponse(
        job_id=job.id,
        status=live.get("status", job.status),
        progress=progress,
        error_message=job.error_message,
        result_text=job.result_text,
        created_at=job.created_at,
        completed_at=job.completed_at,
        filename=job.original_name,
        output_format=job.output_format,
        converter=converter,
    )


# ------------------------------------------------------------------
# SSE events
# ------------------------------------------------------------------


@router.get("/events/{job_id}")
async def job_events(request: Request, job_id: str):
    from sse_starlette.sse import EventSourceResponse

    from app.main import _app_state

    return EventSourceResponse(_app_state.task_manager.job_events(request, job_id))


# ------------------------------------------------------------------
# Download
# ------------------------------------------------------------------


@router.get("/download/{job_id}")
async def download_result(
    job_id: str,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Download the converted output file."""
    stmt = select(ConversionJob).where(ConversionJob.id == job_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="Job not yet completed")
    if not job.result_path:
        text_path = UPLOAD_DIR / f"{job_id}_output.md"
        text_path.write_text(job.result_text or "", encoding="utf-8")
        return FileResponse(
            path=text_path,
            filename=f"{Path(job.original_name).stem}.md",
            media_type="text/markdown",
        )

    result_path = Path(job.result_path)
    if result_path.is_dir():
        tmp_zip = Path(tempfile.mktemp(suffix=".zip"))
        try:
            with zipfile.ZipFile(tmp_zip, "w", zipfile.ZIP_DEFLATED) as zf:
                for file_in_dir in sorted(result_path.rglob("*")):
                    if file_in_dir.is_file():
                        zf.write(file_in_dir, file_in_dir.relative_to(result_path))
            return FileResponse(
                path=str(tmp_zip),
                filename=f"{Path(job.original_name).stem}.zip",
                media_type="application/zip",
            )
        except Exception:
            tmp_zip.unlink(missing_ok=True)
            raise

    return FileResponse(
        path=job.result_path,
        filename=Path(job.result_path).name,
    )


# ------------------------------------------------------------------
# History
# ------------------------------------------------------------------


@router.get("/history", response_model=HistoryResponse)
async def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> HistoryResponse:
    """List all conversion jobs (paginated)."""
    offset = (page - 1) * page_size

    # Query total count
    count_stmt = select(func.count(ConversionJob.id))
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    stmt = (
        select(ConversionJob)
        .order_by(ConversionJob.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    jobs = result.scalars().all()

    # Parse configs to extract converter
    res_jobs = []
    for j in jobs:
        converter = "PdfConverter"
        if j.config_json:
            try:
                import json
                cfg = json.loads(j.config_json)
                converter = cfg.get("converter_cls", "PdfConverter")
            except Exception:
                pass
        res_jobs.append(
            JobStatusResponse(
                job_id=j.id,
                status=j.status,
                progress=j.progress,
                error_message=j.error_message,
                result_text=None,  # Exclude from history — use /status endpoint for full text
                created_at=j.created_at,
                completed_at=j.completed_at,
                filename=j.original_name,
                output_format=j.output_format,
                converter=converter,
            )
        )

    return HistoryResponse(
        jobs=res_jobs,
        total=total
    )


# ------------------------------------------------------------------
# Delete / Cancel
# ------------------------------------------------------------------


@router.delete("/{job_id}")
async def delete_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Cancel (if running) and delete a conversion job."""
    stmt = select(ConversionJob).where(ConversionJob.id == job_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Cancel if still processing
    from app.main import _app_state

    await _app_state.task_manager.cancel_job(job_id)

    # Clean up uploaded file
    upload_path = UPLOAD_DIR / job.filename
    if upload_path.exists():
        upload_path.unlink()

    # Clean up result file
    if job.result_path:
        result_path = Path(job.result_path)
        if result_path.exists():
            result_path.unlink()

    await db.delete(job)

    return {"status": "deleted", "job_id": job_id}
