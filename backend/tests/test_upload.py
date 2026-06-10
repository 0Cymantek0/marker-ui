"""Tests for upload endpoint — extension allowlist, size limit, streaming."""

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app
from app.models.job import ConversionJob  # noqa: F401
from app.models.settings import Setting  # noqa: F401

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def upload_engine():
    eng = create_async_engine(
        TEST_DB_URL, echo=False, future=True, connect_args={"check_same_thread": False}
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def upload_session(upload_engine):
    factory = async_sessionmaker(upload_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def upload_client(upload_session):
    async def _override():
        yield upload_session

    from app.auth import verify_token

    async def _bypass_verify_token():
        return None

    app.dependency_overrides[get_db] = _override
    app.dependency_overrides[verify_token] = _bypass_verify_token

    mock_task_mgr = MagicMock()
    mock_task_mgr.submit_job = MagicMock()
    
    with patch("app.main._app_state") as mock_state:
        mock_state.marker_service = MagicMock()
        mock_state.task_manager = mock_task_mgr

        with patch("app.services.marker_service.build_marker_options", return_value={}):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://testserver") as c:
                yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Allowed extensions
# ---------------------------------------------------------------------------


class TestUploadExtensionAllowlist:
    @pytest.mark.parametrize("ext", [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"])
    @pytest.mark.asyncio
    async def test_allowed_extensions_accepted(self, upload_client: AsyncClient, ext: str):
        data = io.BytesIO(b"%PDF-1.4 fake content")
        files = {"file": (f"test{ext}", data, "application/octet-stream")}
        resp = await upload_client.post("/api/convert/upload", files=files)
        assert resp.status_code == 200
        body = resp.json()
        assert "job_id" in body
        assert body["status"] == "pending"
        assert body["filename"] == f"test{ext}"

    @pytest.mark.parametrize("ext", [".exe", ".sh", ".py", ".bat", ".cmd", ".js"])
    @pytest.mark.asyncio
    async def test_disallowed_extensions_rejected(self, upload_client: AsyncClient, ext: str):
        data = io.BytesIO(b"malicious payload")
        files = {"file": (f"evil{ext}", data, "application/octet-stream")}
        resp = await upload_client.post("/api/convert/upload", files=files)
        assert resp.status_code == 400
        assert "Unsupported file type" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Size limit
# ---------------------------------------------------------------------------


class TestUploadSizeLimit:
    @pytest.mark.asyncio
    async def test_oversized_file_rejected(self, upload_client: AsyncClient):
        with patch("app.routes.convert.MAX_UPLOAD_SIZE", 100):
            data = io.BytesIO(b"A" * 200)
            files = {"file": ("big.pdf", data, "application/pdf")}
            resp = await upload_client.post("/api/convert/upload", files=files)
            assert resp.status_code == 413
            assert "exceeds maximum size" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Streaming / successful upload
# ---------------------------------------------------------------------------


class TestUploadSuccess:
    @pytest.mark.asyncio
    async def test_successful_upload_returns_conversion_response(self, upload_client: AsyncClient):
        data = io.BytesIO(b"%PDF-1.4 test content")
        files = {"file": ("document.pdf", data, "application/pdf")}
        resp = await upload_client.post("/api/convert/upload", files=files)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "pending"
        assert body["output_format"] == "markdown"
        assert body["filename"] == "document.pdf"

    @pytest.mark.asyncio
    async def test_upload_with_output_format(self, upload_client: AsyncClient):
        data = io.BytesIO(b"image data")
        files = {"file": ("photo.png", data, "image/png")}
        resp = await upload_client.post(
            "/api/convert/upload",
            files=files,
            params={"output_format": "json"},
        )
        assert resp.status_code == 200
        assert resp.json()["output_format"] == "json"
