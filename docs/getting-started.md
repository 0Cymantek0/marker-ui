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

### 1. I want to deploy the app quickly
If you want to use the application without managing Python packages, virtual environments, or Node.js versions, run via **Docker Compose**:
- Go to the [Docker Installation Guide](installation/docker.md).

### 2. I want to build and modify the code
If you want to run the frontend and backend in development mode to contribute features or troubleshoot code directly:
- Go to the [Source Installation Guide](installation/source.md).

### 3. Operating System Specific Guides
- [Windows Setup Guide](installation/windows.md)
- [Linux & macOS Setup Guide](installation/linux-macos.md)

---

## First Run Expectations

When you launch Marker UI for the first time:
1. You will be greeted by the **Onboarding (Neural Engine Setup)** screen.
2. The backend will automatically check for and download the required weights for layout segmentation, text detection, and OCR models.
3. This download can take anywhere from **2 to 10 minutes** depending on your internet connection and disk speeds.
4. Once the setup completes, you will be redirected to the **Convert** dashboard.
