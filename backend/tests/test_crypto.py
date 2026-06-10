"""Tests for Fernet encryption/decryption of API keys."""

from __future__ import annotations

import pytest

from app.crypto import encrypt_value, decrypt_value, is_encrypted_field


# ---------------------------------------------------------------------------
# encrypt_value produces non-plaintext
# ---------------------------------------------------------------------------


def test_encrypt_value_produces_non_plaintext():
    """Encrypted output must differ from the input."""
    plaintext = "sk-1234567890abcdef"
    encrypted = encrypt_value(plaintext)
    assert encrypted != plaintext
    # Fernet tokens are base64 — they should be longer and contain no raw secret
    assert len(encrypted) > len(plaintext)


def test_encrypt_empty_string_returns_empty():
    """Empty string should pass through unchanged."""
    assert encrypt_value("") == ""


# ---------------------------------------------------------------------------
# decrypt_value reverses encrypt_value
# ---------------------------------------------------------------------------


def test_decrypt_value_reverses_encrypt_value():
    """Encrypt then decrypt must return the original plaintext."""
    plaintext = "my-super-secret-api-key-12345"
    encrypted = encrypt_value(plaintext)
    decrypted = decrypt_value(encrypted)
    assert decrypted == plaintext


def test_decrypt_empty_string_returns_empty():
    assert decrypt_value("") == ""


# ---------------------------------------------------------------------------
# decrypt_value handles legacy plaintext gracefully
# ---------------------------------------------------------------------------


def test_decrypt_value_handles_legacy_plaintext():
    """If the value was never encrypted (e.g. stored before encryption was added),
    decrypt_value should return it as-is instead of raising."""
    plaintext = "legacy-unencrypted-key"
    result = decrypt_value(plaintext)
    assert result == plaintext


def test_decrypt_value_handles_random_garbage():
    """Random non-Fernet strings should be returned as-is."""
    garbage = "not-a-valid-fernet-token!!!"
    result = decrypt_value(garbage)
    assert result == garbage


# ---------------------------------------------------------------------------
# is_encrypted_field identifies API key fields
# ---------------------------------------------------------------------------


def test_is_encrypted_field_known_keys():
    """Fields in ENCRYPTED_FIELDS must be identified."""
    assert is_encrypted_field("gemini_api_key") is True
    assert is_encrypted_field("openai_api_key") is True
    assert is_encrypted_field("claude_api_key") is True
    assert is_encrypted_field("azure_api_key") is True
    assert is_encrypted_field("vertex_project_id") is True


def test_is_encrypted_field_suffix_match():
    """Any field ending with '_api_key' should be flagged."""
    assert is_encrypted_field("custom_provider_api_key") is True
    assert is_encrypted_field("future_llm_api_key") is True


def test_is_encrypted_field_non_key_fields():
    """Regular settings should not be flagged for encryption."""
    assert is_encrypted_field("theme") is False
    assert is_encrypted_field("language") is False
    assert is_encrypted_field("output_format") is False
    assert is_encrypted_field("max_retries") is False
    assert is_encrypted_field("ollama_base_url") is False


# ---------------------------------------------------------------------------
# Roundtrip with special characters
# ---------------------------------------------------------------------------


def test_encrypt_decrypt_roundtrip_special_chars():
    """Ensure encryption handles special characters in API keys."""
    plaintext = "sk-proj-abc+def/ghi=jkl=="
    encrypted = encrypt_value(plaintext)
    assert decrypt_value(encrypted) == plaintext
