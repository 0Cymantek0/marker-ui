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
_provider_keys: dict[str, list[str]] = {}  # provider_id -> [decrypted_keys...]
_active_key_index: dict[str, int] = {}     # provider_id -> active index (default 0)
_cache_lock = threading.Lock()

# Original httpx.Client.send and httpx.AsyncClient.send methods
_orig_client_send = httpx.Client.send
_orig_async_client_send = httpx.AsyncClient.send


async def load_secrets_from_db() -> None:
    """Load and decrypt all secrets from DB into the in-memory cache on startup."""
    from app.crypto import decrypt_value
    from app.database import async_session_factory
    from app.models.settings import Setting
    from sqlalchemy import select
    from app.routes.settings import ALLOWED_LLM_HOSTS, init_llm_providers_if_missing
    from urllib.parse import urlparse
    import json

    logger.info("Initializing in-memory secrets cache from DB...")
    async with async_session_factory() as session:
        try:
            await init_llm_providers_if_missing(session)

            stmt = select(Setting).where(Setting.key == "llm_providers")
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()

            providers = []
            if row:
                try:
                    providers = json.loads(row.value)
                except Exception:
                    pass

            with _cache_lock:
                _secrets_cache.clear()
                _provider_keys.clear()

                for p in providers:
                    pid = p.get("id")
                    if not pid:
                        continue

                    decrypted_keys = []

                    # Primary key
                    api_key = p.get("api_key")
                    if api_key:
                        api_key = decrypt_value(api_key)
                        decrypted_keys.append(api_key)
                        _secrets_cache[f"provider_{pid}_key_0_api_key"] = api_key

                    # Fallback keys
                    fallbacks = p.get("fallback_api_keys", [])
                    for i, fb in enumerate(fallbacks):
                        if fb:
                            fb = decrypt_value(fb)
                            decrypted_keys.append(fb)
                            _secrets_cache[f"provider_{pid}_key_{i+1}_api_key"] = fb

                    _provider_keys[pid] = decrypted_keys
                    _active_key_index[pid] = 0

                    # Add base URL hostnames dynamically to allowed list for SSRF protection
                    base_url = p.get("base_url")
                    if base_url:
                        parsed_host = urlparse(base_url).hostname
                        if parsed_host:
                            ALLOWED_LLM_HOSTS.add(parsed_host.lower())
                            logger.debug("Added %s to ALLOWED_LLM_HOSTS", parsed_host.lower())

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
        # Check provider pattern: provider_{provider_id}_key_{index}_api_key
        m = re.match(r"provider_([a-zA-Z0-9_-]+)_key_(\d+)_api_key", secret_key)
        if m:
            provider_id = m.group(1)
            with _cache_lock:
                keys = _provider_keys.get(provider_id, [])
                active_idx = _active_key_index.get(provider_id, 0)
                if active_idx < len(keys):
                    return keys[active_idx]
                elif keys:
                    return keys[0]

        secret_val = get_secret(secret_key)
        if secret_val:
            return secret_val
        return match.group(0)

    return SECRET_REF_PATTERN.sub(replace_match, val)


def _resolve_request(request: httpx.Request) -> None:
    """Intercept request headers, url, and content, substituting secret references."""
    for name, value in list(request.headers.items()):
        if "secret:" in value:
            request.headers[name] = _resolve_string(value)

    url_str = str(request.url)
    if "secret:" in url_str:
        request.url = httpx.URL(_resolve_string(url_str))

    if hasattr(request, "_content") and request._content and b"secret:" in request._content:
        try:
            content_str = request._content.decode("utf-8", errors="ignore")
            resolved_content = _resolve_string(content_str)
            request._content = resolved_content.encode("utf-8")
            request.headers["content-length"] = str(len(request._content))
            logger.debug("Substituted secret references in request body")
        except Exception as e:
            logger.error("Failed to resolve secrets in request body: %s", e)


def _find_key_in_request(request: httpx.Request) -> tuple[str, int, str] | None:
    """Scan the request object to identify which provider key was used."""
    with _cache_lock:
        for provider_id, keys in _provider_keys.items():
            for idx, key in enumerate(keys):
                if not key:
                    continue
                # Check headers
                for val in request.headers.values():
                    if key in val:
                        return provider_id, idx, key
                # Check URL
                if key in str(request.url):
                    return provider_id, idx, key
                # Check body
                if hasattr(request, "_content") and request._content and key.encode("utf-8") in request._content:
                    return provider_id, idx, key
    return None


