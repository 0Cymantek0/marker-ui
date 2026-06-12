# Marker UI Development & Architecture

This guide provides an in-depth look at the technical foundations of Marker UI, designed for contributors and developers looking to extend the platform.

---

## 🏗️ Technical Architecture

Marker UI is designed as a stateless API with a persistent, local-first database.

### 1. The Core Stack
- **API**: FastAPI (Python 3.10+)
- **Database**: SQLite (managed via SQLAlchemy 2.0 with `aiosqlite`)
- **Frontend**: React 19, TypeScript, Vite 6
- **Styling**: Tailwind CSS + shadcn/ui (Radix UI primitives)
- **Real-time**: Server-Sent Events (SSE) for progress streaming

### 2. Folder Structure
```text
marker-ui/
├── backend/
│   ├── app/
│   │   ├── core/           # Config, API manager, and system-wide constants
│   │   ├── models/         # SQLAlchemy schemas (Job, Setting)
│   │   ├── routes/         # Endpoint handlers (Convert, Settings, Models)
│   │   ├── services/       # MarkerService (conversion logic) & TaskManager (queue)
│   │   └── utils/          # Encryption, secrets, and masking utilities
│   ├── tests/              # Exhaustive Pytest suite
│   └── alembic/            # Database migrations
├── frontend/
│   ├── src/
│   │   ├── components/     # Atomic UI components and feature-specific blocks
│   │   ├── hooks/          # useSSE, useSettings, useConversionQueue
│   │   ├── pages/          # Onboarding, Convert, History, Settings
│   │   └── lib/            # Axios API client and utility helpers
```

---

## 🚀 Development Workflow

### 1. Environment Configuration
Copy the `.env.example` to `.env` in the root or `backend` folder.
- `MARKER_ACCESS_TOKEN`: Set this if you need to protect your local API.
- `MARKER_DATABASE_URL`: Defaults to `sqlite+aiosqlite:///data/marker_ui.db`.

### 2. Database Migrations
We use **Alembic** for schema evolution. If you modify any model in `app/models/`:
```bash
cd backend
# Generate migration
alembic revision --autogenerate -m "Add new field to settings"
# Apply migration
alembic upgrade head
```

### 3. Encryption & Secrets
Marker UI uses **Fernet symmetric encryption** to protect LLM API keys.
- The encryption key is generated on the first run and stored in `data/.secret_key`.
- **Never** share or commit this key.
- API keys are masked as `sk-****abcd` in all non-internal API responses to prevent accidental exposure in frontend logs.

---

## 🧪 Testing Strategy

Quality is verified across multiple layers:
- **Unit Tests**: Encryption logic, model validation, and utility functions.
- **Integration Tests**: API endpoint lifecycle, from file upload to SSE progress updates and final download.
- **Concurrency Tests**: Ensuring the `TaskManager` handles multiple simultaneous conversion requests gracefully.

To run the full suite:
```bash
cd backend
python -m pytest tests/ -v
```

---

## 🎨 UI & UX Standards

We prioritize a **High-Density, Low-Clutter** interface.
- **Typography**: Uses the project's default sans-serif stack with heavy tracking on headers.
- **Theming**: Context-aware theme engine (Dark/Light mode support).
- **Interactions**: Real-time feedback via `sonner` toasts and glassmorphic progress indicators.

### Onboarding Flow
The `OnboardingPage` is the gatekeeper of the application. It ensures that all required weights (Text Detection, OCR, etc.) are present before allowing user interaction. It uses a polling mechanism to communicate with the `ModelTracker` backend service.

---

## 📝 Contribution Guidelines

1. **Surgical Changes**: Keep PRs focused. Avoid large refactors unless explicitly requested.
2. **Type Safety**: All new Python code should be type-hinted; React components must use strict TypeScript interfaces.
3. **Document as you Code**: Update this guide if you introduce new services or architectural patterns.
4. **License Compliance**: As this project is GPL-3.0, ensure all new dependencies are compatible.

---
*For more information, please check the [README.md](../README.md).*
