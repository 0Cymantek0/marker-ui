# Security Architecture

Marker UI handles sensitive local information, including documents and API keys for cloud LLM providers. This document specifies the security boundaries and mechanisms used to protect this data.

---

## 1. Credentials Encryption (Fernet)

API keys for LLM services are encrypted before they are stored in the database.
- **Algorithm**: AES-128 in CBC mode using a SHA256 HMAC for authentication (standard Fernet cryptography via python's `cryptography` library).
- **Key Store**: The 32-byte key is stored in `data/.secret_key` with strict host system permissions (`0600` in Linux/macOS environments).
- **Graceful Failbacks**: If unencrypted keys are found (e.g. from legacy installations), they are returned as-is rather than crashing, but will be encrypted upon the next settings save.

---

## 2. API Response Masking

To prevent secret keys from appearing in browser logs, diagnostic outputs, or frontend state:
- Every settings request that returns credentials runs through the masking filter in `app.utils.secrets`.
- Any setting key containing substrings like `api_key`, `token`, `password`, or `secret` is masked.
- If the value is 8 characters or less, it is replaced entirely by `****`.
- If the value is longer than 8 characters, the first 4 characters and the last 4 characters are preserved, with the middle characters replaced by asterisks (e.g. `sk-p********abcd`).

---

## 3. Local Path Validation

The **Local Absolute Paths** feature allows users to convert documents by specifying their location on the server's filesystem.
- To prevent arbitrary directory traversal attacks or loading system-protected files, paths must be explicitly validated.
- **SSRF Restrictions**: The application restricts outbound LLM requests to verified provider endpoints, blocking requests to internal metadata endpoints.
