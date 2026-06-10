<#
.SYNOPSIS
    Marker UI — One-click launcher (PowerShell)
.DESCRIPTION
    Checks Python 3.10+ and Node 18+, installs dependencies,
    creates a virtual environment, and starts both backend and frontend.
.EXAMPLE
    .\start.ps1
#>

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "  _  _  _  _  _  _  _  _  _  _  _  _  _  _  _  _  _  _" -ForegroundColor DarkGray
Write-Host " |                                                    |" -ForegroundColor DarkGray
Write-Host " |          Marker UI — One-Click Launcher            |" -ForegroundColor Cyan
Write-Host " |                                                    |" -ForegroundColor DarkGray
Write-Host "  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -" -ForegroundColor DarkGray
Write-Host ""

# ── Utility ──────────────────────────────────────────────────────────

function Test-Command {
    param([string]$Name)
    try { Get-Command $Name -ErrorAction Stop | Out-Null; return $true }
    catch { return $false }
}

function Get-PythonCmd {
    # Prefer python3, fall back to python
    foreach ($cmd in @("python", "python3", "py")) {
        if (Test-Command $cmd) {
            $ver = & $cmd --version 2>&1
            if ($ver -match "3\.(\d+)") {
                $minor = [int]$Matches[1]
                if ($minor -ge 10) { return $cmd }
            }
        }
    }
    return $null
}

# ── Check prerequisites ──────────────────────────────────────────────

Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Yellow

$pythonCmd = Get-PythonCmd
if (-not $pythonCmd) {
    Write-Host "  ERROR: Python 3.10+ not found. Install from https://python.org" -ForegroundColor Red
    exit 1
}
$pyVer = & $pythonCmd --version 2>&1
Write-Host "  Python: $pyVer" -ForegroundColor Green

if (-not (Test-Command "node")) {
    Write-Host "  ERROR: Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
$nodeVer = node --version
Write-Host "  Node.js: $nodeVer" -ForegroundColor Green

# ── Virtual environment ──────────────────────────────────────────────

Write-Host ""
Write-Host "[2/6] Setting up Python virtual environment..." -ForegroundColor Yellow

if (-not (Test-Path ".venv")) {
    Write-Host "  Creating .venv..." -ForegroundColor DarkGray
    & $pythonCmd -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Failed to create virtual environment" -ForegroundColor Red
        exit 1
    }
}

# Activate venv
$venvPython = if ($IsWindows -or $env:OS -match "Windows") {
    ".venv\Scripts\python.exe"
} else {
    ".venv/bin/python"
}

if (-not (Test-Path $venvPython)) {
    Write-Host "  ERROR: Virtual environment broken. Delete .venv and re-run." -ForegroundColor Red
    exit 1
}

$venvPip = $venvPython -replace "python\.exe$", "pip.exe"
if ($IsWindows -or $env:OS -match "Windows") {
    $venvPip = ".venv\Scripts\pip.exe"
} else {
    $venvPip = ".venv/bin/pip"
}

Write-Host "  Virtual environment ready" -ForegroundColor Green

# ── Install Python deps ──────────────────────────────────────────────

Write-Host ""
Write-Host "[3/6] Installing Python dependencies (first run may take a while)..." -ForegroundColor Yellow

& $venvPip install -r backend/requirements.txt --quiet 2>&1 | ForEach-Object {
    if ($_ -match "error|ERROR|fail") { Write-Host "  $_" -ForegroundColor Red }
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Some dependencies may have failed. Retrying without [full] extra..." -ForegroundColor DarkYellow
    # Retry without the [full] extra — core PDF support still works
    $filteredReqs = Get-Content backend/requirements.txt | Where-Object {
        $_ -notmatch "marker-pdf\[full\]"
    }
    $filteredReqs | & $venvPip install -r - --quiet 2>$null
    & $venvPip install marker-pdf --quiet 2>$null
}
Write-Host "  Python dependencies installed" -ForegroundColor Green

# ── Install Node deps ────────────────────────────────────────────────

Write-Host ""
Write-Host "[4/6] Installing Node.js dependencies..." -ForegroundColor Yellow

Push-Location frontend
if (-not (Test-Path "node_modules")) {
    npm install --loglevel error 2>&1 | ForEach-Object {
        if ($_ -match "error|ERR") { Write-Host "  $_" -ForegroundColor Red }
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: npm install failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
} else {
    Write-Host "  node_modules exists, skipping install" -ForegroundColor DarkGray
}
Pop-Location

Write-Host "  Node.js dependencies installed" -ForegroundColor Green

# ── Create data directories ──────────────────────────────────────────

Write-Host ""
Write-Host "[5/6] Creating data directories..." -ForegroundColor Yellow

@("data", "data/uploads", "data/output") | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
}
Write-Host "  Data directories ready" -ForegroundColor Green

# ── Start services ───────────────────────────────────────────────────

Write-Host ""
Write-Host "[6/6] Starting services..." -ForegroundColor Yellow
Write-Host ""

# Backend
Write-Host "  Starting backend on http://localhost:8000 ..." -ForegroundColor Cyan
$venvUvicorn = if ($IsWindows -or $env:OS -match "Windows") {
    ".venv\Scripts\uvicorn.exe"
} else {
    ".venv/bin/uvicorn"
}

$backendJob = Start-Process -FilePath $venvUvicorn -ArgumentList "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "backend" -PassThru -NoNewWindow -RedirectStandardOutput ".omo\backend.log" -RedirectStandardError ".omo\backend_err.log"

Start-Sleep -Seconds 3

if ($backendJob.HasExited) {
    Write-Host "  ERROR: Backend failed to start. Check .omo/backend_err.log" -ForegroundColor Red
    exit 1
}

# Frontend
Write-Host "  Starting frontend on http://localhost:5173 ..." -ForegroundColor Cyan
$frontendJob = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory "frontend" -PassThru -NoNewWindow -RedirectStandardOutput ".omo\frontend.log" -RedirectStandardError ".omo\frontend_err.log"

Start-Sleep -Seconds 3

# ── Done ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ═══════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Marker UI is running!" -ForegroundColor Green
Write-Host ""
Write-Host "    Frontend:  http://localhost:5173" -ForegroundColor White
Write-Host "    Backend:   http://localhost:8000" -ForegroundColor White
Write-Host "    API Docs:  http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop both services." -ForegroundColor DarkGray
Write-Host "  ═══════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

# Wait for user to press Ctrl+C
try {
    # Monitor processes — if either dies, report it
    while ($true) {
        if ($backendJob.HasExited) {
            Write-Host "  Backend process exited unexpectedly." -ForegroundColor Red
            break
        }
        if ($frontendJob.HasExited) {
            Write-Host "  Frontend process exited unexpectedly." -ForegroundColor Red
            break
        }
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host ""
    Write-Host "  Stopping services..." -ForegroundColor Yellow
    if (-not $backendJob.HasExited) { Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue }
    if (-not $frontendJob.HasExited) { Stop-Process -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "  Services stopped." -ForegroundColor Green
}
