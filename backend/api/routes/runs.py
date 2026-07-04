import json
import logging
import threading
from datetime import datetime
from pathlib import Path

from flask import jsonify, request, send_from_directory

from backend import artifacts
from backend import config
from backend import pipeline_flow
from backend import mongo_storage
from backend.api.blueprint import api_bp
from backend.api.helpers import load_manifest, reject_client, reject_run_id
from backend.pipelines import get_pipeline, resolve_pipeline_id
from backend.publishing import connected_platforms
from backend.run_record import (
    PLATFORMS,
    default_run_record_fields,
    earliest_scheduled_at,
    normalize_platforms,
    normalize_platform_schedules,
    normalize_run_record_fields,
    normalize_scheduled_at,
    run_record_api_fields,
)

logger = logging.getLogger(__name__)

_STEP_JOBS: dict[tuple[str, str, str], threading.Thread] = {}
_STEP_JOBS_LOCK = threading.Lock()


def _run_summary_from_manifest(data: dict, run_id: str) -> dict:
    manual = data.get("manual_inputs")
    row = {
        "run_id": run_id,
        "topic": data.get("topic") or "untitled",
        "statuses": data.get("statuses") or {},
        "timestamp": data.get("timestamp") or "",
        "archived": bool(data.get("archived")),
        "pipeline_id": resolve_pipeline_id(data),
        **run_record_api_fields(data),
    }
    if isinstance(manual, dict):
        row["manual_inputs"] = {
            k: manual[k]
            for k in ("paragraph", "additional_details")
            if manual.get(k)
        }
    return row


def _run_has_active_job(client_id: str, run_id: str) -> bool:
    with _STEP_JOBS_LOCK:
        return any(
            cid == client_id and rid == run_id and thread.is_alive()
            for (cid, rid, _step), thread in _STEP_JOBS.items()
        )


