"""Tests for bearer token authentication middleware.

Auth tests use a special fixture without the auth override so they test
the REAL verify_token logic (which reads tokens from ?token= query param
and the Authorization header).
"""

from __future__ import annotations

import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@pytest_asyncio.fixture
async def no_auth_override_client():
    """Client without the auth override — tests the REAL verify_token logic."""
    from app.main import app, _app_state
    from app.database import get_db

    # Reset the module-level _api_token so it picks up our env var
    import app.auth as auth_module
    auth_module._api_token = None

    fake_svc = type("FS", (), {
        "initialize": lambda s: None,
        "convert_file": lambda s, f, o: {"text": "# fake", "extension": "md", "images": [], "metadata": {}},
    })()
    fake_tm = type("FT", (), {
        "submit_job": lambda s, *a: None,
        "get_status": lambda s, jid: {"job_id": jid, "status": "pending", "progress": 0},
        "cancel_job": staticmethod(lambda jid: __import__("asyncio").sleep(0)),
    })()

    original_ms = _app_state.marker_service
    original_tm = _app_state.task_manager
    _app_state.marker_service = fake_svc  # type: ignore[assignment]
    _app_state.task_manager = fake_tm  # type: ignore[assignment]

    # Only override DB, NOT auth — so real verify_token runs
    from tests.conftest import _override_get_db
    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    _app_state.marker_service = original_ms  # type: ignore[assignment]
    _app_state.task_manager = original_tm  # type: ignore[assignment]
    app.dependency_overrides.clear()
    auth_module._api_token = None


# ---------------------------------------------------------------------------
# Unauthenticated request → 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unauthenticated_request_returns_401(no_auth_override_client: AsyncClient):
    """Requests without any token should be rejected."""
    resp = await no_auth_override_client.get("/api/convert/history")
    assert resp.status_code == 401
    assert "Authentication required" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Valid token via query param → 200
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_token_returns_200(no_auth_override_client: AsyncClient):
    """Requests with the correct token via query param should succeed."""
    resp = await no_auth_override_client.get(
        "/api/convert/history?token=test-secret-token"
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Invalid token → 401
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_token_returns_401(no_auth_override_client: AsyncClient):
    """Requests with a wrong token should be rejected."""
    resp = await no_auth_override_client.get(
        "/api/convert/history?token=wrong-token-value"
    )
    assert resp.status_code == 401
    assert "Invalid authentication token" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Health endpoint bypasses auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_endpoint_works_without_auth(no_auth_override_client: AsyncClient):
    """The /api/health endpoint must be accessible without any token."""
    resp = await no_auth_override_client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# Query param token works for SSE endpoints (uses the auth-overridden client)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_query_param_token_works_for_sse(client: AsyncClient, auth_headers: dict[str, str]):
    """The ?token= query parameter should authenticate SSE requests."""
    import io

    files = {"file": ("test.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
    upload_resp = await client.post(
        "/api/convert/upload",
        files=files,
        params={"output_format": "markdown"},
        headers=auth_headers,
    )
    assert upload_resp.status_code == 200
    job_id = upload_resp.json()["job_id"]

    # Access SSE with query param only (no Authorization header)
    sse_resp = await client.get(
        f"/api/convert/events/{job_id}?token=test-secret-token",
    )
    assert sse_resp.status_code == 200


@pytest.mark.asyncio
async def test_query_param_invalid_token_returns_401(no_auth_override_client: AsyncClient):
    """An invalid query param token should still return 401."""
    resp = await no_auth_override_client.get(
        "/api/convert/events/nonexistent?token=bad-token",
    )
    assert resp.status_code == 401
