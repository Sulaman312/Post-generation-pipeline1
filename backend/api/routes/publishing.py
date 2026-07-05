from flask import jsonify, request

from backend.api.blueprint import api_bp
from backend.api.helpers import load_manifest, reject_client, reject_run_id
from backend import publish_env
from backend.publish_runner import publish_selected_platforms
from backend.publishing import connected_platform_rows
from backend.run_record import PLATFORMS, normalize_platforms


@api_bp.get("/publishing/settings")
def get_publish_settings():
    return jsonify(publish_env.settings_payload())


@api_bp.put("/publishing/settings")
def put_publish_settings():
    body = request.get_json(silent=True) or {}
    env = body.get("env")
    if not env:
        return jsonify(detail="env is required (test or live)"), 400
    try:
        publish_env.set_active_publish_env(str(env))
    except ValueError as exc:
        return jsonify(detail=str(exc)), 400
    return jsonify(publish_env.settings_payload())


@api_bp.get("/publishing/connected-platforms")
def list_connected_platforms():
    return jsonify(
        env=publish_env.active_publish_env(),
        platforms=connected_platform_rows(),
    )


@api_bp.post("/clients/<client_id>/runs/<run_id>/publish")
def publish_run_platforms(client_id: str, run_id: str):
    """Publish one or more platforms immediately. Body: ``{"platforms": ["linkedin"]}`` (optional)."""
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run

    manifest = load_manifest(client_id, run_id)
    if not manifest:
        return jsonify(detail="run not found"), 404

    body = request.get_json(silent=True) or {}
    raw_platforms = body.get("platforms")
    platforms = None
    if raw_platforms is not None:
        if not isinstance(raw_platforms, list):
            return jsonify(detail="platforms must be a list"), 400
        platforms = normalize_platforms(raw_platforms, allow_empty=True)
        invalid = [p for p in platforms if p not in PLATFORMS]
        if invalid:
            return jsonify(detail=f"Unknown platforms: {', '.join(invalid)}"), 400

    try:
        record = publish_selected_platforms(
            client_id,
            run_id,
            platforms,
            mark_publish_step_done=True,
        )
    except ValueError as exc:
        return jsonify(detail=str(exc)), 400
    except Exception as exc:
        return jsonify(detail=str(exc)), 500

    updated = load_manifest(client_id, run_id)
    return jsonify(
        run_id=run_id,
        client_id=client_id,
        **record,
        statuses=(updated or {}).get("statuses") or {},
    )
