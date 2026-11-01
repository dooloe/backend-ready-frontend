"""ASGI entry point with a DATABASE_URL-configured SQLAlchemy store."""

from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .routers import admin, auth, public, staff
from .settings import Settings
from .errors import SafeErrorBoundary, install_error_handlers
from .security import (
    RequestProtectionMiddleware,
    SlidingWindowRateLimiter,
    install_access_log_redaction,
)
from .store import DatabaseStore


def create_app(store: DatabaseStore | None = None, *, database_url: str | None = None,
               rate_limiter: SlidingWindowRateLimiter | None = None):
    if store is not None and database_url is not None:
        raise ValueError("Provide a store or a database_url, not both")

    origins: list[str] = []

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        settings = Settings.from_environment(database_url)
        application.state.settings = settings
        origins[:] = settings.cors_origins
        # Connect at startup, not module import. Tests can safely import the app
        # without opening or modifying the configured development database.
        application.state.store = store if store is not None else DatabaseStore(
            settings.database_url, seed_demo=settings.seed_demo,
        )
        try:
            # Provision sample organizations even when this database predates
            # the directory. The seed only adds missing records.
            if store is None and settings.seed_demo and settings.environment in {"development", "test"}:
                from seed_directory import seed

                seed(application.state.store)
            yield
        finally:
            if store is None:
                application.state.store.close()

    application = FastAPI(title="Kezek API", version="0.3.0", lifespan=lifespan)
    application.add_middleware(
        RequestProtectionMiddleware,
        limiter=rate_limiter or SlidingWindowRateLimiter(),
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-CSRF-Token"],
        allow_credentials=True,
    )

    install_error_handlers(application)

    for router in (public.router, auth.router, staff.router, admin.router):
        application.include_router(router)

    frontend_static_dir = os.getenv("FRONTEND_STATIC_DIR")
    if frontend_static_dir:
        static_root = Path(frontend_static_dir).resolve()
        shell_path = static_root / "_shell.html"

        @application.get("/{frontend_path:path}", include_in_schema=False)
        def serve_frontend(frontend_path: str, request: Request):
            if frontend_path == "api" or frontend_path.startswith("api/"):
                raise HTTPException(404, "Not found")

            file_path = (static_root / frontend_path).resolve()
            if file_path.is_relative_to(static_root) and file_path.is_file():
                headers = (
                    {"Cache-Control": "public, max-age=31536000, immutable"}
                    if frontend_path.startswith("assets/") else None
                )
                return FileResponse(file_path, headers=headers)

            if "text/html" not in request.headers.get("accept", ""):
                raise HTTPException(404, "Not found")
            if not shell_path.is_file():
                raise HTTPException(503, "Frontend shell is unavailable")
            return FileResponse(shell_path)

    install_access_log_redaction()
    return SafeErrorBoundary(application)


app = create_app()
