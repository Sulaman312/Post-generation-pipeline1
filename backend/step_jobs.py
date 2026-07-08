"""Background pipeline step execution and job tracking."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Any

from backend import artifacts, mongo_storage

logger = logging.getLogger(__name__)

RunnerFn = Callable[[str, str, str], Any]
JobKey = tuple[str, str, str]

_STEP_JOBS: dict[JobKey, threading.Thread] = {}
_STEP_JOBS_LOCK = threading.Lock()


def has_active_job(client_id: str, run_id: str) -> bool:
    with _STEP_JOBS_LOCK:
        return any(
            cid == client_id and rid == run_id and thread.is_alive()
            for (cid, rid, _step), thread in _STEP_JOBS.items()
        )


def is_step_running(key: JobKey) -> bool:
    with _STEP_JOBS_LOCK:
        existing = _STEP_JOBS.get(key)
        return existing is not None and existing.is_alive()


def register_job(key: JobKey, thread: threading.Thread) -> None:
    with _STEP_JOBS_LOCK:
        _STEP_JOBS[key] = thread


def _run_step_job(
    *,
    key: JobKey,
    client_id: str,
    run_id: str,
    step_name: str,
    previous_artifact: str,
    runner_fn: RunnerFn,
) -> None:
    try:
        runner_fn(client_id, run_id, previous_artifact)
        with _STEP_JOBS_LOCK:
            manifest = artifacts.read_run_manifest(client_id, run_id) or {}
            statuses = dict(manifest.get("statuses") or {})
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
            manifest = artifacts.read_run_manifest(client_id, run_id) or {}
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


def start_step_job_if_available(
    *,
    client_id: str,
    run_id: str,
    step_name: str,
    previous_artifact: str,
    runner_fn: RunnerFn,
    pipeline_step_order: list[str],
) -> bool:
    """Mark a step running and launch its background worker, or return False if busy."""
    key: JobKey = (client_id, run_id, step_name)
    with _STEP_JOBS_LOCK:
        latest = artifacts.read_run_manifest(client_id, run_id) or {}
        statuses = dict(latest.get("statuses") or {})
        for name in pipeline_step_order:
            statuses.setdefault(name, "pending")
        existing = _STEP_JOBS.get(key)
        if statuses.get(step_name) == "running" or (
            existing is not None and existing.is_alive()
        ):
            return False
        topic = latest.get("topic") or ""
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
        _STEP_JOBS[key] = thread
    thread.start()
    return True


def start_step_job(
    *,
    client_id: str,
    run_id: str,
    step_name: str,
    previous_artifact: str,
    runner_fn: RunnerFn,
) -> threading.Thread:
    key: JobKey = (client_id, run_id, step_name)
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
    register_job(key, thread)
    thread.start()
    return thread
