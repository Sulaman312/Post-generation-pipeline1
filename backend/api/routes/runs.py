import json
import logging
from datetime import datetime
from pathlib import Path

from flask import jsonify, request, send_from_directory

from backend import artifacts, config, step_jobs
from backend.api.blueprint import api_bp
from backend.api.helpers import load_manifest, reject_client, reject_run_id
from backend.api.manifest_persist import save_manifest_from_loaded
from backend.pipelines import get_pipeline, resolve_pipeline_id
from backend.publishing import connected_platforms
from backend.run_location import location_from_manifest, normalize_run_location
from backend.run_record import (
    default_run_record_fields,
    normalize_platforms,
    normalize_run_record_fields,
    normalize_scheduled_at,
    run_record_api_fields,
)
from backend.run_schedule import update_run_schedule
from backend.run_summaries import run_summary_from_manifest

logger = logging.getLogger(__name__)


@api_bp.get("/clients/<client_id>/runs")
def list_runs(client_id: str):
    runs_root = Path(config.CLIENTS_DIR) / client_id / "runs"
    if not runs_root.is_dir():
        return jsonify(runs=[])

    rows: list[dict] = []
    for p in sorted(
        runs_root.iterdir(),
        key=lambda x: x.name,
        reverse=True,
    ):
        if not p.is_dir():
            continue
        run_id = p.name
        manifest_path = p / "run_manifest.json"
        if manifest_path.is_file():
            try:
                data = json.loads(manifest_path.read_text(encoding="utf-8"))
                rows.append(run_summary_from_manifest(data, run_id))
            except json.JSONDecodeError:
                rows.append(
                    run_summary_from_manifest(
                        {"topic": "untitled", "statuses": {}, "timestamp": ""},
                        run_id,
                    )
                )
        else:
            rows.append(
                run_summary_from_manifest(
                    {
                        "topic": "untitled",
                        "statuses": {},
                        "timestamp": "",
                        "pipeline_id": "social_media",
                    },
                    run_id,
                )
            )

    return jsonify(runs=rows)


@api_bp.post("/clients/<client_id>/runs")
def create_run(client_id: str):
    body = request.get_json(silent=True) or {}
    from backend import social_input
    from backend.client_location import default_run_location
    from backend.context_summary import generate_context_summary

    manual = social_input.sanitize_social_manual_inputs(body.get("manual_inputs"))
    topic = (body.get("topic") or "").strip()
    if manual:
        built = social_input.topic_from_social(manual)
        if built:
            topic = built
    if not topic:
        return jsonify(
            detail="Post idea is required (describe your idea in the paragraph field)"
        ), 400
    display_topic = topic
    context_summary = generate_context_summary(client_id)
    wc_target = None
    pipeline_id = "social_media"

    base = Path(config.CLIENTS_DIR) / client_id
    (base / "context").mkdir(parents=True, exist_ok=True)
    (base / "runs").mkdir(parents=True, exist_ok=True)

    run_id = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    pipeline = get_pipeline(pipeline_id)
    statuses = {name: "pending" for name in pipeline.step_order}
    record = normalize_run_record_fields(
        {
            **default_run_record_fields(),
            "platforms": normalize_platforms(
                body.get("platforms") or connected_platforms(), allow_empty=True
            ),
            "scheduled_at": normalize_scheduled_at(body.get("scheduled_at")),
            "status": body.get("status") or "draft",
        }
    )
    loc_defaults = default_run_location(client_id)
    run_location = normalize_run_location(
        body.get("use_location") if "use_location" in body else None,
        body.get("location_value") if "location_value" in body else None,
        fallback_use=bool(loc_defaults["use_location"]),
        fallback_value=str(loc_defaults.get("location_value") or ""),
    )
    artifacts.save_run_manifest(
        client_id,
        run_id,
        display_topic,
        statuses,
        pipeline_id=pipeline_id,
        manual_inputs=manual,
        target_word_count=wc_target,
        context_summary=context_summary,
        post_status=record["status"],
        platforms=record["platforms"],
        scheduled_at=record["scheduled_at"],
        platform_schedules=record["platform_schedules"],
        published_results=record["published_results"],
        use_location=run_location["use_location"],
        location_value=str(run_location["location_value"]),
    )

    logo_b64 = body.get("logo_base64")
    logo_name = str(body.get("logo_filename") or "").strip()
    if logo_b64:
        try:
            stored = artifacts.save_run_logo_from_base64(
                client_id, run_id, str(logo_b64), logo_name
            )
            artifacts.set_run_logo_file(client_id, run_id, stored)
        except ValueError as e:
            return jsonify(detail=str(e)), 400

    return jsonify(
        run_id=run_id,
        client_id=client_id,
        topic=display_topic,
        pipeline_id=pipeline_id,
    )


