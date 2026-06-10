"""Simple bearer token authentication for local-first deployment."""
import os
import secrets
import logging
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

# Token is set via API_TOKEN env var. If not set, generate one and log it.
_api_token: str | None = None


def get_api_token() -> str:
    """Get or generate the API token."""
    global _api_token
    if _api_token is None:
        _api_token = os.environ.get("API_TOKEN", "")
        if not _api_token:
            _api_token = secrets.token_urlsafe(32)
            logger.warning(
                "API_TOKEN not set. Generated token: %s "
                "Set the API_TOKEN environment variable to use a specific token.",
                _api_token,
            )
    return _api_token


async def verify_token(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> None:
    """Verify bearer token. Supports Authorization header or ?token= query param (for SSE)."""
    # Allow health endpoint without auth
    if request.url.path == "/api/health":
        return None

    token = get_api_token()

    # Try header first, then query param (EventSource can't set headers)
    provided = None
    if credentials is not None:
        provided = credentials.credentials
    else:
        query_token = request.query_params.get("token")
        if query_token:
            provided = query_token

    if provided is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a valid Authorization: Bearer <token> header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not secrets.compare_digest(provided, token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return None
