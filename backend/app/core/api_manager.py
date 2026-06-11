"""Live API interceptor and in-memory secure secrets cache for Marker UI."""

import logging
import re
import threading
from typing import Any
import httpx

logger = logging.getLogger(__name__)

# Pattern to search for placeholder secret references in request headers, url, or body
SECRET_REF_PATTERN = re.compile(r"secret:([a-zA-Z0-9_-]+_api_key|[a-zA-Z0-9_-]+_project_id)")

# Thread-safe in-memory cache for decrypted API keys/secrets
_secrets_cache: dict[str, str] = {}
_cache_lock = threading.Lock()

# Original httpx.Client.send and httpx.AsyncClient.send methods
_orig_client_send = httpx.Client.send
_orig_async_client_send = httpx.AsyncClient.send


async def load_secrets_from_db() -> None:
    """Load and decrypt all secrets from DB into the in-memory cache on startup."""
    from app.crypto import decrypt_value, is_encrypted_field
    from app.database import async_session_factory
    from app.models.settings import Setting
    from sqlalchemy import select

    logger.info("Initializing in-memory secrets cache from DB...")
    async with async_session_factory() as session:
        try:
            stmt = select(Setting).where(Setting.category == "llm")
            result = await session.execute(stmt)
            rows = result.scalars().all()
            with _cache_lock:
                _secrets_cache.clear()
                for r in rows:
                    if is_encrypted_field(r.key):
                        decrypted = decrypt_value(r.value)
                        _secrets_cache[r.key] = decrypted
                        logger.debug("Loaded and decrypted secret: %s", r.key)
                    else:
                        _secrets_cache[r.key] = r.value
            logger.info("Secrets cache initialized successfully.")
        except Exception as e:
            logger.error("Failed to load secrets from DB: %s", e, exc_info=True)


def update_secret_cache(key: str, decrypted_value: str) -> None:
    """Update a specific secret in the in-memory cache."""
    with _cache_lock:
        _secrets_cache[key] = decrypted_value
        logger.debug("Updated secret cache for key: %s", key)


def get_secret(key: str) -> str:
    """Retrieve a decrypted secret from the in-memory cache."""
    with _cache_lock:
        return _secrets_cache.get(key, "")


def _resolve_string(val: str) -> str:
    """Replace any 'secret:<key>' matches with their cached decrypted value."""
    def replace_match(match: re.Match[str]) -> str:
        secret_key = match.group(1)
        secret_val = get_secret(secret_key)
        if secret_val:
            return secret_val
        return match.group(0)  # Keep original placeholder if not in cache

    return SECRET_REF_PATTERN.sub(replace_match, val)


def _resolve_request(request: httpx.Request) -> None:
    """Intercept request headers, url, and content, substituting secret references."""
    # 1. Resolve headers
    for name, value in list(request.headers.items()):
        if "secret:" in value:
            request.headers[name] = _resolve_string(value)

    # 2. Resolve URL
    url_str = str(request.url)
    if "secret:" in url_str:
        request.url = httpx.URL(_resolve_string(url_str))

    # 3. Resolve body content if present and already read/loaded
    if hasattr(request, "_content") and request._content and b"secret:" in request._content:
        try:
            content_str = request._content.decode("utf-8", errors="ignore")
            resolved_content = _resolve_string(content_str)
            request._content = resolved_content.encode("utf-8")
            request.headers["content-length"] = str(len(request._content))
            logger.debug("Substituted secret references in request body")
        except Exception as e:
            logger.error("Failed to resolve secrets in request body: %s", e)


def patched_client_send(self: httpx.Client, request: httpx.Request, *args: Any, **kwargs: Any) -> httpx.Response:
    """Patched synchronous send method."""
    _resolve_request(request)
    return _orig_client_send(self, request, *args, **kwargs)


async def patched_async_client_send(self: httpx.AsyncClient, request: httpx.Request, *args: Any, **kwargs: Any) -> httpx.Response:
    """Patched asynchronous send method."""
    _resolve_request(request)
    return await _orig_async_client_send(self, request, *args, **kwargs)


def setup_api_manager_monkeypatch() -> None:
    """Apply monkeypatches to httpx Client/AsyncClient send methods."""
    logger.info("Applying httpx client send monkeypatches for live secret substitution...")
    httpx.Client.send = patched_client_send  # type: ignore[assignment]
    httpx.AsyncClient.send = patched_async_client_send  # type: ignore[assignment]
