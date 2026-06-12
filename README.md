# Marker UI

Marker UI is a local-first web interface for [marker](https://github.com/datalab-to/marker), a document-to-markdown conversion engine. It allows you to convert PDF, DOCX, PPTX, XLSX, EPUB, and image files into Markdown, HTML, or JSON via a browser-based layout, entirely on your own hardware.

---

## Why Marker UI?

While the core `marker` engine provides a powerful command-line interface, Marker UI offers:
- **Interactive Browser Workflow**: Drag-and-drop file uploads, options configuration, and live progress bars.
- **Conversion History**: A searchable record of past conversions with individual file downloads.
- **Visual Engine Onboarding**: Clear indicators for neural model weights downloads during first launch.
- **LLM-Enhanced Refinement**: Optional post-conversion correction (fixing tables, syntax, layout flow) via local or cloud LLM APIs.
- **Self-Hosted Privacy**: Designed to be run locally, ensuring sensitive documents and API keys do not leave your network.

---

## Key Features

- **Document Conversions**: Convert PDFs, office documents, and common image types.
- **Model Downloader UI**: Tracks layout, OCR, and segmentation model weight download progress.
- **Local Key Encryption**: API keys for external LLM services are encrypted locally with Fernet.
- **Job Console**: Real-time conversion logs and Server-Sent Events (SSE) streaming.
- **Docker Compose Setup**: Ready-to-go environment combining FastAPI backend, Nginx, and React frontend.

---

## Documentation Index

We have structured the documentation to help you get started quickly or dive deep into the codebase.

### Getting Started & Installation
- [Getting Started Guide](docs/getting-started.md)
- **Deployment Paths**:
  - [Docker Compose Deployment](docs/installation/docker.md)
  - [Running from Source](docs/installation/source.md)
- **Platform-Specific Guides**:
  - [Windows Setup Guide](docs/installation/windows.md)
  - [Linux & macOS Setup Guide](docs/installation/linux-macos.md)

### Usage & Configuration
- [Converting Documents](docs/usage/convert-documents.md)
- [Supported Output Formats](docs/usage/output-formats.md)
- [Using Local Absolute Paths](docs/usage/local-file-paths.md)
- [LLM Refinement Config](docs/usage/llm-refinement.md)
- [History & Storage](docs/usage/history-and-downloads.md)
- **Reference**:
  - [Environment Variables](docs/configuration/environment-variables.md)
  - [LLM Provider Credentials](docs/configuration/llm-providers.md)
  - [Storage Configuration](docs/configuration/storage.md)
  - [Security Architecture](docs/configuration/security.md)

### API Reference
- [Document Conversion Endpoints](docs/api/convert.md)
- [System & LLM Settings](docs/api/settings.md)
- [SSE Stream Details](docs/api/sse-events.md)

### Architecture & Development
- [High-Level Architecture](docs/development/architecture.md)
- [FastAPI Backend](docs/development/backend.md)
- [Vite/React Frontend](docs/development/frontend.md)
- [Task Queue & Manager](docs/development/task-manager.md)
- [Database & Migrations](docs/development/database.md)
- [Testing Suite](docs/development/testing.md)

### Community & Troubleshooting
- [Troubleshooting Common Issues](docs/troubleshooting.md)
- [Known Limitations](docs/limitations.md)
- [Feature Roadmap & Ideas](docs/roadmap.md)
- [Contributing Guide](CONTRIBUTING.md)

---

## Quick Start

The recommended method to run Marker UI is using the quick-start launcher scripts (`start.sh` / `start.bat` / `start.ps1`) depending on your platform. These scripts automatically handle system checks, environment creation, dependencies, and launch both frontend and backend.

### 1. Launcher Scripts (Recommended)

- **Linux & macOS**:
  ```bash
  chmod +x start.sh
  ./start.sh
  ```
- **Windows (Command Prompt / Explorer)**:
  Double-click `start.bat` or run:
  ```cmd
  start.bat
  ```
- **Windows (PowerShell)**:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
  .\start.ps1
  ```

Once started, open `http://localhost:5173` in your browser.

### 2. Docker Compose

Alternatively, spin up the entire stack via Docker:

```bash
docker compose up -d
```

Once started, open `http://localhost:3000` in your browser.

> [!NOTE]
> The first conversion may take several minutes as neural models download in the background.

---

## Testing

Backend test suite covers upload rules, secrets encryption, job statuses, and queue logic:

```bash
cd backend
python -m pytest tests/ -v
```

---

## License

This project is licensed under the GPL-3.0 License. See [LICENSE](LICENSE) for details.
