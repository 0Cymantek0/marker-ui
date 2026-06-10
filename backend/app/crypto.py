"""Fernet symmetric encryption for API keys at rest."""
import os
import base64
import hashlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_fernet_key: bytes | None = None


def _get_encryption_key() -> bytes:
    """Get or derive the Fernet encryption key."""
    global _fernet_key
    if _fernet_key is not None:
        return _fernet_key

    # Try env var first
    raw_key = os.environ.get("ENCRYPTION_KEY", "")

    # Try file-based key
    key_path = Path("data/.encryption_key")

    if not raw_key and key_path.exists():
        raw_key = key_path.read_text().strip()

    if not raw_key:
        # Auto-generate a key
        raw_key = base64.urlsafe_b64encode(os.urandom(32)).decode()
        key_path.parent.mkdir(parents=True, exist_ok=True)
        key_path.write_text(raw_key)
        logger.warning(
            "ENCRYPTION_KEY not set. Auto-generated key saved to %s. "
            "Set ENCRYPTION_KEY env var for reproducible deployments.",
            key_path,
        )

    # Derive a valid Fernet key from the raw key material
    # Fernet requires 32 url-safe base64-encoded bytes
    derived = hashlib.sha256(raw_key.encode()).digest()
    _fernet_key = base64.urlsafe_b64encode(derived)
    return _fernet_key


def _get_fernet():
    """Get a Fernet instance."""
    from cryptography.fernet import Fernet

    return Fernet(_get_encryption_key())


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string value. Returns Fernet-encrypted string."""
    if not plaintext:
        return plaintext
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted string."""
    if not ciphertext:
        return ciphertext
    f = _get_fernet()
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        # If decryption fails, return as-is (might be plaintext from before encryption was added)
        logger.warning("Failed to decrypt value — may be legacy plaintext")
        return ciphertext


# Fields that should be encrypted (API key fields)
ENCRYPTED_FIELDS = frozenset({
    "gemini_api_key",
    "openai_api_key",
    "claude_api_key",
    "azure_api_key",
    "vertex_project_id",  # Acts as auth credential
})


def is_encrypted_field(key: str) -> bool:
    """Check if a setting key should be encrypted."""
    return key in ENCRYPTED_FIELDS or key.endswith("_api_key")
