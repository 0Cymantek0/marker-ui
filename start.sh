#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Marker UI — One-click launcher (Linux / macOS)
# Usage: chmod +x start.sh && ./start.sh
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "  ========================================"
echo "      Marker UI — One-Click Launcher"
echo "  ========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "  $1"; }
ok()    { echo -e "  ${GREEN}$1${NC}"; }
warn()  { echo -e "  ${YELLOW}$1${NC}"; }
err()   { echo -e "  ${RED}$1${NC}"; }

# ── Prerequisites ────────────────────────────────────────────────────
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        ver=$($cmd --version 2>&1 | grep -oP '3\.\d+')
        minor=$(echo "$ver" | cut -d. -f2)
        if [ "$minor" -ge 10 ] 2>/dev/null; then
            PYTHON="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    err "ERROR: Python 3.10+ not found. Install from https://python.org"
    exit 1
fi
ok "Python: $($PYTHON --version 2>&1)"

if ! command -v node &>/dev/null; then
    err "ERROR: Node.js not found. Install from https://nodejs.org"
    exit 1
fi
ok "Node.js: $(node --version)"

# ── Virtual environment ──────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[2/6] Setting up Python virtual environment...${NC}"

if [ ! -d ".venv" ]; then
    info "Creating .venv..."
    $PYTHON -m venv .venv
    if [ $? -ne 0 ]; then
        err "Failed to create virtual environment"
        exit 1
    fi
fi

# Activate
source .venv/bin/activate
ok "Virtual environment ready"

# ── Install Python deps ──────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[3/6] Installing Python dependencies (first run may take a while)...${NC}"

pip install -r backend/requirements.txt --quiet 2>&1 | grep -i "error" && {
    warn "Full install had issues, retrying without [full] extra..."
    grep -v "marker-pdf\[full\]" backend/requirements.txt | pip install -r /dev/stdin --quiet
    pip install marker-pdf --quiet
}
ok "Python dependencies installed"

# ── Install Node deps ────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[4/6] Installing Node.js dependencies...${NC}"

cd frontend
if [ ! -d "node_modules" ]; then
    npm install --loglevel error
    if [ $? -ne 0 ]; then
        err "npm install failed"
        cd ..
        exit 1
    fi
else
    info "node_modules exists, skipping install"
fi
cd ..
ok "Node.js dependencies installed"

# ── Data dirs ────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[5/6] Creating data directories...${NC}"
mkdir -p data/uploads data/output .omo
ok "Data directories ready"

# ── Start services ───────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[6/6] Starting services...${NC}"
echo ""

cleanup() {
    echo ""
    warn "Stopping services..."
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
    ok "Services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Backend
info "Starting backend on http://localhost:8000 ..."
uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend > .omo/backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    err "Backend failed to start. Check .omo/backend.log"
    exit 1
fi

# Frontend
info "Starting frontend on http://localhost:5173 ..."
cd frontend && npm run dev > ../.omo/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
sleep 3

# ── Done ─────────────────────────────────────────────────────────────
echo ""
ok "════════════════════════════════════════════════════"
ok "Marker UI is running!"
echo ""
info "  Frontend:  ${CYAN}http://localhost:5173${NC}"
info "  Backend:   ${CYAN}http://localhost:8000${NC}"
info "  API Docs:  ${CYAN}http://localhost:8000/docs${NC}"
echo ""
warn "  Press Ctrl+C to stop both services."
ok "════════════════════════════════════════════════════"
echo ""

# Wait
wait
