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

# ── Clean up orphaned processes ──────────────────────────────────────
echo -e "  Checking and cleaning up any orphaned processes on ports 8000 and 5173..."
for port in 8000 5173; do
    if command -v lsof &>/dev/null; then
        pid=$(lsof -t -i:$port 2>/dev/null || true)
        if [ -n "$pid" ]; then
            warn "    Killing process $pid on port $port..."
            kill -9 $pid 2>/dev/null || true
        fi
    elif command -v fuser &>/dev/null; then
        pid=$(fuser $port/tcp 2>/dev/null || true)
        if [ -n "$pid" ]; then
            warn "    Killing process $pid on port $port..."
            kill -9 $pid 2>/dev/null || true
        fi
    fi
done

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
mkdir -p data/uploads data/output
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

find_free_port() {
    local port=$1
    while lsof -ti:$port &>/dev/null; do
        port=$((port + 1))
        if [ $port -ge 65535 ]; then
            err "No free port found for backend."
            exit 1
        fi
    done
    echo $port
}

BACKEND_PORT=$(find_free_port 8000)

if [ "$BACKEND_PORT" -ne 8000 ]; then
    warn "Port 8000 is in use, using port $BACKEND_PORT instead."
fi

export BACKEND_PORT

# Backend
info "Starting backend on http://localhost:$BACKEND_PORT ..."
uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT --app-dir backend &
BACKEND_PID=$!
sleep 3

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    err "Backend failed to start."
    exit 1
fi

# Frontend
info "Starting frontend on http://localhost:5173 ..."
cd frontend && BACKEND_PORT=$BACKEND_PORT npm run dev > /dev/null 2>&1 &
FRONTEND_PID=$!
cd ..
sleep 3

# ── Done ─────────────────────────────────────────────────────────────
echo ""
ok "════════════════════════════════════════════════════"
ok "Marker UI is running!"
echo ""
info "  Frontend:  ${CYAN}http://localhost:5173${NC}"
info "  Backend:   ${CYAN}http://localhost:$BACKEND_PORT${NC}"
info "  API Docs:  ${CYAN}http://localhost:$BACKEND_PORT/docs${NC}"
echo ""
warn "  Press Ctrl+C to stop both services."
ok "════════════════════════════════════════════════════"
echo ""

# Wait
wait
