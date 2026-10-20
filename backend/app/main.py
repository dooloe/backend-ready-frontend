"""ASGI entry point with a DATABASE_URL-configured SQLAlchemy store."""

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routers import admin, auth, public, staff
from .database import configured_database_url, configured_demo_seed
from .store import DatabaseStore


def create_app(store: DatabaseStore | None = None, *, database_url: str | None = None) -> FastAPI:
    if store is not None and database_url is not None:
        raise ValueError("Provide a store or a database_url, not both")

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        # Connect at startup, not module import. Tests can safely import the app
        # without opening or modifying the configured development database.
        application.state.store = store if store is not None else DatabaseStore(
            configured_database_url() if database_url is None else database_url,
            seed_demo=configured_demo_seed(),
        )
        try:
            yield
        finally:
            if store is None:
                application.state.store.close()

    application = FastAPI(title="Kezek API", version="0.3.0", lifespan=lifespan)
    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[value.strip() for value in origins.split(",") if value.strip()],
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        # http.ts displays a string detail, not FastAPI's default error array.
        message = "; ".join(error["msg"] for error in exc.errors())
        return JSONResponse(status_code=422, content={"detail": message})

    for router in (public.router, auth.router, staff.router, admin.router):
        application.include_router(router)
    return application


app = create_app()
