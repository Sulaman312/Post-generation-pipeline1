"""Background worker that publishes posts when their scheduled time arrives."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from backend import artifacts, config, mongo_storage
from backend.api.helpers import load_manifest
from backend.pipelines import resolve_pipeline_id
from backend.publish_runner import persist_publish_outcome, publish_to_platforms
from backend.run_record import (
    due_platforms,
    normalize_run_record_fields,
    published_platform_keys,
)

logger = logging.getLogger(__name__)

_THREAD: threading.Thread | None = None
_STOP = threading.Event()
_RUN_LOCKS: dict[tuple[str, str], threading.Lock] = {}
_RUN_LOCKS_GUARD = threading.Lock()


def _poll_interval_seconds() -> float:
    raw = (os.getenv("SCHEDULE_PUBLISH_POLL_SECONDS") or "300").strip()
    try:
        return max(60.0, float(raw))
    except ValueError:
        return 300.0


def enabled() -> bool:
    raw = (os.getenv("SCHEDULE_PUBLISH_ENABLED") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _run_lock(client_id: str, run_id: str) -> threading.Lock:
    key = (client_id, run_id)
    with _RUN_LOCKS_GUARD:
        lock = _RUN_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            _RUN_LOCKS[key] = lock
        return lock


def _iter_run_manifests():
    clients_root = Path(config.CLIENTS_DIR)
    if not clients_root.is_dir():
        return
    for client_dir in sorted(clients_root.iterdir()):
        if not client_dir.is_dir():
            continue
        runs_root = client_dir / "runs"
        if not runs_root.is_dir():
            continue
        for run_dir in sorted(runs_root.iterdir()):
            if not run_dir.is_dir():
                continue
            manifest_path = run_dir / "run_manifest.json"
            if not manifest_path.is_file():
                continue
            try:
                data = json.loads(manifest_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                logger.warning("Skipping invalid manifest: %s", manifest_path)
                continue
            yield client_dir.name, run_dir.name, data


def _should_process_run(manifest: dict) -> bool:
    if manifest.get("archived"):
        return False
    if resolve_pipeline_id(manifest) != "social_media":
        return False
    record = normalize_run_record_fields(manifest)
    if record.get("status") not in ("scheduled", "draft"):
        # Allow draft when schedules exist (legacy / edge cases).
        if record.get("status") != "draft" or not (
            record.get("scheduled_at") or record.get("platform_schedules")
        ):
            return False
    statuses = manifest.get("statuses") or {}
    if statuses.get("publish") == "running":
        return False
    return bool(due_platforms(record))


def process_due_scheduled_posts(*, now: datetime | None = None) -> int:
    """Publish all posts/platforms whose schedule time has passed. Returns count processed."""
    current = now or datetime.now(timezone.utc)
    processed = 0

    for client_id, run_id, manifest in _iter_run_manifests():
        record = normalize_run_record_fields(manifest)
        due = due_platforms(record, current)
        if not due or not _should_process_run(manifest):
            continue

        lock = _run_lock(client_id, run_id)
        if not lock.acquire(blocking=False):
            continue

        try:
            latest = load_manifest(client_id, run_id)
            if not latest or not _should_process_run(latest):
                continue
            record = normalize_run_record_fields(latest)
            due = due_platforms(record, current)
            if not due:
                continue

            logger.info(
                "Auto-publishing scheduled post %s/%s for platforms: %s",
                client_id,
                run_id,
                ", ".join(due),
            )

            statuses = dict(latest.get("statuses") or {})
            statuses["publish"] = "running"
            artifacts.save_run_manifest(
                client_id,
                run_id,
                latest.get("topic") or "untitled",
                statuses,
                pipeline_id=latest.get("pipeline_id"),
                manual_inputs=latest.get("manual_inputs")
                if isinstance(latest.get("manual_inputs"), dict)
                else None,
                step_timings=latest.get("step_timings")
                if isinstance(latest.get("step_timings"), dict)
                else None,
                context_summary=latest.get("context_summary")
                if isinstance(latest.get("context_summary"), str)
                else None,
                step_errors=latest.get("step_errors")
                if isinstance(latest.get("step_errors"), dict)
                else None,
                post_status=record.get("status"),
                platforms=record.get("platforms"),
                scheduled_at=record.get("scheduled_at"),
                platform_schedules=record.get("platform_schedules"),
                published_results=record.get("published_results"),
            )

            outcome = publish_to_platforms(
                client_id,
                run_id,
                set(due),
                include_unselected=False,
            )
            persist_publish_outcome(
                client_id,
                run_id,
                outcome,
                clear_schedules_for=published_platform_keys(outcome.published_results),
                mark_publish_step_done=True,
            )

            if mongo_storage.enabled():
                try:
                    mongo_storage.sync_cache()
                except Exception:
                    logger.exception(
                        "MongoDB sync failed after scheduled publish %s/%s",
                        client_id,
                        run_id,
                    )

            processed += 1
        except Exception:
            logger.exception(
                "Scheduled publish failed for %s/%s",
                client_id,
                run_id,
            )
            try:
                latest = load_manifest(client_id, run_id) or {}
                statuses = dict(latest.get("statuses") or {})
                if statuses.get("publish") == "running":
                    statuses["publish"] = "error"
                    artifacts.save_run_manifest(
                        client_id,
                        run_id,
                        latest.get("topic") or "untitled",
                        statuses,
                        pipeline_id=latest.get("pipeline_id"),
                        manual_inputs=latest.get("manual_inputs")
                        if isinstance(latest.get("manual_inputs"), dict)
                        else None,
                        step_timings=latest.get("step_timings")
                        if isinstance(latest.get("step_timings"), dict)
                        else None,
                        context_summary=latest.get("context_summary")
                        if isinstance(latest.get("context_summary"), str)
                        else None,
                        step_errors=latest.get("step_errors")
                        if isinstance(latest.get("step_errors"), dict)
                        else None,
                        post_status=latest.get("status"),
                        platforms=latest.get("platforms"),
                        scheduled_at=latest.get("scheduled_at"),
                        platform_schedules=latest.get("platform_schedules"),
                        published_results=latest.get("published_results"),
                    )
            except Exception:
                logger.exception(
                    "Could not reset publish status after failure %s/%s",
                    client_id,
                    run_id,
                )
        finally:
            lock.release()

    return processed


def _worker_loop() -> None:
    logger.info(
        "Scheduled publish worker started (poll every %.0fs)",
        _poll_interval_seconds(),
    )
    while not _STOP.wait(_poll_interval_seconds()):
        try:
            count = process_due_scheduled_posts()
            if count:
                logger.info("Scheduled publish worker processed %s run(s)", count)
        except Exception:
            logger.exception("Scheduled publish worker cycle failed")


def start_schedule_publisher() -> None:
    global _THREAD
    if not enabled():
        logger.info("Scheduled publish worker disabled")
        return
    if _THREAD and _THREAD.is_alive():
        return
    _STOP.clear()
    _THREAD = threading.Thread(
        target=_worker_loop,
        name="schedule-publisher",
        daemon=True,
    )
    _THREAD.start()


def stop_schedule_publisher() -> None:
    _STOP.set()
