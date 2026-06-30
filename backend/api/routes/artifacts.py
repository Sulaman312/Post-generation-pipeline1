from flask import jsonify, request

from backend import artifacts
from backend.api.blueprint import api_bp
from backend.api.helpers import reject_client, reject_run_id


@api_bp.get("/clients/<client_id>/runs/<run_id>/artifacts/<step_name>")
def get_artifact(client_id: str, run_id: str, step_name: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    try:
        text = artifacts.load_artifact(client_id, run_id, step_name)
    except FileNotFoundError:
        return jsonify(content="")
    return jsonify(content=text)


@api_bp.put("/clients/<client_id>/runs/<run_id>/artifacts/<step_name>")
def put_artifact(client_id: str, run_id: str, step_name: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run

    body = request.get_json(silent=True) or {}
    content = body.get("content", "")
    artifacts.save_artifact(client_id, run_id, step_name, content)
    return jsonify(saved=True)
