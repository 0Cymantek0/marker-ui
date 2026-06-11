"""Tests for the GPU acceleration settings endpoints."""

import pytest
from httpx import AsyncClient
from unittest.mock import patch, PropertyMock
from app.services.gpu_service import gpu_service
from app.models.settings import Setting
from sqlalchemy import select

# Reuse the same fixtures from test_settings.py
from tests.test_settings import settings_engine, settings_session, settings_client  # noqa: F401


@pytest.mark.asyncio
async def test_get_gpu_status(settings_client: AsyncClient):
    """Verify that GET /gpu/status returns correct service state."""
    mock_state = {
        "status": "not_installed",
        "progress": 0,
        "logs": ["Line 1", "Line 2"],
        "error_message": None,
        "cuda_available": False,
    }
    with patch("app.services.gpu_service.GPUService.status_dict", new_callable=PropertyMock) as mock_status:
        mock_status.return_value = mock_state
        resp = await settings_client.get("/api/settings/gpu/status")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "not_installed"
        assert body["progress"] == 0
        assert body["logs"] == ["Line 1", "Line 2"]
        assert body["cuda_available"] is False


@pytest.mark.asyncio
async def test_install_gpu(settings_client: AsyncClient):
    """Verify that POST /gpu/install triggers background installation."""
    mock_state = {
        "status": "installing",
        "progress": 10,
        "logs": ["Starting..."],
        "error_message": None,
        "cuda_available": False,
    }
    with patch.object(gpu_service, "start_install") as mock_start, \
         patch("app.services.gpu_service.GPUService.status_dict", new_callable=PropertyMock) as mock_status:
        mock_status.return_value = mock_state
        resp = await settings_client.post("/api/settings/gpu/install")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "installing"
        assert body["progress"] == 10
        mock_start.assert_called_once()


@pytest.mark.asyncio
async def test_toggle_gpu(settings_client: AsyncClient, settings_session):
    """Verify that POST /gpu/toggle correctly updates the setting DB record."""
    # Toggle on
    resp = await settings_client.post(
        "/api/settings/gpu/toggle",
        json={"enabled": True}
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True

    await settings_session.commit()
    stmt = select(Setting).where(Setting.key == "gpu_acceleration_enabled")
    res = await settings_session.execute(stmt)
    row = res.scalar_one()
    assert row.value == "true"
    assert row.category == "gpu"

    # Toggle off
    resp = await settings_client.post(
        "/api/settings/gpu/toggle",
        json={"enabled": False}
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False

    await settings_session.commit()
    settings_session.expire_all()
    res = await settings_session.execute(stmt)
    row = res.scalar_one()
    assert row.value == "false"
