"""Tests for AccessTokenMiddleware."""

from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def mw_engine():
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
async def mw_session(mw_engine):
    factory = async_sessionmaker(mw_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def mw_client(mw_session):
    async def _override():
        yield mw_session

    from app.auth import verify_token

    async def _bypass_verify_token():
        return None

    app.dependency_overrides[get_db] = _override
    app.dependency_overrides[verify_token] = _bypass_verify_token

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c
    app.dependency_overrides.clear()


class TestAccessTokenMiddleware:
    @pytest.mark.asyncio
    async def test_no_token_configured_all_requests_pass(self, mw_client: AsyncClient):
        """When MARKER_ACCESS_TOKEN is not set, all requests pass."""
        with patch("app.core.config.ACCESS_TOKEN", None):
            resp = await mw_client.get("/api/settings/")
            assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_with_token_missing_header_returns_401(self, mw_client: AsyncClient):
        """When token is configured and no header sent → 401."""
        with patch("app.core.config.ACCESS_TOKEN", "secret123"):
            resp = await mw_client.get("/api/settings/")
            assert resp.status_code == 401
            assert "access token" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_with_token_wrong_header_returns_401(self, mw_client: AsyncClient):
        with patch("app.core.config.ACCESS_TOKEN", "secret123"):
            resp = await mw_client.get(
                "/api/settings/",
                headers={"x-access-token": "wrong"},
            )
            assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_with_token_correct_header_passes(self, mw_client: AsyncClient):
        with patch("app.core.config.ACCESS_TOKEN", "secret123"):
            resp = await mw_client.get(
                "/api/settings/",
                headers={"x-access-token": "secret123"},
            )
            assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_health_endpoint_always_accessible(self, mw_client: AsyncClient):
        """Health endpoint bypasses token check even with token set."""
        with patch("app.core.config.ACCESS_TOKEN", "secret123"):
            resp = await mw_client.get("/api/health")
            assert resp.status_code == 200
            assert resp.json()["status"] == "ok"

    @pytest.mark.asyncio
    async def test_non_api_paths_always_accessible(self, mw_client: AsyncClient):
        """Non-API paths bypass token check."""
        with patch("app.core.config.ACCESS_TOKEN", "secret123"):
            # Static file path — will 404 but NOT 401
            resp = await mw_client.get("/index.html")
            assert resp.status_code != 401

    @pytest.mark.asyncio
    async def test_convert_endpoint_requires_token(self, mw_client: AsyncClient):
        with patch("app.core.config.ACCESS_TOKEN", "my-token"):
            resp = await mw_client.get("/api/convert/history")
            assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_convert_endpoint_passes_with_token(self, mw_client: AsyncClient):
        with patch("app.core.config.ACCESS_TOKEN", "my-token"):
            resp = await mw_client.get(
                "/api/convert/history",
                headers={"x-access-token": "my-token"},
            )
            assert resp.status_code == 200
