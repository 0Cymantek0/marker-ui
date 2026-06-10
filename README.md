# Marker UI

A modern, local-first web interface for [marker](https://github.com/datalab-to/marker), the document-to-markdown conversion engine. Marker UI allows you to convert PDFs, DOCX, PPTX, XLSX, EPUB, HTML, and images into clean Markdown, JSON, or HTML with real-time progress tracking and optional LLM-enhanced conversion.

## Features

- **Multi-format input**: Supports PDF, DOCX, XLSX, PPTX, EPUB, HTML, and images (JPG, PNG, WebP, TIFF, BMP).
- **Multiple output formats**: Export to Markdown, JSON, HTML, or structured chunks.
- **LLM-enhanced conversion**: Connect to Gemini, Claude, OpenAI, Azure OpenAI, Ollama, or Vertex AI for improved layout parsing and formatting.
- **Real-time progress**: Live updates during document processing powered by Server-Sent Events (SSE).
- **Local-first security**: API keys and settings are stored locally in an encrypted database. No environment variables are required.
- **User-friendly interface**: Simple and clean UI designed for ease of use.
- **Docker-ready**: Deploy the entire application with a single command.

## Security Model

Marker UI is designed as a **local-first personal tool** that runs on your local machine.

- **Localhost by default**: Docker binds to `127.0.0.1:3000` by default so the application is not exposed to your network.
- **Encrypted settings**: Sensitive settings (such as LLM API keys) are stored encrypted (using Fernet symmetric encryption) in a local SQLite database.
- **Masked credentials**: API keys are masked in settings responses (`sk-****abcd`) so they never appear in plain text in browser developer tools.
- **SSRF protection**: LLM test connections are restricted to a verified allowlist of service hosts.
- **Upload safety**: Limits file uploads to 100 MB, validates file extensions, and streams writes directly to disk to minimize memory consumption.

## Quick Start

### Running with Docker (Recommended)

To run the latest pre-built image from Github Container Registry (GHCR):

```bash
docker compose up -d
```

Once started, open `http://localhost:3000` in your browser.

To update to the latest version:
```bash
docker compose pull && docker compose up -d
```

#### Customizing Configuration (Optional)
By default, the application is accessible only on localhost. If you need to expose it on your local network, modify the ports section in `docker-compose.yml`:

```yaml
ports:
  - "3000:80"
```

> [!WARNING]
> If you expose the application on your network, make sure to set `MARKER_ACCESS_TOKEN` in your `.env` file to require authentication headers on API calls.

---

### Running from Source (Development)

To run the application manually, ensure you have Python 3.10+ and Node.js 18+ installed.

#### 1. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
The backend API documentation will be available at `http://localhost:8000/docs`.

#### 2. Frontend Setup
```bash
cd frontend
pnpm install
pnpm dev
```
The frontend application will be available at `http://localhost:5173`.

---

## Configuration

The application can be customized using the following environment variables (defined in your `.env` file):

| Variable | Default | Description |
|---|---|---|
| `MARKER_HOST` | `0.0.0.0` | Backend bind address |
| `MARKER_PORT` | `8000` | Backend bind port |
| `MARKER_DEBUG` | `false` | Enable debug logging |
| `MARKER_ACCESS_TOKEN` | *(unset)* | If set, requests must include `x-access-token` header |
| `MARKER_MAX_UPLOAD_SIZE` | `104857600` | Max file upload size in bytes (default 100 MB) |
| `MARKER_DATABASE_URL` | `sqlite+aiosqlite:///data/marker_ui.db` | SQLite database connection string |
| `MARKER_SECRET_KEY_PATH` | `data/.secret_key` | Path to the Fernet encryption key file |

---

## Development & Architecture

For details on the project folder structure, API endpoints, running tests, or managing database migrations, please refer to [DEVELOPMENT.md](file:///c:/Users/shuvagata/Documents/dev/marker/DEVELOPMENT.md).

## License

Marker UI is built on top of [marker](https://github.com/datalab-to/marker) and is licensed under the **GPL-3.0 license**.
