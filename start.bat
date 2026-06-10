@echo off
setlocal enabledelayedexpansion
title Marker UI

echo.
echo   ========================================
echo       Marker UI - One-Click Launcher
echo   ========================================
echo.

:: Change to script directory
cd /d "%~dp0"

:: ── Check Python ──────────────────────────────────────────────────
echo [1/6] Checking prerequisites...

where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   ERROR: Python not found. Install from https://python.org
    pause
    exit /b 1
)

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo   Python: %PYVER%

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=1" %%v in ('node --version 2^>^&1') do set NODEVER=%%v
echo   Node.js: %NODEVER%

:: ── Virtual environment ───────────────────────────────────────────
echo.
echo [2/6] Setting up Python virtual environment...

if not exist ".venv" (
    echo   Creating .venv...
    python -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo   ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
)

:: ── Install Python deps ───────────────────────────────────────────
echo.
echo [3/6] Installing Python dependencies...

.venv\Scripts\pip.exe install -r backend\requirements.txt --quiet
if %ERRORLEVEL% neq 0 (
    echo   WARNING: Full install failed, retrying without [full] extra...
    findstr /v "marker-pdf\[full\]" backend\requirements.txt > backend\requirements_min.txt
    .venv\Scripts\pip.exe install -r backend\requirements_min.txt --quiet
    .venv\Scripts\pip.exe install marker-pdf --quiet
    del backend\requirements_min.txt
)
echo   Python dependencies installed

:: ── Install Node deps ─────────────────────────────────────────────
echo.
echo [4/6] Installing Node.js dependencies...

cd frontend
if not exist "node_modules" (
    call npm install --loglevel error
    if %ERRORLEVEL% neq 0 (
        echo   ERROR: npm install failed
        cd ..
        pause
        exit /b 1
    )
) else (
    echo   node_modules exists, skipping install
)
cd ..

echo   Node.js dependencies installed

:: ── Create data directories ───────────────────────────────────────
echo.
echo [5/6] Creating data directories...

if not exist "data" mkdir data
if not exist "data\uploads" mkdir data\uploads
if not exist "data\output" mkdir data\output
if not exist ".omo" mkdir .omo

echo   Data directories ready

:: ── Start services ────────────────────────────────────────────────
echo.
echo [6/6] Starting services...
echo.

echo   Starting backend on http://localhost:8000 ...
start /B .venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --app-dir backend > .omo\backend.log 2>&1

:: Wait for backend to start
timeout /t 3 /nobreak >nul

echo   Starting frontend on http://localhost:5173 ...
cd frontend
start /B npm run dev > ..\.omo\frontend.log 2>&1
cd ..

timeout /t 3 /nobreak >nul

echo.
echo   ========================================
echo   Marker UI is running!
echo.
echo     Frontend:  http://localhost:5173
echo     Backend:   http://localhost:8000
echo     API Docs:  http://localhost:8000/docs
echo.
echo   Close this window to stop all services.
echo   ========================================
echo.

:: Keep window open — user closes window to stop
pause
