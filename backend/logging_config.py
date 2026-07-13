"""Stdout logging + per-request ID on Flask requests."""

from __future__ import annotations

import logging
import sys
import time
import uuid

from flask import Flask, g, has_request_context, request


class _RequestAwareFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        if has_request_context():
            setattr(record, "rid", getattr(g, "request_id", "--------")[:8])
            setattr(record, "path", getattr(request, "path", "?")[:64])
            setattr(record, "method", getattr(request, "method", "?"))
        else:
            setattr(record, "rid", "--------")
            setattr(record, "path", "---")
            setattr(record, "method", "--")
        return super().format(record)


_LOG_CONFIGURED = False


def configure_logging(level: int = logging.INFO) -> None:
    global _LOG_CONFIGURED
    if _LOG_CONFIGURED:
        return
    root = logging.getLogger()
    root.setLevel(level)
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(
        _RequestAwareFormatter(
            "%(asctime)s %(levelname)s %(rid)s %(method)s %(path)s %(name)s - %(message)s"
        )
    )
    root.addHandler(h)
    _LOG_CONFIGURED = True


def register_request_logging(app: Flask) -> None:
    @app.before_request
    def _set_request_id() -> None:
        g.request_id = uuid.uuid4().hex
        g.request_started_at = time.perf_counter()

    @app.after_request
    def _access_log(resp):
        started_at = getattr(g, "request_started_at", None)
        duration_ms = (
            (time.perf_counter() - started_at) * 1000
            if started_at is not None
            else 0
        )
        logging.getLogger("http").info(
            "%s %.1fms -> %s",
            resp.status_code,
            duration_ms,
            getattr(request, "full_path", ""),
        )
        resp.headers.setdefault("X-Request-ID", getattr(g, "request_id", ""))
        return resp
