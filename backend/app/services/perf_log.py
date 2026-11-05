"""Structured performance logging.

Two layers, both written as ``key=value`` lines (grep-able, no JSON parsing needed):

1. ``RequestTimingMiddleware`` – one line per API request on logger ``app.perf``::

       [REQ] method=GET path=/api/checkins status=200 ms=33.1 queries=8 ip=192.168.1.160 ua=Chrome

   Anything slower than ``SLOW_REQUEST_MS`` is logged at WARNING with ``slow=1`` so it stands out.

2. ``StepTimer`` – per-step breakdown inside heavy endpoints::

       [PERF] op=checkins.list page=1 per_page=25 filters=... steps=member_query:12.0ms/972rows,names:1.9ms,... total=33ms queries=8

The SQL query count is tracked per request through a ``ContextVar`` bumped by a
SQLAlchemy ``before_cursor_execute`` listener on the Engine class, so it covers every
engine in the process (prod Postgres and the sqlite test engine alike).
"""
from __future__ import annotations

import logging
import time
from contextvars import ContextVar
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import Engine
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

perf_logger = logging.getLogger("app.perf")

SLOW_REQUEST_MS = 1000.0
SLOW_STEP_MS = 500.0

# The counter lives in a one-element list so that a child task (Starlette's
# BaseHTTPMiddleware runs the endpoint in a separate task with a *copy* of the context)
# mutates the same object the middleware is looking at.
_query_count: ContextVar[list[int]] = ContextVar("db_query_count")


def _holder() -> list[int]:
    try:
        return _query_count.get()
    except LookupError:
        holder = [0]
        _query_count.set(holder)
        return holder


@event.listens_for(Engine, "before_cursor_execute")
def _count_query(conn, cursor, statement, parameters, context, executemany):  # noqa: D401
    _holder()[0] += 1


def reset_query_count() -> None:
    _query_count.set([0])


def query_count() -> int:
    return _holder()[0]


def kv(**fields: Any) -> str:
    """Render fields as ``key=value`` pairs; strings with spaces are quoted."""
    parts = []
    for k, v in fields.items():
        if v is None:
            continue
        if isinstance(v, float):
            v = f"{v:.1f}"
        s = str(v)
        if " " in s or "=" in s:
            s = '"' + s.replace('"', "'") + '"'
        parts.append(f"{k}={s}")
    return " ".join(parts)


class StepTimer:
    """Collects named step timings for one operation and logs a single summary line.

    Usage::

        with StepTimer("checkins.list", page=page, per_page=per_page) as t:
            rows = query.all()
            t.step("member_query", rows=len(rows))
            ...
    """

    def __init__(self, op: str, logger: logging.Logger | None = None, **ctx: Any):
        self.op = op
        self.logger = logger or perf_logger
        self.ctx = ctx
        self.steps: list[str] = []
        self._t0 = self._last = time.perf_counter()
        self._q0 = query_count()

    def __enter__(self) -> "StepTimer":
        return self

    def step(self, name: str, **info: Any) -> None:
        now = time.perf_counter()
        ms = (now - self._last) * 1000
        self._last = now
        extra = "".join(f"/{v}{k}" for k, v in info.items() if v is not None)
        self.steps.append(f"{name}:{ms:.1f}ms{extra}")
        if ms >= SLOW_STEP_MS:
            self.logger.warning("[PERF] slow step %s", kv(op=self.op, step=name, ms=ms, **info))

    def note(self, **ctx: Any) -> None:
        """Add context (e.g. result totals) to the summary line."""
        self.ctx.update(ctx)

    def __exit__(self, exc_type, exc, tb) -> None:
        total_ms = (time.perf_counter() - self._t0) * 1000
        queries = query_count() - self._q0
        line = "[PERF] " + kv(op=self.op, **self.ctx) + f" steps={','.join(self.steps) or '-'} " + kv(
            total_ms=total_ms, queries=queries, error=exc_type.__name__ if exc_type else None
        )
        if exc_type is not None or total_ms >= SLOW_REQUEST_MS:
            self.logger.warning(line)
        else:
            self.logger.info(line)


def client_ip(request: Request) -> str:
    """Real client address: first X-Forwarded-For hop (set by our nginx), else the socket peer."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real
    return request.client.host if request.client else "-"


def _short_ua(ua: str | None) -> str | None:
    if not ua:
        return None
    for name in ("Edg", "Chrome", "Firefox", "Safari", "python-httpx", "curl", "testclient"):
        if name in ua:
            return name
    return ua.split(" ")[0][:20]


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Logs one structured line per request with wall time and SQL query count."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api") or path == "/api/health":
            return await call_next(request)
        reset_query_count()
        t0 = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            ms = (time.perf_counter() - t0) * 1000
            fields = dict(
                method=request.method,
                path=path,
                query=str(request.url.query) or None,
                status=status,
                ms=ms,
                queries=query_count(),
                ip=client_ip(request),
                ua=_short_ua(request.headers.get("user-agent")),
            )
            if ms >= SLOW_REQUEST_MS or status >= 500:
                perf_logger.warning("[REQ] " + kv(slow=1 if ms >= SLOW_REQUEST_MS else None, **fields))
            else:
                perf_logger.info("[REQ] " + kv(**fields))
