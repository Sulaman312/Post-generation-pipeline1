"""Run list/detail summary helpers."""

from __future__ import annotations

from backend.pipelines import resolve_pipeline_id
from backend.run_location import location_from_manifest
from backend.run_record import run_record_api_fields


def run_summary_from_manifest(data: dict, run_id: str) -> dict:
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
    row.update(location_from_manifest(data))
    return row
