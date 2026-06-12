# Marker UI

Marker UI is a high-performance, local-first web interface for [marker](https://github.com/datalab-to/marker), the state-of-the-art document-to-markdown conversion engine. It transforms complex documents—PDFs with multiple columns, equations, and tables—into clean, structured, and production-ready Markdown, JSON, or HTML.

---

## 🎯 The Problem
Document conversion is often a trade-off between speed and accuracy. Standard tools struggle with layout preservation, OCR errors, and mathematical notation. Furthermore, many high-quality engines require cloud uploads, compromising privacy for sensitive internal documents.

## 🛡️ The Mitigation
Marker UI bridges the gap by providing a **private, local-first workflow** that utilizes neural network pipelines to "read" documents like a human. It supports high-fidelity layout segmentation, neural OCR, and optional LLM-assisted refinement—all running entirely on your own infrastructure.

## ⚠️ Known Limitations & Roadmap
- **Hardware Requirements**: Neural models require significant RAM/VRAM. Machines without dedicated GPUs may experience slower conversion times.
- **Table Complexity**: While advanced, extremely large or deeply nested tables may still require manual touch-ups.
- **Coming Soon**: Integrated Markdown editor for immediate post-conversion refinement and bulk export for massive datasets.

---

## ✨ Key Features

- **Multi-Format Ingestion**: Convert PDF, DOCX, PPTX, XLSX, EPUB, HTML, and images (JPG, PNG, WebP, TIFF, BMP).
- **Neural Processing Pipeline**: Sequential steps for Text Detection, Layout Segmentation, OCR, Table Analysis, and Error Refinement.
- **LLM-Enhanced Refinement**: Optional integration with Gemini, Claude, OpenAI (including O1/O3), Azure, Ollama, and Vertex AI for superior formatting.
- **Local-First Security**: API keys are encrypted (Fernet) and stored in a local SQLite database. No credentials are ever sent to our servers.
- **Real-Time Execution Terminal**: Track conversion progress, logs, and estimated completion times (ETA) via a sleek internal console.
- **Zero-Config Docker Deployment**: Spin up the entire stack, including Nginx and the FastAPI backend, with a single command.

---

## 🚀 Getting Started

### Quick Start (Docker)
The easiest way to run Marker UI is via Docker Compose:

```bash
docker compose up -d
```
Visit `http://localhost:3000` to begin.

### Running from Source
Ensure you have **Python 3.10+** and **Node.js 18+** installed.

#### 1. Backend Setup
```bash
cd backend
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate.ps1

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend Setup
```bash
cd frontend
pnpm install
pnpm dev
```
Open `http://localhost:5173` for the development interface.

---

## 📖 Usage Guide

### 1. One-Time Setup (Onboarding)
Upon first launch, Marker UI will initialize its **Neural Engine**.
- **Engine Console**: Displays real-time download speed, progress, and file validation.
- **Pipeline Visualizer**: Shows the status of each neural model (Text Detection, OCR, etc.).
- **Developer Console**: Provides a verbose diagnostic log for technical users.
*Note: This process may take several minutes depending on your internet speed.*

### 2. Converting Documents
Navigate to the **Convert** page:
- **Upload Zone**: Drag and drop files or select multiple documents.
- **Local Absolute Paths**: For server-side users, you can specify direct file paths on the host machine to avoid large uploads.
- **Conversion Parameters**:
    - **Output Format**: Choose Markdown (default), JSON, HTML, or Chunks.
    - **Converter**: Select `PdfConverter` for standard docs or `TableConverter` for data-heavy files.
    - **LLM Boost**: Enable this to use connected LLMs for fixing layout breaks and OCR slips.
- **Execution Console**: Toggle the terminal to see live logs of the conversion process.

### 3. Settings & LLM Config
Go to the **Settings** page to manage:
- **LLM Providers**: Securely add API keys for Gemini, Claude, or OpenAI.
- **Model Overrides**: Customize which specific models (e.g., `gpt-4o`, `claude-3-5-sonnet`) are used for refinement.
- **Database Management**: View your conversion history and purge old records to save space.

---

## 🛠️ Developer Guide

### Architecture
Marker UI follows a modern decoupled architecture:
- **Backend**: FastAPI (Python) handles the heavy lifting, using SQLAlchemy (Async SQLite) for persistence and `sse-starlette` for real-time events.
- **Frontend**: Vite-based React 19 application using `shadcn/ui` and `Tailwind CSS`.
- **Worker**: An internal task manager handles the conversion queue to prevent blocking the main API thread.

### Testing
We maintain high coverage to ensure reliability:
```bash
cd backend
python -m pytest tests/
```
Tests cover everything from Fernet encryption and masked credentials to SSE stream integrity.

---

## ⚖️ License

Marker UI is built on top of the powerful [marker](https://github.com/datalab-to/marker) engine and is licensed under the **GPL-3.0 License**.

---
*Maintained by the Marker UI Community. Built for speed, privacy, and precision.*