def _run_step_job(
    *,
    key: tuple[str, str, str],
    client_id: str,
    run_id: str,
    step_name: str,
    previous_artifact: str,
    runner_fn,
) -> None:
    try:
        runner_fn(client_id, run_id, previous_artifact)
        with _STEP_JOBS_LOCK:
            manifest = load_manifest(client_id, run_id)
            statuses = dict(manifest.get("statuses") or {})
            # A user may have cancelled while the provider request was in progress.
            if statuses.get(step_name) == "running":
                statuses[step_name] = "done"
                timings = artifacts.record_step_finished(
                    client_id, run_id, step_name, "done"
                )
                errors = dict(manifest.get("step_errors") or {})
                errors.pop(step_name, None)
                artifacts.save_run_manifest(
                    client_id,
                    run_id,
                    manifest.get("topic") or "untitled",
                    statuses,
                    step_timings=timings,
                    step_errors=errors,
                )
    except Exception as exc:
        logger.exception(
            "Background pipeline step failed: %s/%s/%s",
            client_id,
            run_id,
            step_name,
        )
        with _STEP_JOBS_LOCK:
            manifest = load_manifest(client_id, run_id)
            statuses = dict(manifest.get("statuses") or {})
            if statuses.get(step_name) == "running":
                statuses[step_name] = "error"
                timings = artifacts.record_step_finished(
                    client_id, run_id, step_name, "error"
                )
                errors = dict(manifest.get("step_errors") or {})
                errors[step_name] = f"{type(exc).__name__}: {exc}"
                artifacts.save_run_manifest(
                    client_id,
                    run_id,
                    manifest.get("topic") or "untitled",
                    statuses,
                    step_timings=timings,
                    step_errors=errors,
                )
    finally:
        try:
            mongo_storage.sync_cache()
        except Exception:
            logger.exception(
                "Could not persist background step result: %s/%s/%s",
                client_id,
                run_id,
                step_name,
            )
        with _STEP_JOBS_LOCK:
            _STEP_JOBS.pop(key, None)


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
                rows.append(_run_summary_from_manifest(data, run_id))
            except json.JSONDecodeError:
                rows.append(
                    _run_summary_from_manifest(
                        {"topic": "untitled", "statuses": {}, "timestamp": ""},
                        run_id,
                    )
                )
        else:
            rows.append(
                _run_summary_from_manifest(
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
    with _STEP_JOBS_LOCK:
        manifest = load_manifest(client_id, run_id) or {}
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


def _validate_future_schedule(iso: str) -> str | None:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now()
        compare_dt = dt.replace(tzinfo=None) if dt.tzinfo else dt
        compare_now = now.replace(tzinfo=None) if now.tzinfo else now
        if compare_dt <= compare_now:
            return "Scheduled time must be in the future"
    except ValueError:
        return "Invalid scheduled_at"
    return None


def _update_run_schedule(
    client_id: str,
    run_id: str,
    raw_scheduled=None,
    raw_platform_schedules=None,
):
    """Persist schedule times. Returns (response_dict, status_code)."""
    manifest = load_manifest(client_id, run_id)
    if not manifest:
        return {"detail": "run not found"}, 404

    record = normalize_run_record_fields(manifest)
    platform_schedules = dict(record.get("platform_schedules") or {})
    selected = record.get("platforms") or []

    if raw_platform_schedules is not None:
        updates = normalize_platform_schedules(raw_platform_schedules)
        for platform, iso in updates.items():
            if platform not in PLATFORMS:
                continue
            if iso is None:
                platform_schedules.pop(platform, None)
                continue
            err = _validate_future_schedule(iso)
            if err:
                return {"detail": err}, 400
            platform_schedules[platform] = iso
    elif raw_scheduled is not None:
        scheduled_at = normalize_scheduled_at(raw_scheduled)
        if raw_scheduled is not None and scheduled_at is None:
            return {"detail": "Invalid scheduled_at"}, 400
        if scheduled_at:
            err = _validate_future_schedule(scheduled_at)
            if err:
                return {"detail": err}, 400
            for platform in selected:
                platform_schedules[platform] = scheduled_at
        else:
            for platform in selected:
                platform_schedules.pop(platform, None)

    scheduled_at = earliest_scheduled_at(
        {k: v for k, v in platform_schedules.items() if k in selected and v}
    )

    current_status = str(manifest.get("status") or "draft").strip().lower()
    if scheduled_at:
        post_status = "scheduled"
    elif current_status == "scheduled":
        post_status = "draft"
    else:
        post_status = current_status

    artifacts.save_run_manifest(
        client_id,
        run_id,
        manifest.get("topic") or "untitled",
        manifest.get("statuses") or {},
        pipeline_id=resolve_pipeline_id(manifest),
        manual_inputs=manifest.get("manual_inputs")
        if isinstance(manifest.get("manual_inputs"), dict)
        else None,
        step_timings=manifest.get("step_timings")
        if isinstance(manifest.get("step_timings"), dict)
        else None,
        context_summary=manifest.get("context_summary")
        if isinstance(manifest.get("context_summary"), str)
        else None,
        step_errors=manifest.get("step_errors")
        if isinstance(manifest.get("step_errors"), dict)
        else None,
        post_status=post_status,
        scheduled_at=scheduled_at,
        platform_schedules=platform_schedules,
        published_results=manifest.get("published_results"),
        platforms=manifest.get("platforms"),
    )
    updated = load_manifest(client_id, run_id)
    record = run_record_api_fields(updated)
    return {"run_id": run_id, "client_id": client_id, **record}, 200


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

    if "platforms" in body:
        manifest = load_manifest(client_id, run_id)
        if not manifest:
            return jsonify(detail="run not found"), 404
        platforms = normalize_platforms(body.get("platforms"), allow_empty=True)
        artifacts.save_run_manifest(
            client_id,
            run_id,
            manifest.get("topic") or "untitled",
            manifest.get("statuses") or {},
            pipeline_id=resolve_pipeline_id(manifest),
            manual_inputs=manifest.get("manual_inputs")
            if isinstance(manifest.get("manual_inputs"), dict)
            else None,
            step_timings=manifest.get("step_timings")
            if isinstance(manifest.get("step_timings"), dict)
            else None,
            context_summary=manifest.get("context_summary")
            if isinstance(manifest.get("context_summary"), str)
            else None,
            step_errors=manifest.get("step_errors")
            if isinstance(manifest.get("step_errors"), dict)
            else None,
            post_status=manifest.get("status"),
            scheduled_at=manifest.get("scheduled_at"),
            platform_schedules=manifest.get("platform_schedules"),
            published_results=manifest.get("published_results"),
            platforms=platforms,
        )
        updated = load_manifest(client_id, run_id)
        record = run_record_api_fields(updated)
        return jsonify(run_id=run_id, client_id=client_id, **record)

    if "platform_schedules" in body:
        payload, code = _update_run_schedule(
            client_id, run_id, raw_platform_schedules=body.get("platform_schedules")
        )
        return jsonify(**payload), code

    if "scheduled_at" in body:
        payload, code = _update_run_schedule(
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
        if _run_has_active_job(client_id, run_id):
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
        payload, code = _update_run_schedule(
            client_id, run_id, raw_platform_schedules=body.get("platform_schedules")
        )
        return jsonify(**payload), code
    if "scheduled_at" not in body:
        return jsonify(detail="scheduled_at or platform_schedules is required"), 400

    payload, code = _update_run_schedule(
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
    if _run_has_active_job(client_id, run_id):
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
    if runner_fn is None:
        return jsonify(detail=f"Unknown step_name: {step_name!r}"), 400

    topic = manifest.get("topic") or ""
    if not previous_artifact and step_name == "client_profile_topic":
        previous_artifact = topic
    key = (client_id, run_id, step_name)
    thread = threading.Thread(
        target=_run_step_job,
        kwargs={
            "key": key,
            "client_id": client_id,
            "run_id": run_id,
            "step_name": step_name,
            "previous_artifact": previous_artifact,
            "runner_fn": runner_fn,
        },
        name=f"pipeline-{client_id}-{run_id}-{step_name}",
        daemon=True,
    )
    with _STEP_JOBS_LOCK:
        latest = load_manifest(client_id, run_id)
        statuses = dict(latest.get("statuses") or {})
        for name in pipeline.step_order:
            statuses.setdefault(name, "pending")
        existing = _STEP_JOBS.get(key)
        if statuses.get(step_name) == "running" or (
            existing and existing.is_alive()
        ):
            return jsonify(detail="This step is already running"), 409
        timings = artifacts.record_step_started(client_id, run_id, step_name)
        statuses[step_name] = "running"
        errors = dict(latest.get("step_errors") or {})
        errors.pop(step_name, None)
        artifacts.save_run_manifest(
            client_id,
            run_id,
            topic,
            statuses,
            step_timings=timings,
            step_errors=errors,
        )
        _STEP_JOBS[key] = thread
    thread.start()
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
