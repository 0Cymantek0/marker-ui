"""Settings CRUD endpoints — key/value store grouped by category."""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt_value, encrypt_value, is_encrypted_field
from app.database import get_db
from app.models.settings import Setting
from app.models.schemas import (
    LLMConfig,
    SettingsBatchUpdateRequest,
    SettingsResponse,
    SettingsUpdateRequest,
    GPUStatusResponse,
    GPUToggleRequest,
)
from app.utils.secrets import (
    decrypt_value,
    encrypt_value,
    is_masked,
    is_sensitive_key,
    mask_value,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ------------------------------------------------------------------
# SSRF protection — allowed LLM service hosts
# ------------------------------------------------------------------


ALLOWED_LLM_HOSTS = {
    "api.openai.com",
    "api.anthropic.com",
    "generativelanguage.googleapis.com",
    "us-central1-aiplatform.googleapis.com",
    "localhost",
    "127.0.0.1",
    "::1",
}


def validate_llm_url(url: str) -> str:
    """Validate that a URL points to an allowed LLM service."""
    if not url:
        return url
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    allowed = False
    for pattern in ALLOWED_LLM_HOSTS:
        if pattern.startswith("*."):
            if hostname.endswith(pattern[1:]) or hostname == pattern[2:]:
                allowed = True
                break
        elif hostname == pattern:
            allowed = True
            break
    if not allowed:
        raise ValueError(
            f"URL hostname '{hostname}' is not in the allowed list. "
            f"Allowed: {', '.join(sorted(ALLOWED_LLM_HOSTS))}"
        )
    return url


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _decrypt_setting(row: Setting) -> str:
    """Decrypt a setting value if it's sensitive."""
    if is_sensitive_key(row.key):
        return decrypt_value(row.value)
    return row.value


def _masked_response(row: Setting) -> SettingsResponse:
    """Build a response, masking sensitive values."""
    value = _decrypt_setting(row)
    if is_sensitive_key(row.key):
        value = mask_value(value)
    return SettingsResponse(key=row.key, value=value, category=row.category)


# ------------------------------------------------------------------
# List all
# ------------------------------------------------------------------


@router.get("/", response_model=dict[str, list[SettingsResponse]])
async def list_settings(
    db: AsyncSession = Depends(get_db),
) -> dict[str, list[SettingsResponse]]:
    """Return all settings grouped by category."""
    stmt = select(Setting).order_by(Setting.category, Setting.key)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    grouped: dict[str, list[SettingsResponse]] = defaultdict(list)
    for r in rows:
        grouped[r.category].append(_masked_response(r))
    return dict(grouped)


# ------------------------------------------------------------------
# Get one
# ------------------------------------------------------------------


@router.get("/key/{key}", response_model=SettingsResponse)
async def get_setting(
    key: str,
    db: AsyncSession = Depends(get_db),
) -> SettingsResponse:
    """Return a single setting by key."""
    stmt = select(Setting).where(Setting.key == key)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return _masked_response(row)


# ------------------------------------------------------------------
# Upsert single
# ------------------------------------------------------------------


@router.put("/", response_model=SettingsResponse)
async def upsert_setting(
    body: SettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> SettingsResponse:
    """Insert or update a single setting."""
    stmt = select(Setting).where(Setting.key == body.key)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()

    save_value = body.value
    # If the value is masked (user didn't change it), keep existing encrypted value
    if is_encrypted_field(body.key) and is_masked(body.value) and row:
        save_value = row.value  # preserve existing encrypted value
    elif is_encrypted_field(body.key) and body.value:
        from app.core.api_manager import update_secret_cache
        update_secret_cache(body.key, body.value)
        save_value = encrypt_value(body.value)

    if row:
        row.value = save_value
        row.category = body.category
    else:
        row = Setting(key=body.key, value=save_value, category=body.category)
        db.add(row)

    await db.flush()
    return _masked_response(row)


# ------------------------------------------------------------------
# Batch upsert
# ------------------------------------------------------------------


@router.put("/batch", response_model=list[SettingsResponse])
async def batch_upsert(
    body: SettingsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> list[SettingsResponse]:
    """Upsert multiple settings at once."""
    results: list[SettingsResponse] = []
    for item in body.settings:
        stmt = select(Setting).where(Setting.key == item.key)
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()

        save_value = item.value
        if is_encrypted_field(item.key) and is_masked(item.value) and row:
            save_value = row.value
        elif is_encrypted_field(item.key) and item.value:
            from app.core.api_manager import update_secret_cache
            update_secret_cache(item.key, item.value)
            save_value = encrypt_value(item.value)

        if row:
            row.value = save_value
            row.category = item.category
        else:
            row = Setting(key=item.key, value=save_value, category=item.category)
            db.add(row)

        results.append(_masked_response(row))
    await db.flush()
    return results


# ------------------------------------------------------------------
# Delete
# ------------------------------------------------------------------


@router.delete("/key/{key}")
async def delete_setting(
    key: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Delete a single setting."""
    stmt = delete(Setting).where(Setting.key == key)
    await db.execute(stmt)
    return {"status": "deleted", "key": key}


# ------------------------------------------------------------------
# LLM config helpers
# ------------------------------------------------------------------

# Sensitive LLM config keys that need decryption/masking
_LLM_SENSITIVE_KEYS = {
    "gemini_api_key",
    "openai_api_key",
    "claude_api_key",
    "azure_api_key",
    "vertex_project_id",
}


@router.get("/llm/config", response_model=LLMConfig)
async def get_llm_config(
    db: AsyncSession = Depends(get_db),
) -> LLMConfig:
    """Return the full LLM configuration assembled from individual settings."""
    stmt = select(Setting).where(Setting.category == "llm")
    result = await db.execute(stmt)
    rows = result.scalars().all()

    data: dict[str, Any] = {}
    for r in rows:
        raw = r.value
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            parsed = raw
        # Decrypt sensitive keys
        if r.key in _LLM_SENSITIVE_KEYS and isinstance(parsed, str):
            parsed = decrypt_value(parsed)
        data[r.key] = parsed

    # Mask sensitive values in response
    for k in _LLM_SENSITIVE_KEYS:
        if k in data and data[k]:
            data[k] = mask_value(data[k])

    return LLMConfig(**{k: v for k, v in data.items() if k in LLMConfig.model_fields})


@router.put("/llm/config", response_model=LLMConfig)
async def save_llm_config(
    body: LLMConfig,
    db: AsyncSession = Depends(get_db),
) -> LLMConfig:
    """Persist the full LLM configuration as individual settings."""
    data = body.model_dump(exclude_none=True)

    for key, value in data.items():
        from enum import Enum
        serialized: str
        if isinstance(value, Enum):
            serialized = value.value
        elif isinstance(value, (dict, list)):
            serialized = json.dumps(value)
        else:
            serialized = str(value)

        # For sensitive keys: if masked, keep existing encrypted value
        if key in _LLM_SENSITIVE_KEYS and is_masked(serialized):
            stmt = select(Setting).where(Setting.key == key)
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                # Keep the existing encrypted value, skip update
                continue
            # No existing row but value is masked — nothing to save
            continue
        elif key in _LLM_SENSITIVE_KEYS and serialized:
            from app.core.api_manager import update_secret_cache
            update_secret_cache(key, serialized)
            serialized = encrypt_value(serialized)

        stmt = select(Setting).where(Setting.key == key)
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()

        if row:
            row.value = serialized
            row.category = "llm"
        else:
            db.add(Setting(key=key, value=serialized, category="llm"))

    await db.flush()

    # Return masked version
    response_data = dict(data)
    for k in _LLM_SENSITIVE_KEYS:
        if k in response_data and response_data[k]:
            response_data[k] = mask_value(str(response_data[k]))
    return LLMConfig(**{k: v for k, v in response_data.items() if k in LLMConfig.model_fields})


# ------------------------------------------------------------------
# Test connection
# ------------------------------------------------------------------


@router.post("/llm/test")
async def test_llm_connection(
    body: LLMConfig,
) -> dict[str, Any]:
    """Test the LLM connection to the chosen service using provided credentials."""
    import httpx

    service = body.llm_service
    if service == "no_llm":
        return {"success": True, "message": "No LLM service configured — connection not tested."}

    timeout = httpx.Timeout(15.0, connect=5.0)

    try:
        if service == "gemini":
            api_key = body.gemini_api_key
            if not api_key:
                raise HTTPException(status_code=400, detail="Gemini API Key is required")

            if is_masked(api_key):
                api_key = "secret:gemini_api_key"
            else:
                from app.core.api_manager import update_secret_cache
                update_secret_cache("gemini_api_key", api_key)
                api_key = "secret:gemini_api_key"

            # Use header-based auth instead of query param to avoid key in logs/URL
            url = "https://generativelanguage.googleapis.com/v1beta/models"
            headers = {"x-goog-api-key": api_key}
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.get(url, headers=headers)

            if res.status_code != 200:
                detail = res.json().get("error", {}).get("message", res.text)
                raise HTTPException(status_code=400, detail=f"Gemini API returned error: {detail}")

            return {"success": True, "message": "Successfully connected to Gemini API!"}

        elif service == "openai":
            api_key = body.openai_api_key
            if not api_key:
                raise HTTPException(status_code=400, detail="OpenAI API Key is required")

            if is_masked(api_key):
                api_key = "secret:openai_api_key"
            else:
                from app.core.api_manager import update_secret_cache
                update_secret_cache("openai_api_key", api_key)
                api_key = "secret:openai_api_key"

            base_url = body.openai_base_url or "https://api.openai.com/v1"
            validate_llm_url(base_url)
            base_url = base_url.rstrip("/")
            url = f"{base_url}/models"
            headers = {"Authorization": f"Bearer {api_key}"}

            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.get(url, headers=headers)

            if res.status_code != 200:
                detail = res.json().get("error", {}).get("message", res.text)
                raise HTTPException(status_code=400, detail=f"OpenAI API returned error: {detail}")

            return {"success": True, "message": "Successfully connected to OpenAI API!"}

        elif service == "claude":
            api_key = body.claude_api_key
            if not api_key:
                raise HTTPException(status_code=400, detail="Claude API Key is required")

            if is_masked(api_key):
                api_key = "secret:claude_api_key"
            else:
                from app.core.api_manager import update_secret_cache
                update_secret_cache("claude_api_key", api_key)
                api_key = "secret:claude_api_key"

            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            data = {
                "model": body.claude_model_name or "claude-3-7-sonnet-20250219",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "ping"}],
            }

            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.post(url, headers=headers, json=data)

            if res.status_code in (401, 403):
                detail = res.json().get("error", {}).get("message", "Invalid API key")
                raise HTTPException(status_code=400, detail=f"Anthropic API returned auth error: {detail}")
            elif res.status_code not in (200, 400):
                detail = res.json().get("error", {}).get("message", res.text)
                raise HTTPException(status_code=400, detail=f"Anthropic API returned error: {detail}")

            return {"success": True, "message": "Successfully connected to Claude API!"}

        elif service == "ollama":
            base_url = body.ollama_base_url or "http://localhost:11434"
            validate_llm_url(base_url)
            base_url = base_url.rstrip("/")
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.get(f"{base_url}/api/tags")

            if res.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Ollama returned status {res.status_code}")

            return {"success": True, "message": f"Successfully connected to local Ollama server at {base_url}!"}

        elif service == "azure":
            api_key = body.azure_api_key
            endpoint = body.azure_endpoint
            if not api_key or not endpoint:
                raise HTTPException(status_code=400, detail="Azure API Key and Endpoint are required")

            if is_masked(api_key):
                api_key = "secret:azure_api_key"
            else:
                from app.core.api_manager import update_secret_cache
                update_secret_cache("azure_api_key", api_key)
                api_key = "secret:azure_api_key"

            validate_llm_url(endpoint)
            endpoint = endpoint.rstrip("/")
            url = f"{endpoint}/openai/models?api-version=2023-05-15"
            headers = {"api-key": api_key}

            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.get(url, headers=headers)

            if res.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Azure OpenAI returned error: {res.text}")

            return {"success": True, "message": "Successfully connected to Azure OpenAI!"}

        elif service == "vertex":
            project_id = body.vertex_project_id
            if not project_id:
                raise HTTPException(status_code=400, detail="Vertex Project ID is required")

            if is_masked(project_id):
                project_id = "secret:vertex_project_id"
            else:
                from app.core.api_manager import update_secret_cache
                update_secret_cache("vertex_project_id", project_id)
                project_id = "secret:vertex_project_id"

            url = f"https://us-central1-aiplatform.googleapis.com/v1/projects/{project_id}/locations/us-central1/publishers/google/models"
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.get(url)
            if res.status_code == 404:
                raise HTTPException(status_code=400, detail="Vertex project not found or invalid URL path")
            return {"success": True, "message": "Vertex AI settings structured correctly (Authentication handled via environment credentials)."}

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported service '{service}'")

    except ValueError as e:
        # URL validation error (SSRF)
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail=f"Failed to connect to the {service} host. Verify internet connection and host URL.")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Connection request timed out. Please check network settings.")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.error("Error testing LLM connection", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Connection test encountered an error: {str(e)}")


# ------------------------------------------------------------------
# Defaults
# ------------------------------------------------------------------


@router.get("/defaults", response_model=dict[str, Any])
async def get_defaults() -> dict[str, Any]:
    """Return marker-pdf's default configuration values."""
    from app.services.marker_service import MarkerService

    return MarkerService.get_defaults()


# ------------------------------------------------------------------
# GPU Acceleration
# ------------------------------------------------------------------

@router.get("/gpu/status", response_model=GPUStatusResponse)
async def get_gpu_status() -> GPUStatusResponse:
    """Get current GPU acceleration status, logs, and progress."""
    from app.services.gpu_service import gpu_service

    return GPUStatusResponse(**gpu_service.status_dict)


@router.post("/gpu/install", response_model=GPUStatusResponse)
async def install_gpu() -> GPUStatusResponse:
    """Trigger background installation of CUDA-enabled PyTorch."""
    from app.services.gpu_service import gpu_service

    gpu_service.start_install()
    return GPUStatusResponse(**gpu_service.status_dict)


@router.post("/gpu/toggle")
async def toggle_gpu(
    body: GPUToggleRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Save the GPU acceleration enabled preference in settings database."""
    stmt = select(Setting).where(Setting.key == "gpu_acceleration_enabled")
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()

    val = "true" if body.enabled else "false"
    if row:
        row.value = val
        row.category = "gpu"
    else:
        db.add(Setting(key="gpu_acceleration_enabled", value=val, category="gpu"))
    await db.commit()
    return {"status": "success", "enabled": body.enabled}