def _cancel_pipeline_step(client_id: str, run_id: str, step_name: str):
    """Reset a step stuck in ``running`` or ``error`` back to ``pending``."""
    manifest = load_manifest(client_id, run_id)
    pipeline_id = resolve_pipeline_id(manifest) if manifest else "social_media"
    pipeline = get_pipeline(pipeline_id)
    if step_name not in pipeline.step_order:
        return jsonify(detail=f"Unknown step_name: {step_name!r}"), 400

    if not manifest:
        return jsonify(detail="run not found"), 404

    topic = manifest.get("topic") or ""
    statuses = dict(manifest.get("statuses") or {})
    for name in pipeline.step_order:
        statuses.setdefault(name, "pending")

    st = statuses.get(step_name, "pending")
    if st not in ("running", "error"):
        return jsonify(detail="Step is not running or in error"), 400

    statuses[step_name] = "pending"
    timings = dict(manifest.get("step_timings") or {})
    timings.pop(step_name, None)
    errors = dict(manifest.get("step_errors") or {})
    errors.pop(step_name, None)
    artifacts.save_run_manifest(
        client_id,
        run_id,
        topic,
        statuses,
        step_timings=timings,
        step_errors=errors,
    )
    return jsonify(cancelled=True, step_name=step_name)


@api_bp.patch("/clients/<client_id>/runs/<run_id>")
def patch_run(client_id: str, run_id: str):
    """Body: ``{"action": "archive"|"unarchive"|"delete"|"cancel_step", "step_name": "..."}``."""
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run

    body = request.get_json(silent=True) or {}
    action = (body.get("action") or "").strip().lower()

    if "use_location" in body or "location_value" in body:
        manifest = load_manifest(client_id, run_id)
        if not manifest:
            return jsonify(detail="run not found"), 404
        run_location = normalize_run_location(
            body.get("use_location") if "use_location" in body else None,
            body.get("location_value") if "location_value" in body else None,
            fallback_use=bool(manifest.get("use_location")),
            fallback_value=str(manifest.get("location_value") or ""),
        )
        save_manifest_from_loaded(
            client_id,
            run_id,
            manifest,
            use_location=run_location["use_location"],
            location_value=str(run_location["location_value"]),
        )
        updated = load_manifest(client_id, run_id)
        return jsonify(
            run_id=run_id,
            client_id=client_id,
            **run_location,
            **run_record_api_fields(updated),
        )

    if "platforms" in body:
        manifest = load_manifest(client_id, run_id)
        if not manifest:
            return jsonify(detail="run not found"), 404
        platforms = normalize_platforms(body.get("platforms"), allow_empty=True)
        save_manifest_from_loaded(
            client_id,
            run_id,
            manifest,
            platforms=platforms,
        )
        updated = load_manifest(client_id, run_id)
        record = run_record_api_fields(updated)
        return jsonify(run_id=run_id, client_id=client_id, **record)

    if "platform_schedules" in body:
        payload, code = update_run_schedule(
            client_id, run_id, raw_platform_schedules=body.get("platform_schedules")
        )
        return jsonify(**payload), code

    if "scheduled_at" in body:
        payload, code = update_run_schedule(
            client_id, run_id, raw_scheduled=body.get("scheduled_at")
        )
        return jsonify(**payload), code

    if action == "archive":
        if not artifacts.set_run_archived(client_id, run_id, archived=True):
            return jsonify(detail="run not found"), 404
        return jsonify(archived=True, run_id=run_id)
    if action == "unarchive":
        if not artifacts.set_run_archived(client_id, run_id, archived=False):
            return jsonify(detail="run not found"), 404
        return jsonify(archived=False, run_id=run_id)
    if action == "delete":
        if step_jobs.has_active_job(client_id, run_id):
            return jsonify(detail="Wait for the background step to finish before deleting this run"), 409
        if not artifacts.delete_run(client_id, run_id):
            return jsonify(detail="run not found"), 404
        return jsonify(deleted=True, run_id=run_id)
    if action == "cancel_step":
        step_name = (body.get("step_name") or "").strip()
        if not step_name:
            return jsonify(detail="step_name is required for cancel_step"), 400
        return _cancel_pipeline_step(client_id, run_id, step_name)

    if action == "update_manual_inputs":
        manifest = load_manifest(client_id, run_id)
        if not manifest:
            return jsonify(detail="run not found"), 404
        from backend import social_input

        manual = social_input.sanitize_social_manual_inputs(body.get("manual_inputs"))
        if not manual or not (manual.get("paragraph") or "").strip():
            return jsonify(detail="Post idea (paragraph) is required"), 400
        topic = social_input.topic_from_social(manual)
        if not topic:
            return jsonify(detail="Post idea (paragraph) is required"), 400
        statuses = manifest.get("statuses") or {}
        artifacts.save_run_manifest(
            client_id,
            run_id,
            topic,
            statuses,
            pipeline_id="social_media",
            manual_inputs=manual,
            step_timings=manifest.get("step_timings"),
            context_summary=manifest.get("context_summary"),
        )
        return jsonify(
            run_id=run_id,
            topic=topic,
            manual_inputs=manual,
        )

    return jsonify(
        detail="action must be archive, unarchive, delete, cancel_step, or update_manual_inputs; "
        "or send platforms or scheduled_at in the body",
    ), 400


