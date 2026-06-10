"""Tests for app.utils.secrets — encryption, decryption, masking."""

import pytest

from app.utils.secrets import (
    SENSITIVE_KEY_PATTERNS,
    decrypt_value,
    encrypt_value,
    is_masked,
    is_sensitive_key,
    mask_value,
)


# ---------------------------------------------------------------------------
# encrypt_value / decrypt_value
# ---------------------------------------------------------------------------


class TestEncryptDecrypt:
    def test_encrypt_returns_different_string(self):
        plain = "sk-abcdef1234567890"
        encrypted = encrypt_value(plain)
        assert encrypted != plain
        assert isinstance(encrypted, str)

    def test_roundtrip(self):
        plain = "sk-abcdef1234567890"
        encrypted = encrypt_value(plain)
        decrypted = decrypt_value(encrypted)
        assert decrypted == plain

    def test_encrypt_empty_returns_empty(self):
        assert encrypt_value("") == ""

    def test_decrypt_empty_returns_empty(self):
        assert decrypt_value("") == ""

    def test_roundtrip_long_value(self):
        plain = "a" * 500
        assert decrypt_value(encrypt_value(plain)) == plain

    def test_roundtrip_unicode(self):
        plain = "密钥🔑key"
        assert decrypt_value(encrypt_value(plain)) == plain

    def test_different_plaintexts_produce_different_ciphertexts(self):
        e1 = encrypt_value("value-one")
        e2 = encrypt_value("value-two")
        assert e1 != e2

    def test_same_plaintext_produces_different_ciphertexts(self):
        """Fernet uses a timestamp — encrypting the same value twice gives different ciphertext."""
        e1 = encrypt_value("same-value")
        e2 = encrypt_value("same-value")
        assert e1 != e2
        # But both decrypt to the same value
        assert decrypt_value(e1) == decrypt_value(e2) == "same-value"


# ---------------------------------------------------------------------------
# is_sensitive_key
# ---------------------------------------------------------------------------


class TestIsSensitiveKey:
    @pytest.mark.parametrize(
        "key",
        [
            "openai_api_key",
            "gemini_api_key",
            "claude_api_key",
            "azure_api_key",
            "my_token",
            "secret_value",
            "access_password",
            "api_key",
            "API_KEY",
            "OPENAI_API_KEY",
            "Secret_Stuff",
            "Token_Value",
        ],
    )
    def test_sensitive_keys(self, key: str):
        assert is_sensitive_key(key) is True

    @pytest.mark.parametrize(
        "key",
        [
            "model_name",
            "base_url",
            "timeout",
            "max_retries",
            "llm_service",
            "output_format",
            "gemini_model_name",
            "openai_model",
            "ollama_base_url",
        ],
    )
    def test_non_sensitive_keys(self, key: str):
        assert is_sensitive_key(key) is False

    def test_patterns_constant(self):
        assert "api_key" in SENSITIVE_KEY_PATTERNS
        assert "secret" in SENSITIVE_KEY_PATTERNS
        assert "token" in SENSITIVE_KEY_PATTERNS
        assert "password" in SENSITIVE_KEY_PATTERNS


# ---------------------------------------------------------------------------
# mask_value
# ---------------------------------------------------------------------------


class TestMaskValue:
    def test_empty_string(self):
        assert mask_value("") == ""

    def test_short_string_returns_asterisks(self):
        # len <= 8 → "****"
        assert mask_value("short") == "****"
        assert mask_value("12345678") == "****"

    def test_long_string_shows_first4_last4(self):
        val = "sk-1234abcd5678"
        masked = mask_value(val)
        assert masked.startswith("sk-1")
        assert masked.endswith("5678")
        assert "*" in masked
        # Middle should be all asterisks
        middle = masked[4:-4]
        assert all(c == "*" for c in middle)

    def test_exactly_9_chars(self):
        val = "123456789"
        masked = mask_value(val)
        # first 4 = "1234", last 4 = "6789", middle = "*" (1 char)
        assert masked == "1234*6789"

    def test_preserves_length_pattern(self):
        val = "abcdefghijklmnop"  # 16 chars
        masked = mask_value(val)
        assert masked == "abcd********mnop"


# ---------------------------------------------------------------------------
# is_masked
# ---------------------------------------------------------------------------


class TestIsMasked:
    def test_empty_not_masked(self):
        assert is_masked("") is False

    def test_four_asterisks_is_masked(self):
        assert is_masked("****") is True

    def test_long_masked_value(self):
        val = "sk-1****5678"
        assert is_masked(val) is True

    def test_plaintext_not_masked(self):
        assert is_masked("sk-abcdef1234567890") is False

    def test_short_non_masked(self):
        assert is_masked("hello") is False

    def test_exactly_8_chars_asterisks(self):
        # "********" — middle = 0 chars → should fail since len(middle) == 0
        # Wait: for len > 8: middle = value[4:-4], if len == 8 then middle is empty
        # Actually len("********") == 8, which is <= 8, so goes to value == "****" check
        # "********" != "****" → False
        assert is_masked("********") is False

    def test_9_char_masked(self):
        assert is_masked("1234*6789") is True

    def test_9_char_not_masked(self):
        assert is_masked("1234a6789") is False
