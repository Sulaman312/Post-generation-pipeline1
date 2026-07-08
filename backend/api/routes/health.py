from flask import Response, jsonify, request

from backend import config, mongo_storage, publish_env
from backend.api.blueprint import api_bp
from backend.publishing import connected_platform_rows


@api_bp.get("/context-files/catalog")
def context_files_catalog():
    """Single source of truth for allowed context filenames + UI labels."""
    return jsonify(files=config.CONTEXT_FILES_CATALOG)


@api_bp.get("/health")
def health():
    mongo = mongo_storage.connection_status()
    return jsonify(
        ok=True,
        service="ContentFlow API",
        persistence="mongodb" if mongo.get("configured") else "filesystem",
        database=mongo.get("database"),
        mongodb=mongo,
        connected_platforms=connected_platform_rows(),
        publish_env=publish_env.active_publish_env(),
        publish_env_availability=publish_env.env_availability(),
    )


@api_bp.get("/api")
def api_root():
    """Browser-friendly hint — the React UI runs on port 3000, not here."""
    accept = (request.headers.get("Accept") or "").lower()
    if "text/html" in accept and "application/json" not in accept:
        return Response(
            """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>ContentFlow API</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 20px;color:#111}
  h1{font-size:1.35rem} code{background:#f3f4f6;padding:2px 6px;border-radius:4px}
  ol{line-height:1.7} a{color:#0d9488}
</style></head><body>
  <h1>ContentFlow API is running</h1>
  <p>This port (<code>8000</code>) is the <strong>backend API</strong> only — not the workspace UI.</p>
  <ol>
    <li>Keep this terminal running: <code>python main.py</code></li>
    <li>In a <strong>second</strong> terminal: <code>cd atlas-ui</code> then <code>npm start</code></li>
    <li>Open the app: <a href="http://localhost:3000">http://localhost:3000</a></li>
  </ol>
  <p>API check: <a href="/clients">/clients</a> (JSON)</p>
</body></html>""",
            mimetype="text/html; charset=utf-8",
        )
    return jsonify(
        ok=True,
        service="ContentFlow API",
        ui="http://localhost:3000 (run npm start in atlas-ui/)",
        health="/health",
        clients="/clients",
    )
