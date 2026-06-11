"""Unit tests for the api_manager live secret replacement system."""

import pytest
import httpx

from app.core.api_manager import (
    update_secret_cache,
    get_secret,
    setup_api_manager_monkeypatch,
    _resolve_request,
)

# Preserve original send methods to restore after tests
_orig_client_send = httpx.Client.send
_orig_async_client_send = httpx.AsyncClient.send


@pytest.fixture(autouse=True)
def setup_and_teardown_monkeypatch():
    """Apply interceptor monkeypatch and clean up after each test."""
    setup_api_manager_monkeypatch()
    yield
    # Restore original methods
    httpx.Client.send = _orig_client_send
    httpx.AsyncClient.send = _orig_async_client_send


def test_secrets_cache_crud():
    """Verify in-memory secrets cache updates and retrieval."""
    update_secret_cache("test_api_key", "secret-xyz-789")
    assert get_secret("test_api_key") == "secret-xyz-789"
    assert get_secret("nonexistent_key") == ""


def test_resolve_request_headers():
    """Verify that headers containing 'secret:<key>' placeholders are rewritten."""
    update_secret_cache("gemini_api_key", "real-gemini-key")
    update_secret_cache("openai_api_key", "real-openai-key")

    req = httpx.Request(
        "GET",
        "https://example.com/api",
        headers={
            "x-goog-api-key": "secret:gemini_api_key",
            "Authorization": "Bearer secret:openai_api_key",
            "x-normal-header": "just-some-value",
        },
    )

    _resolve_request(req)

    assert req.headers["x-goog-api-key"] == "real-gemini-key"
    assert req.headers["Authorization"] == "Bearer real-openai-key"
    assert req.headers["x-normal-header"] == "just-some-value"


def test_resolve_request_url():
    """Verify that URL path/query containing 'secret:<key>' placeholders are rewritten."""
    update_secret_cache("vertex_project_id", "my-gcp-project-id")

    req = httpx.Request(
        "GET",
        "https://us-central1-aiplatform.googleapis.com/v1/projects/secret:vertex_project_id/locations",
    )

    _resolve_request(req)

    assert str(req.url) == "https://us-central1-aiplatform.googleapis.com/v1/projects/my-gcp-project-id/locations"


def test_resolve_request_body():
    """Verify that request body string containing placeholders is rewritten."""
    update_secret_cache("claude_api_key", "real-claude-key")

    payload = '{"api_key": "secret:claude_api_key", "max_tokens": 1}'
    req = httpx.Request(
        "POST",
        "https://api.anthropic.com/v1/messages",
        content=payload.encode("utf-8"),
    )

    _resolve_request(req)

    assert b"real-claude-key" in req.content
    assert b"secret:claude_api_key" not in req.content
    assert req.headers["content-length"] == str(len(req.content))


def test_sync_client_intercepts():
    """Verify sync Client.send intercepts and replaces placeholders."""
    update_secret_cache("openai_api_key", "secret-key-sync-value")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer secret-key-sync-value"
        return httpx.Response(200, json={"status": "ok"})

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        client.get("https://api.openai.com/v1/models", headers={"Authorization": "Bearer secret:openai_api_key"})


@pytest.mark.asyncio
async def test_async_client_intercepts():
    """Verify async AsyncClient.send intercepts and replaces placeholders."""
    update_secret_cache("gemini_api_key", "secret-key-async-value")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "secret-key-async-value"
        return httpx.Response(200, json={"status": "ok"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        await client.get("https://generativelanguage.googleapis.com/v1beta/models", headers={"x-goog-api-key": "secret:gemini_api_key"})
