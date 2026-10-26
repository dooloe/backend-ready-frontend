"""Small in-process abuse limits and secret-safe HTTP access logging."""

from collections import OrderedDict, deque
from collections.abc import Callable
import logging
import math
import re
from threading import Lock
from time import monotonic

from starlette.responses import JSONResponse


DEFAULT_RATE_LIMITS = {
    ("POST", "/api/auth/login"): (20, 15 * 60),
    ("POST", "/api/tickets"): (30, 60),
}
MAX_RATE_LIMIT_KEYS = 8192
_PRIVATE_TICKET_PATH = re.compile(r"^(/api/tickets/|/ticket/)[^/?]+")


class SlidingWindowRateLimiter:
    """Track request timestamps per client and operation, bounded in memory."""

    def __init__(self, rules=None, *, clock: Callable[[], float] = monotonic):
        self.rules = dict(DEFAULT_RATE_LIMITS if rules is None else rules)
        self.clock = clock
        self._requests: OrderedDict[tuple[str, str], deque[float]] = OrderedDict()
        self._lock = Lock()

    def retry_after(self, method: str, path: str, client: str) -> int | None:
        rule = self.rules.get((method, path))
        if rule is None:
            return None
        limit, window_seconds = rule
        now = self.clock()
        key = (f"{method} {path}", client)
        with self._lock:
            requests = self._requests.setdefault(key, deque())
            while requests and now - requests[0] >= window_seconds:
                requests.popleft()
            if len(requests) >= limit:
                return max(1, math.ceil(window_seconds - (now - requests[0])))
            requests.append(now)
            self._requests.move_to_end(key)
            if len(self._requests) > MAX_RATE_LIMIT_KEYS:
                self._requests.popitem(last=False)
        return None


class RequestProtectionMiddleware:
    """Rate limit credential exchange/ticket issuance and suppress referrers."""

    def __init__(self, app, limiter: SlidingWindowRateLimiter):
        self.app = app
        self.limiter = limiter

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        client = scope.get("client")
        client_key = client[0] if client else "unknown"
        retry_after = self.limiter.retry_after(
            scope["method"], scope.get("path", ""), client_key,
        )

        async def send_with_referrer_policy(message):
            if message["type"] == "http.response.start":
                headers = [
                    (name, value) for name, value in message.get("headers", [])
                    if name.lower() != b"referrer-policy"
                ]
                headers.append((b"referrer-policy", b"no-referrer"))
                message = {**message, "headers": headers}
            await send(message)

        if retry_after is not None:
            payload = {
                "code": "RATE_LIMITED",
                "message": "Too many requests. Please try again later.",
                "details": None,
                "detail": "Too many requests. Please try again later.",
            }
            response = JSONResponse(
                payload,
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send_with_referrer_policy)
            return

        await self.app(scope, receive, send_with_referrer_policy)


class SensitiveAccessLogFilter(logging.Filter):
    """Remove query strings and private ticket capabilities from Uvicorn logs."""

    @staticmethod
    def safe_path(value: str) -> str:
        path = value.split("?", 1)[0]
        return _PRIVATE_TICKET_PATH.sub(r"\1[redacted]", path)

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str):
            safe_args = list(args)
            safe_args[2] = self.safe_path(safe_args[2])
            record.args = tuple(safe_args)
        return True


def install_access_log_redaction() -> None:
    logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(item, SensitiveAccessLogFilter) for item in logger.filters):
        logger.addFilter(SensitiveAccessLogFilter())