def _replace_key_in_request(request: httpx.Request, old_key: str, new_key: str) -> None:
    """Replace an API key value with a fallback key inside the request."""
    for name, value in list(request.headers.items()):
        if old_key in value:
            request.headers[name] = value.replace(old_key, new_key)

    url_str = str(request.url)
    if old_key in url_str:
        request.url = httpx.URL(url_str.replace(old_key, new_key))

    if hasattr(request, "_content") and request._content and old_key.encode("utf-8") in request._content:
        try:
            content_str = request._content.decode("utf-8", errors="ignore")
            resolved_content = content_str.replace(old_key, new_key)
            request._content = resolved_content.encode("utf-8")
            request.headers["content-length"] = str(len(request._content))
        except Exception as e:
            logger.error("Failed to replace key in request body: %s", e)


def _handle_rotation_sync(
    client: httpx.Client,
    request: httpx.Request,
    error_or_res: Any,
    *args: Any,
    **kwargs: Any,
) -> httpx.Response | None:
    """Determine if fallback API key rotation is possible and retry the request synchronously."""
    matched = _find_key_in_request(request)
    if not matched:
        return None if isinstance(error_or_res, Exception) else error_or_res

    provider_id, key_index, key_value = matched
    with _cache_lock:
        keys_list = _provider_keys.get(provider_id, [])
        curr_active = _active_key_index.get(provider_id, 0)
        if key_index == curr_active:
            next_index = key_index + 1
            if next_index < len(keys_list):
                _active_key_index[provider_id] = next_index
                logger.warning("Rotating API key for provider %s to index %d due to error/timeout", provider_id, next_index)

        new_active = _active_key_index.get(provider_id, 0)
        if new_active < len(keys_list):
            new_key = keys_list[new_active]
            _replace_key_in_request(request, key_value, new_key)
            try:
                res = _orig_client_send(client, request, *args, **kwargs)
                if res.status_code in (401, 403, 429, 503):
                    return _handle_rotation_sync(client, request, res, *args, **kwargs)
                return res
            except (httpx.ConnectError, httpx.TimeoutException) as e:
                return _handle_rotation_sync(client, request, e, *args, **kwargs)

    return None if isinstance(error_or_res, Exception) else error_or_res


async def _handle_rotation_async(
    client: httpx.AsyncClient,
    request: httpx.Request,
    error_or_res: Any,
    *args: Any,
    **kwargs: Any,
) -> httpx.Response | None:
    """Determine if fallback API key rotation is possible and retry the request asynchronously."""
    matched = _find_key_in_request(request)
    if not matched:
        return None if isinstance(error_or_res, Exception) else error_or_res

    provider_id, key_index, key_value = matched
    with _cache_lock:
        keys_list = _provider_keys.get(provider_id, [])
        curr_active = _active_key_index.get(provider_id, 0)
        if key_index == curr_active:
            next_index = key_index + 1
            if next_index < len(keys_list):
                _active_key_index[provider_id] = next_index
                logger.warning("Rotating API key for provider %s to index %d due to error/timeout", provider_id, next_index)

        new_active = _active_key_index.get(provider_id, 0)
        if new_active < len(keys_list):
            new_key = keys_list[new_active]
            _replace_key_in_request(request, key_value, new_key)
            try:
                res = await _orig_async_client_send(client, request, *args, **kwargs)
                if res.status_code in (401, 403, 429, 503):
                    return await _handle_rotation_async(client, request, res, *args, **kwargs)
                return res
            except (httpx.ConnectError, httpx.TimeoutException) as e:
                return await _handle_rotation_async(client, request, e, *args, **kwargs)

    return None if isinstance(error_or_res, Exception) else error_or_res


def patched_client_send(self: httpx.Client, request: httpx.Request, *args: Any, **kwargs: Any) -> httpx.Response:
    """Patched synchronous send method with auto key rotation retry."""
    _resolve_request(request)
    try:
        res = _orig_client_send(self, request, *args, **kwargs)
        if res.status_code in (401, 403, 429, 503):
            rotated = _handle_rotation_sync(self, request, res, *args, **kwargs)
            if rotated:
                return rotated
        return res
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        rotated = _handle_rotation_sync(self, request, e, *args, **kwargs)
        if rotated:
            return rotated
        raise


async def patched_async_client_send(self: httpx.AsyncClient, request: httpx.Request, *args: Any, **kwargs: Any) -> httpx.Response:
    """Patched asynchronous send method with auto key rotation retry."""
    _resolve_request(request)
    try:
        res = await _orig_async_client_send(self, request, *args, **kwargs)
        if res.status_code in (401, 403, 429, 503):
            rotated = await _handle_rotation_async(self, request, res, *args, **kwargs)
            if rotated:
                return rotated
        return res
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        rotated = await _handle_rotation_async(self, request, e, *args, **kwargs)
        if rotated:
            return rotated
        raise


def setup_api_manager_monkeypatch() -> None:
    """Apply monkeypatches to httpx Client/AsyncClient send methods."""
    logger.info("Applying httpx client send monkeypatches for live secret substitution...")
    httpx.Client.send = patched_client_send  # type: ignore[assignment]
    httpx.AsyncClient.send = patched_async_client_send  # type: ignore[assignment]

