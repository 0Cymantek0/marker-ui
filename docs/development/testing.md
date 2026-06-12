# Testing Strategy

Marker UI uses **pytest** for testing the FastAPI backend components. Quality is verified across database schemas, encryption algorithms, API routers, and concurrency limits.

---

## Running Tests

Ensure you have activated your virtual environment inside the `backend/` directory, then execute:
```bash
python -m pytest tests/ -v
```

---

## Test Suites Overview

- **`test_crypto.py`**: Validates that Fernet encrypts setting credentials securely, empty values are preserved, and legacy plaintext values are decrypted gracefully without raising errors.
- **`test_secrets.py`**: Asserts masking behavior (asterisks insertion in `api_key` matching JSON keys) and ensures short keys are completely masked.
- **`test_upload.py`**: Tests upload endpoints, file extension validations, and size rejections.
- **`test_settings.py`**: Verifies settings GET/PUT behaviors, defaults, and LLM configuration changes.
- **`test_task_manager.py`**: Verifies that the task queue processes jobs sequentially, updates status codes on completion, and records execution logs.

---

## Known Testing Gaps

While core backend units are covered, the following areas represent known gaps:
1. **End-to-End Frontend Tests**: We do not currently run automated Cypress or Playwright suites to click through the React UI.
2. **Real LLM Integration**: Tests use mocks instead of hitting live Gemini/Claude endpoints.
3. **Model Weights Integrations**: Tests bypass the heavy model loading stage, using mock byte arrays (`b"%PDF-1.4 test content"`) to verify the CLI execution wrapper.
