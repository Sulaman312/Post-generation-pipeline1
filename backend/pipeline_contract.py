"""Load the shared pipeline contract (single source for step order and platforms)."""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from . import config

_CONTRACT_PATH = (
    config.REPO_ROOT / "atlas-ui" / "src" / "constants" / "pipeline-contract.json"
)


@lru_cache(maxsize=1)
def load_contract() -> dict[str, Any]:
    if not _CONTRACT_PATH.is_file():
        raise FileNotFoundError(f"Pipeline contract not found: {_CONTRACT_PATH}")
    data = json.loads(_CONTRACT_PATH.read_text(encoding="utf-8"))
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
