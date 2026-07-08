"""Re-save a loaded run manifest with selective field overrides."""

from __future__ import annotations

from typing import Any

from backend import artifacts
from backend.pipelines import resolve_pipeline_id


def save_manifest_from_loaded(
    client_id: str,
    run_id: str,
    manifest: dict,
    statuses: dict | None = None,
    **overrides: Any,
) -> None:
    """Persist manifest fields using the same shape as route handlers."""
    artifacts.save_run_manifest(
        client_id,
        run_id,
        manifest.get("topic") or "untitled",
        statuses if statuses is not None else (manifest.get("statuses") or {}),
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
        post_status=overrides.pop("post_status", manifest.get("status")),
        scheduled_at=overrides.pop("scheduled_at", manifest.get("scheduled_at")),
        platform_schedules=overrides.pop(
            "platform_schedules", manifest.get("platform_schedules")
        ),
        published_results=overrides.pop(
            "published_results", manifest.get("published_results")
        ),
        platforms=overrides.pop("platforms", manifest.get("platforms")),
        use_location=overrides.pop("use_location", manifest.get("use_location")),
        location_value=overrides.pop("location_value", manifest.get("location_value")),
        **overrides,
    )
