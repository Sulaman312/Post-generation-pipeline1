"""Load the shared pipeline contract (single source for step order and platforms)."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from . import config


def _candidate_contract_paths() -> tuple[Path, ...]:
    override = (os.getenv("PIPELINE_CONTRACT_PATH") or "").strip()
    candidates: list[Path] = []
    if override:
        override_path = Path(override)
        if not override_path.is_absolute():
            override_path = (config.REPO_ROOT / override_path).resolve()
        candidates.append(override_path)

    candidates.extend(
        [
            config.REPO_ROOT / "atlas-ui" / "src" / "constants" / "pipeline-contract.json",
            config.REPO_ROOT / "atlas-ui" / "constants" / "pipeline-contract.json",
        ]
    )
    return tuple(candidates)


def contract_path() -> Path:
    for path in _candidate_contract_paths():
        if path.is_file():
            return path
    searched = ", ".join(str(path) for path in _candidate_contract_paths())
    raise FileNotFoundError(f"Pipeline contract not found. Tried: {searched}")


@lru_cache(maxsize=1)
def load_contract() -> dict[str, Any]:
    data = json.loads(contract_path().read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("pipeline-contract.json must be a JSON object")
    return data


def pipeline_id() -> str:
    return str(load_contract().get("pipeline_id") or "social_media")


def step_order() -> list[str]:
    steps = load_contract().get("steps") or []
    return [str(step["key"]) for step in steps if isinstance(step, dict) and step.get("key")]


def platforms() -> tuple[str, ...]:
    raw = load_contract().get("platforms") or []
    return tuple(str(p) for p in raw if p)


def default_platforms() -> tuple[str, ...]:
    raw = load_contract().get("default_platforms") or list(platforms())
    return tuple(str(p) for p in raw if p)


def post_statuses() -> frozenset[str]:
    raw = load_contract().get("post_statuses") or []
    return frozenset(str(s) for s in raw if s)


def platform_result_statuses() -> frozenset[str]:
    raw = load_contract().get("platform_result_statuses") or []
    return frozenset(str(s) for s in raw if s)
