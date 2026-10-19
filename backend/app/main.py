"""ASGI entry point. Run one worker: the demo store is deliberately in memory."""

import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routers import admin, auth, public, staff
from .store import MemoryStore


def create_app(store: MemoryStore | None = None) -> FastAPI:
    application = FastAPI(title="Kezek API", version="0.2.0")
    application.state.store = store if store is not None else MemoryStore()
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
