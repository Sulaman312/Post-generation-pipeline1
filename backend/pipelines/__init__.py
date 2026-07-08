"""Social media pipeline registry (standalone post service)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

RunnerFn = Callable[[str, str, str], str]


@dataclass(frozen=True)
class PipelineSpec:
    pipeline_id: str
    step_order: list[str]
    step_runners: dict[str, RunnerFn]


def resolve_pipeline_id(manifest: dict | None) -> str:
    from backend.pipeline_contract import pipeline_id

    return pipeline_id()


def upgrade_manifest(manifest: dict) -> tuple[dict, bool]:
    from backend.pipeline_contract import pipeline_id

    if not isinstance(manifest, dict):
        return manifest, False

    out = dict(manifest)
    pid = pipeline_id()
    changed = out.get("pipeline_id") != pid
    out["pipeline_id"] = pid

    pipeline = get_pipeline("social_media")
    statuses = dict(out.get("statuses") or {})
    for name in pipeline.step_order:
        if name not in statuses:
            statuses[name] = "pending"
            changed = True

    ordered = {name: statuses[name] for name in pipeline.step_order}
    if ordered != out.get("statuses"):
        out["statuses"] = ordered
        changed = True

    from backend.run_record import upgrade_run_record

    out, record_changed = upgrade_run_record(out)
    changed = changed or record_changed
    return out, changed


def get_pipeline(pipeline_id: str) -> PipelineSpec:
    from backend.pipeline_contract import pipeline_id as contract_pipeline_id
    from backend.social_pipeline import STEP_ORDER, STEP_RUNNERS

    return PipelineSpec(
        pipeline_id=contract_pipeline_id(),
        step_order=list(STEP_ORDER),
        step_runners=STEP_RUNNERS,
    )
