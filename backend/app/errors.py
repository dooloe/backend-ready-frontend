"""Safe structured errors with a legacy detail alias for the existing client."""

import logging

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.exceptions import HTTPException

logger = logging.getLogger(__name__)


def envelope(status: int, code: str, message: str, details=None, headers=None):
    return JSONResponse(status_code=status, headers=headers,
                        content={"code": code, "message": message, "details": details, "detail": message})


def install_error_handlers(application):
    @application.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException):
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        code = {401: "NOT_AUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND",
                405: "METHOD_NOT_ALLOWED", 409: "CONFLICT", 422: "VALIDATION_ERROR",
                429: "RATE_LIMITED", 503: "DATABASE_BUSY"}.get(exc.status_code, "HTTP_ERROR")
        if exc.status_code == 409:
            code = ("QUEUE_CLOSED" if message == "This queue is closed" else
                    "IDEMPOTENCY_CONFLICT" if message.startswith("Idempotency key conflicts") else
                    "TOKEN_REUSED" if message.startswith("Ticket access token has") else
                    "COUNTER_BUSY" if message == "Finish the current ticket first" else
                    "COUNTER_INACTIVE" if message == "Counter is inactive" else
                    "IDENTITY_CONFLICT" if message == "Username already taken" else
                    "INVALID_STATE" if message.startswith(("Ticket is ", "Only waiting tickets")) else code)
        if exc.status_code >= 500 and exc.status_code != 503:
            message = "Internal server error"
        return envelope(exc.status_code, code, message, headers=exc.headers)

    @application.exception_handler(RequestValidationError)
    @application.exception_handler(ValidationError)
    async def validation_error(_request: Request, exc):
        # Never serialize input, ctx, raw exception text, or arbitrary JSON keys.
        known = {"body", "query", "path", "username", "password", "customerName", "serviceId",
                 "counterId", "name", "prefix", "description", "isOpen", "avgServiceMinutes",
                 "staffId", "serviceIds", "isActive", "role"}
        fields = sorted({".".join(str(part) for part in error["loc"] if part in known)
                         for error in exc.errors()} - {""})
        return envelope(422, "VALIDATION_ERROR", "Invalid request", {"fields": fields})

    @application.exception_handler(Exception)
    async def unexpected_error(_request: Request, exc: Exception):
        # The outer ASGI boundary logs only the exception class and consumes
        # Starlette's post-response re-raise; never write traceback/input values.
        return envelope(500, "INTERNAL_ERROR", "Internal server error")


class SafeErrorBoundary:
    """Consume Starlette's post-response exception re-raise without server tracebacks."""

    def __init__(self, application):
        self.application = application

    def __getattr__(self, name):
        return getattr(self.application, name)

    async def __call__(self, scope, receive, send):
        response_started = False

        async def tracked_send(message):
            nonlocal response_started
            await send(message)
            if message["type"] == "http.response.start":
                response_started = True

        try:
            await self.application(scope, receive, tracked_send)
        except Exception as exc:
            if scope["type"] != "http":
                raise
            # Starlette normally sends the custom 500 response, then re-raises
            # so Uvicorn logs its traceback. Consume that re-raise after send.
            logger.error("API request failed (%s)", type(exc).__name__)
            if not response_started:
                await envelope(500, "INTERNAL_ERROR", "Internal server error")(scope, receive, send)
