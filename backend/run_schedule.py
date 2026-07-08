"""Run publish scheduling validation and persistence."""

from __future__ import annotations

from datetime import datetime

from backend import artifacts
from backend.api.helpers import load_manifest
from backend.pipelines import resolve_pipeline_id
from backend.run_record import (
    PLATFORMS,
    earliest_scheduled_at,
    normalize_platform_schedules,
    normalize_run_record_fields,
    normalize_scheduled_at,
    run_record_api_fields,
)


def validate_future_schedule(iso: str) -> str | None:
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


def update_run_schedule(
    client_id: str,
    run_id: str,
    *,
    raw_scheduled=None,
    raw_platform_schedules=None,
) -> tuple[dict, int]:
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
            err = validate_future_schedule(iso)
            if err:
                return {"detail": err}, 400
            platform_schedules[platform] = iso
    elif raw_scheduled is not None:
        scheduled_at = normalize_scheduled_at(raw_scheduled)
        if raw_scheduled is not None and scheduled_at is None:
            return {"detail": "Invalid scheduled_at"}, 400
        if scheduled_at:
            err = validate_future_schedule(scheduled_at)
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
