# Marker UI Developer Documentation

This document contains technical details regarding the architecture, directory structure, database migrations, and testing for Marker UI.

## Directory Structure

```
marker-ui/
├── backend/                  # FastAPI Python backend
│   ├── app/
│   │   ├── main.py          # Application entry point, lifespan, CORS, and token middleware
│   │   ├── database.py      # Async SQLite configuration using SQLAlchemy 2.0
│   │   ├── core/            # Configuration and environment variable loader
│   │   ├── models/          # SQLAlchemy database models
│   │   ├── routes/          # API endpoint route handlers (convert, settings)
│   │   ├── services/        # MarkerService (PDF conversion wrapper) and TaskManager
│   │   └── utils/           # Encryption and secret management utility functions
│   ├── tests/               # Pytest suite
│   ├── alembic/             # Database migrations configuration and versions
│   └── requirements.txt
├── frontend/                 # Vite + React + TypeScript + Tailwind CSS frontend
│   ├── src/
│   │   ├── components/      # UI primitives (FileUpload, ConversionOptions, etc.)
│   │   ├── hooks/           # Custom hooks (useSettings, useConversion, useSSE)
│   │   ├── lib/             # API client utility functions
│   │   └── pages/           # Convert, Settings, and History pages
│   └── package.json
├── docker-compose.yml        # Docker compose configuration file
├── Dockerfile               # Multi-stage container build definition
└── nginx.conf               # Frontend Nginx server and API reverse proxy
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vite 6, React 19, TypeScript, Tailwind CSS |
| **Components** | shadcn/ui + Radix UI primitives |
| **Backend** | FastAPI, Uvicorn, Python 3.10+ |
| **Database** | SQLite (async using aiosqlite + SQLAlchemy 2.0) |
| **Real-time** | Server-Sent Events (SSE) using sse-starlette |
| **Conversion Engine** | marker-pdf (PdfConverter, TableConverter, etc.) |
| **Deployment** | Docker Compose (nginx + uvicorn) |

## Running Tests

To run the backend pytest suite, ensure the development dependencies are installed:

```bash
cd backend
pip install -r requirements-test.txt
python -m pytest tests/
```

The test suite includes 155 tests covering:
- SQLAlchemy models and schemas
- Encryption and credentials masking
- API endpoints and authentication middleware
- Task manager queue and SSE streams
- File upload validation (extension allowlist and size limits)

## Database Migrations (Alembic)

Database schema updates are managed using Alembic. To create and apply database migrations:

```bash
cd backend
# Create a new revision auto-generated from model changes
alembic revision --autogenerate -m "description_of_changes"

# Upgrade your local database to the latest schema version
alembic upgrade head
```

## API Reference

The interactive Swagger API reference is available at `/docs` (e.g., `http://localhost:8000/docs`) when running the backend locally.

### Key Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/convert/upload` | Upload a document and start a conversion job |
| `GET` | `/api/convert/status/{id}` | Retrieve the status and progress of a job |
| `GET` | `/api/convert/events/{id}` | Listen to the SSE progress stream for a job |
| `GET` | `/api/convert/download/{id}` | Download the converted output file |
| `GET` | `/api/convert/history` | List all historical conversion jobs (paginated) |
| `DELETE` | `/api/convert/{id}` | Cancel a running job and delete its database records |
| `GET` | `/api/settings` | List all settings grouped by category |
| `PUT` | `/api/settings` | Update a single setting |
| `GET` | `/api/settings/llm/config` | Retrieve the assembled and masked LLM configuration |
| `PUT` | `/api/settings/llm/config` | Persist LLM configuration settings |
| `GET` | `/api/health` | Service health status check |
