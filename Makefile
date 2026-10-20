SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

PYTHON ?= python3
NPM ?= npm
VENV ?= backend/.venv
BACKEND_PYTHON := $(VENV)/bin/python
HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 5173
API_URL ?= http://127.0.0.1:$(BACKEND_PORT)
CORS_ORIGINS ?= http://localhost:$(FRONTEND_PORT),http://127.0.0.1:$(FRONTEND_PORT)
DATABASE_URL ?= sqlite:///$(abspath backend/data/kezek.db)
SEED_DEMO_DATA ?= true
export DATABASE_URL SEED_DEMO_DATA

BACKEND_COMMAND = env CORS_ORIGINS="$(CORS_ORIGINS)" "$(BACKEND_PYTHON)" -m uvicorn app.main:app --app-dir backend --host "$(HOST)" --port "$(BACKEND_PORT)" --reload
FRONTEND_COMMAND = env VITE_API_BASE_URL="$(API_URL)" $(NPM) --prefix frontend run dev -- --host "$(HOST)" --port "$(FRONTEND_PORT)" --strictPort

.PHONY: help install install-backend install-frontend dev run backend frontend check-backend test test-backend test-frontend build

help:
	@printf '%s\n' \
	  'make install        Install backend and frontend dependencies' \
	  'make dev            Run both services; Ctrl+C stops both (alias: make run)' \
	  'make backend        Run only the API with automatic reload' \
	  'make frontend       Run only the UI, connected to the real API' \
	  'make test           Run backend and frontend tests' \
	  'make test-backend   Run backend tests only' \
	  'make test-frontend  Run frontend tests only' \
	  'make build          Build the frontend' \
	  '' \
	  'Example: make dev BACKEND_PORT=8001 FRONTEND_PORT=5174' \
	  'Database: set DATABASE_URL (default: backend/data/kezek.db SQLite file)'

install: install-backend install-frontend

install-backend:
	@test -x "$(BACKEND_PYTHON)" || $(PYTHON) -m venv "$(VENV)"
	"$(BACKEND_PYTHON)" -m pip install -r backend/requirements-dev.txt

install-frontend:
	$(NPM) --prefix frontend ci

check-backend:
	@test -x "$(BACKEND_PYTHON)" || { printf '%s\n' 'Backend environment missing. Run make install first.' >&2; exit 1; }

backend: check-backend
	$(BACKEND_COMMAND)

frontend:
	$(FRONTEND_COMMAND)

# Each service gets its own process group, including reload workers. Stop only
# those groups on interruption or failure, leaving unrelated local servers alone.
dev run: check-backend
	@command -v setsid >/dev/null || { printf '%s\n' 'make dev requires setsid (util-linux on Linux/WSL).' >&2; exit 1; }; \
	backend_pid=; frontend_pid=; \
	cleanup() { \
	  trap - EXIT INT TERM; \
	  for pid in "$$backend_pid" "$$frontend_pid"; do \
	    if [[ -n "$$pid" ]]; then kill -TERM -- "-$$pid" 2>/dev/null || true; fi; \
	  done; \
	  wait 2>/dev/null || true; \
	}; \
	trap cleanup EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	printf '%s\n' 'Frontend: http://$(HOST):$(FRONTEND_PORT)' 'API docs: http://$(HOST):$(BACKEND_PORT)/docs' 'Press Ctrl+C to stop both services.'; \
	setsid $(BACKEND_COMMAND) & backend_pid=$$!; \
	setsid $(FRONTEND_COMMAND) & frontend_pid=$$!; \
	wait -n "$$backend_pid" "$$frontend_pid"

test: test-backend test-frontend

test-backend: check-backend
	"$(BACKEND_PYTHON)" -m pytest backend/tests -q

test-frontend:
	$(NPM) --prefix frontend test

build:
	$(NPM) --prefix frontend run build
