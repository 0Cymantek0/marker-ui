# Getting Started with Marker UI

Marker UI is an open-source, local-first web application designed to run document-to-markdown conversions using the `marker` engine. It provides a browser-based user interface that makes running conversions, inspecting logs, managing history, and configuring LLMs simple and intuitive.

---

## Why Marker UI Exists

The core `marker` engine is a Python CLI tool. While highly effective, it has several operational hurdles for everyday use:
- **No visual feedback**: Running deep-learning tasks via terminal can feel opaque.
- **Complex outputs**: Extracted images are saved to disk, but linking them correctly in downstream LLM contexts or tools requires manual effort.
- **Configuration overhead**: Modifying model settings, input folders, or LLM providers requires command line flags or manual file edits.

Marker UI bridges these gaps by wrapping the engine in a modern, secure, and self-hosted web interface.

---

## User Journeys

Choose the guide that fits your goals:

### 1. I want to run the app quickly (Recommended)
The recommended way to run Marker UI is using the quick-start launcher scripts (`start.sh` / `start.bat` / `start.ps1`). These scripts automate dependency checks, virtual environment creation, installation, and startup:
- For Windows: Go to the [Windows Setup Guide](installation/windows.md).
- For Linux & macOS: Go to the [Linux & macOS Setup Guide](installation/linux-macos.md).

### 2. I want to deploy using Docker
If you want to run the application containerized without managing Python packages, virtual environments, or Node.js versions on your host system:
- Go to the [Docker Installation Guide](installation/docker.md).

### 3. I want to build and modify the code manually
If you want to manually configure, run, and develop the frontend and backend:
- Go to the [Source Installation Guide](installation/source.md).

---

## First Run Expectations

When you launch Marker UI for the first time:
1. You will be greeted by the **Onboarding (Neural Engine Setup)** screen.
2. The backend will automatically check for and download the required weights for layout segmentation, text detection, and OCR models.
3. This download can take anywhere from **2 to 10 minutes** depending on your internet connection and disk speeds.
4. Once the setup completes, you will be redirected to the **Convert** dashboard.
