# FastAPI Backend Architecture

The backend of Marker UI is implemented in Python 3.10+ using **FastAPI** to achieve high concurrency and clear routing.

---

## Code Layout

The backend structure resides under `backend/app/`:

- **`core/`**:
  - **`config.py`**: Loads environment configuration (host, port, DB URL) and sets file size limits.
  - **`api_manager.py`**: Manages downstream LLM service interactions, key retrieval, and API clients.
- **`routes/`**:
  - **`convert.py`**: Endpoints for file uploads, local path conversion, history querying, downloads, and events.
  - **`settings.py`**: Configuration endpoints, active LLM selections, and GPU/PyTorch status tracking.
  - **`models.py`**: Handles engine weight installation status.
- **`models/`**:
  - **`database.py`**: Database models (`Job`, `Setting`) mapped via SQLAlchemy.
- **`services/`**:
  - **`task_manager.py`**: Manages worker queues, subprocess thread pools, and live execution consoles.
- **`utils/`**:
  - **`secrets.py`**: Key encryption and response masking helpers.

---

## Key Patterns

### Dependency Injection
FastAPI's dependency injection (`Depends`) is used to manage database sessions cleanly per request:
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
```

### Encryption Middleware
Symmetric keys are encrypted before database insertion. On retrieval, values are decrypted or masked before returning to the API router.