@api_bp.post("/clients/<client_id>/runs/<run_id>/schedule")
def schedule_run(client_id: str, run_id: str):
    """Schedule publish times. Body: ``{"scheduled_at": "<ISO>"}`` or ``{"platform_schedules": {...}}``."""
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run

    body = request.get_json(silent=True) or {}
    if "platform_schedules" in body:
        payload, code = update_run_schedule(
            client_id, run_id, raw_platform_schedules=body.get("platform_schedules")
        )
        return jsonify(**payload), code
    if "scheduled_at" not in body:
        return jsonify(detail="scheduled_at or platform_schedules is required"), 400

    payload, code = update_run_schedule(
        client_id, run_id, raw_scheduled=body.get("scheduled_at")
    )
    return jsonify(**payload), code


@api_bp.post("/clients/<client_id>/runs/<run_id>/archive")
def archive_run(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    if not artifacts.set_run_archived(client_id, run_id, archived=True):
        return jsonify(detail="run not found"), 404
    return jsonify(archived=True, run_id=run_id)


@api_bp.post("/clients/<client_id>/runs/<run_id>/unarchive")
def unarchive_run(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    if not artifacts.set_run_archived(client_id, run_id, archived=False):
        return jsonify(detail="run not found"), 404
    return jsonify(archived=False, run_id=run_id)


@api_bp.delete("/clients/<client_id>/runs/<run_id>")
def delete_run(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    if step_jobs.has_active_job(client_id, run_id):
        return jsonify(detail="Wait for the background step to finish before deleting this run"), 409
    if not artifacts.delete_run(client_id, run_id):
        return jsonify(detail="run not found"), 404
    return jsonify(deleted=True, run_id=run_id)


@api_bp.get("/clients/<client_id>/runs/<run_id>")
def get_run(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    run_dir = Path(config.CLIENTS_DIR) / client_id / "runs" / run_id
    if not run_dir.is_dir():
        return jsonify(detail="run not found"), 404
    data = load_manifest(client_id, run_id)
    display_timings = artifacts.step_timings_for_display(client_id, run_id, data)
    wc = data.get("target_word_count")

    return jsonify(
        run_id=run_id,
        client_id=client_id,
        pipeline_id=resolve_pipeline_id(data),
        topic=data.get("topic") or "untitled",
        statuses=data.get("statuses") or {},
        timestamp=data.get("timestamp") or "",
        manual_inputs=data.get("manual_inputs"),
        target_word_count=wc,
        logo_file=data.get("logo_file"),
        step_timings=display_timings,
        step_errors=data.get("step_errors") or {},
        **location_from_manifest(data),
        **run_record_api_fields(data),
    )


@api_bp.get("/clients/<client_id>/runs/<run_id>/logo")
def get_run_logo(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    data = load_manifest(client_id, run_id)
    logo_file = data.get("logo_file") if data else None
    if not isinstance(logo_file, str) or not logo_file.strip():
        return jsonify(detail="no logo"), 404
    logo_file = logo_file.strip()
    if ".." in logo_file or "/" in logo_file or "\\" in logo_file:
        return jsonify(detail="invalid logo path"), 400
    run_dir = Path(config.CLIENTS_DIR) / client_id / "runs" / run_id
    path = run_dir / logo_file
    if not path.is_file():
        return jsonify(detail="logo not found"), 404
    return send_from_directory(run_dir, logo_file)


@api_bp.post("/clients/<client_id>/runs/<run_id>/steps/<step_name>")
def run_single_step(client_id: str, run_id: str, step_name: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    body = request.get_json(silent=True) or {}
    previous_artifact = (body.get("previous_artifact") or "").strip()

    manifest = load_manifest(client_id, run_id)
    pipeline_id = resolve_pipeline_id(manifest) if manifest else "social_media"
    try:
        pipeline = get_pipeline(pipeline_id)
    except ValueError as e:
        return jsonify(detail=str(e)), 400

    runner_fn = pipeline.step_runners.get(step_name)
    if step_name == "image_template":
        import importlib

        from backend import image_overlay, image_templates, social_pipeline, social_steps

        importlib.reload(image_overlay)
        importlib.reload(image_templates)
        importlib.reload(social_steps)
        importlib.reload(social_pipeline)
        runner_fn = social_pipeline.STEP_RUNNERS.get(step_name)
    if runner_fn is None:
        return jsonify(detail=f"Unknown step_name: {step_name!r}"), 400

    topic = manifest.get("topic") or ""
    if not previous_artifact and step_name == "client_profile_topic":
        previous_artifact = topic
    if not step_jobs.start_step_job_if_available(
        client_id=client_id,
        run_id=run_id,
        step_name=step_name,
        previous_artifact=previous_artifact,
        runner_fn=runner_fn,
        pipeline_step_order=pipeline.step_order,
    ):
        return jsonify(detail="This step is already running"), 409
    return jsonify(accepted=True, step_name=step_name, status="running"), 202


@api_bp.post("/clients/<client_id>/runs/<run_id>/final-output/repair")
def repair_final_output(client_id: str, run_id: str):
    """Repair final_output: FAQ, external links, optional full trim (query ?full=1)."""
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    from backend import final_output_enforce

    try:
        text = artifacts.load_artifact(client_id, run_id, "final_output")
    except FileNotFoundError:
        return jsonify(error="final_output artifact not found"), 404
    full = request.args.get("full", "").lower() in ("1", "true", "yes")
    repaired = final_output_enforce.enforce_final_output(
        text, client_id, run_id, allow_llm_repair=full
    )
    if repaired != text:
        artifacts.save_artifact(client_id, run_id, "final_output", repaired)
    return jsonify(content=repaired)


@api_bp.post("/clients/<client_id>/runs/<run_id>/steps/<step_name>/cancel")
def cancel_step(client_id: str, run_id: str, step_name: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    return _cancel_pipeline_step(client_id, run_id, step_name)
