"""Flask application factory."""

import logging
import os
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from backend import auth_store, mongo_storage
from backend.api.routes import api_bp
from backend.logging_config import configure_logging, register_request_logging
from backend.schedule_publisher import start_schedule_publisher

logger = logging.getLogger(__name__)

def _request_can_change_workspace() -> bool:
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        return True
    if request.method != "GET":
        return False
    # These legacy GET handlers may repair/cache an artifact on first read.
    return (
        "/artifacts/" in request.path
        or request.path.endswith("/images/template")
    )


def _cors_origins() -> list[str]:
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]


def create_app() -> Flask:
    configure_logging(level=logging.INFO)
    logger.info("ContentFlow backend starting")

    ui_build_dir = Path(__file__).resolve().parent.parent / "atlas-ui" / "build"
    app = Flask(
        __name__,
        static_folder=str(ui_build_dir / "static"),
        static_url_path="/static",
    )
    from backend import config as app_config

    app.secret_key = app_config.AUTH_SECRET_KEY
    mongo_storage.initialize_runtime_cache()
    if app_config.AUTH_ENABLED:
        try:
            auth_store.ensure_default_user()
        except Exception:
            logger.exception("Could not seed default app login user")
    start_schedule_publisher()

    # Dev UI runs on :3001 while API is on :8001 — credentials require explicit origins (not "*").
    CORS(
        app,
        resources={
            r"/*": {
                "origins": _cors_origins(),
                "methods": ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": "*",
                "supports_credentials": True,
                "max_age": 86400,
            }
        },
    )
    register_request_logging(app)
    app.register_blueprint(api_bp)

    @app.after_request
    def persist_workspace_mutations(response):
        if not mongo_storage.enabled() or not _request_can_change_workspace():
            return response
        if not mongo_storage.hydration_complete():
            logger.error(
                "Refusing MongoDB sync after %s %s: cache not hydrated",
                request.method,
                request.path,
            )
            if response.status_code < 400:
                return jsonify(
                    detail=(
                        "Workspace data is not available because MongoDB hydration "
                        "did not complete. Restart the backend after MongoDB is reachable."
                    )
                ), 503
            return response
        try:
            mongo_storage.sync_cache()
        except Exception:
            logger.exception(
                "MongoDB persistence failed after %s %s",
                request.method,
                request.path,
            )
            if response.status_code < 400:
                return jsonify(
                    detail=(
                        "The operation completed locally but could not be persisted "
                        "to MongoDB. Check the service logs."
                    )
                ), 503
        return response

    @app.get("/")
    def serve_ui_root():
        if (ui_build_dir / "index.html").is_file():
            return send_from_directory(ui_build_dir, "index.html")
        return {
            "ok": True,
            "service": "ContentFlow API",
            "ui": "Run `cd atlas-ui && npm start` in development.",
            "health": "/health",
            "clients": "/clients",
        }

    @app.get("/<path:path>")
    def serve_ui_path(path: str):
        # Unmatched API paths must not return the SPA shell (breaks JSON clients).
        if (
            path == "health"
            or path.startswith("clients/")
            or path.startswith("context-files/")
            or path.startswith("auth/")
        ):
            return jsonify(detail="Not found"), 404
        target = ui_build_dir / path
        if target.is_file():
            return send_from_directory(ui_build_dir, path)
        if (ui_build_dir / "index.html").is_file():
            return send_from_directory(ui_build_dir, "index.html")
        return {"error": "Not found"}, 404

    return app
