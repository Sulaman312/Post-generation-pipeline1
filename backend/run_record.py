"""Post / pipeline run publishing fields stored on ``run_manifest.json``."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.pipeline_contract import (
    default_platforms,
    platform_result_statuses,
    platforms,
    post_statuses,
)

POST_STATUSES: frozenset[str] = post_statuses()
PLATFORMS: frozenset[str] = frozenset(platforms())
PLATFORM_RESULT_STATUSES: frozenset[str] = platform_result_statuses()
DEFAULT_PLATFORMS: tuple[str, ...] = default_platforms()


def default_run_record_fields() -> dict[str, Any]:
    return {
        "status": "draft",
        "platforms": list(DEFAULT_PLATFORMS),
        "scheduled_at": None,
        "platform_schedules": {},
        "published_results": [],
    }


def _normalize_post_status(value: Any) -> str:
    status = str(value or "draft").strip().lower()
    if status not in POST_STATUSES:
        return "draft"
    return status


def _normalize_platform(value: Any) -> str | None:
    platform = str(value or "").strip().lower()
    if platform not in PLATFORMS:
        return None
    return platform


def normalize_platforms(value: Any, *, allow_empty: bool = False) -> list[str]:
    if not isinstance(value, list):
        return [] if allow_empty else list(DEFAULT_PLATFORMS)
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        platform = _normalize_platform(item)
        if platform and platform not in seen:
            seen.add(platform)
            out.append(platform)
    if not out:
        return [] if allow_empty else list(DEFAULT_PLATFORMS)
    return out


def _normalize_platform_result_status(value: Any) -> str:
    status = str(value or "pending").strip().lower()
    if status not in PLATFORM_RESULT_STATUSES:
        return "pending"
    return status


def normalize_published_result(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    platform = _normalize_platform(entry.get("platform"))
    if not platform:
        return None
    published_at = entry.get("published_at")
    if published_at is not None:
        published_at = str(published_at).strip() or None
    post_url = entry.get("post_url")
    if post_url is not None:
        post_url = str(post_url).strip() or None
    error = entry.get("error")
    if error is not None:
        error = str(error).strip() or None
    return {
        "platform": platform,
        "status": _normalize_platform_result_status(entry.get("status")),
        "published_at": published_at,
        "post_url": post_url,
        "error": error,
    }


def normalize_published_results(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in value:
        row = normalize_published_result(entry)
        if not row or row["platform"] in seen:
            continue
        seen.add(row["platform"])
        out.append(row)
    return out


def normalize_scheduled_at(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return text


def normalize_platform_schedules(value: Any) -> dict[str, str | None]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, str | None] = {}
    for key, raw in value.items():
        platform = _normalize_platform(key)
        if not platform:
            continue
        out[platform] = normalize_scheduled_at(raw)
    return out


def _bootstrap_platform_schedules(
    platforms: list[str],
    scheduled_at: str | None,
    platform_schedules: dict[str, str | None],
) -> dict[str, str | None]:
    out = dict(platform_schedules)
    if scheduled_at and not out:
        for platform in platforms:
            out.setdefault(platform, scheduled_at)
    return out


def earliest_scheduled_at(platform_schedules: dict[str, str | None]) -> str | None:
    parsed: list[tuple[datetime, str]] = []
    for iso in platform_schedules.values():
        if not iso:
            continue
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            parsed.append((dt, iso))
        except ValueError:
            continue
    if not parsed:
        return None
    parsed.sort(key=lambda row: row[0])
    return parsed[0][1]


def parse_schedule_datetime(value: Any) -> datetime | None:
    iso = normalize_scheduled_at(value)
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def schedule_is_due(value: Any, now: datetime | None = None) -> bool:
    dt = parse_schedule_datetime(value)
    if dt is None:
        return False
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    else:
        current = current.astimezone(timezone.utc)
    return dt <= current


def published_platform_keys(published_results: Any) -> set[str]:
    return {
        row["platform"]
        for row in normalize_published_results(published_results)
        if row.get("status") == "published"
    }


def due_platforms(record: dict[str, Any], now: datetime | None = None) -> list[str]:
    """Platforms selected for publish whose schedule time has passed."""
    current = now or datetime.now(timezone.utc)
    platforms = normalize_platforms(record.get("platforms"), allow_empty=True)
    schedules = dict(record.get("platform_schedules") or {})
    fallback = record.get("scheduled_at")
    already_published = published_platform_keys(record.get("published_results"))

    due: list[str] = []
    for platform in platforms:
        if platform in already_published:
            continue
        iso = schedules.get(platform) or fallback
        if iso and schedule_is_due(iso, current):
            due.append(platform)
    return due


def merge_published_results(
    existing: Any,
    updates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_platform: dict[str, dict[str, Any]] = {
        row["platform"]: row
        for row in normalize_published_results(existing)
    }
    for row in normalize_published_results(updates):
        if row:
            by_platform[row["platform"]] = row
    order = [p for p in PLATFORMS if p in by_platform]
    extra = [p for p in by_platform if p not in order]
    return [by_platform[p] for p in order + extra]


def derive_post_status(
    record: dict[str, Any],
    *,
    now: datetime | None = None,
) -> str:
    """Derive queue status from schedules and per-platform publish results."""
    current = now or datetime.now(timezone.utc)
    platforms = normalize_platforms(record.get("platforms"), allow_empty=True)
    schedules = dict(record.get("platform_schedules") or {})
    fallback = record.get("scheduled_at")
    results = normalize_published_results(record.get("published_results"))
    by_platform = {row["platform"]: row for row in results}
    published = published_platform_keys(results)

    for platform in platforms:
        if platform in published:
            continue
        if by_platform.get(platform, {}).get("status") == "skipped":
            continue
        iso = schedules.get(platform) or fallback
        if iso and not schedule_is_due(iso, current):
            return "scheduled"

    if any(row.get("status") == "failed" for row in results) and not published:
        return "failed"

    if published:
        return "published"

    stored = str(record.get("status") or "draft").strip().lower()
    if stored in POST_STATUSES:
        return stored
    return "draft"


def derive_post_status_after_publish(
    record: dict[str, Any],
    *,
    now: datetime | None = None,
) -> str:
    return derive_post_status(record, now=now)


def normalize_run_record_fields(data: dict[str, Any]) -> dict[str, Any]:
    """Return normalized publishing fields (does not mutate ``data``)."""
    defaults = default_run_record_fields()
    platforms = normalize_platforms(data.get("platforms", defaults["platforms"]))
    scheduled_at = normalize_scheduled_at(
        data.get("scheduled_at", defaults["scheduled_at"])
    )
    platform_schedules = normalize_platform_schedules(
        data.get("platform_schedules", defaults["platform_schedules"])
    )
    platform_schedules = _bootstrap_platform_schedules(
        platforms, scheduled_at, platform_schedules
    )
    if not scheduled_at and platform_schedules:
        scheduled_at = earliest_scheduled_at(platform_schedules)
    draft = {
        "status": _normalize_post_status(data.get("status", defaults["status"])),
        "platforms": platforms,
        "scheduled_at": scheduled_at,
        "platform_schedules": platform_schedules,
        "published_results": normalize_published_results(
            data.get("published_results", defaults["published_results"])
        ),
    }
    return {
        "status": derive_post_status(draft),
        "platforms": platforms,
        "scheduled_at": scheduled_at,
        "platform_schedules": platform_schedules,
        "published_results": draft["published_results"],
    }


def upgrade_run_record(manifest: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Ensure legacy manifests include publishing fields with valid values."""
    if not isinstance(manifest, dict):
        return manifest, False

    out = dict(manifest)
    normalized = normalize_run_record_fields(out)
    changed = False
    for key, value in normalized.items():
        if out.get(key) != value:
            out[key] = value
            changed = True
        elif key not in out:
            out[key] = value
            changed = True
    return out, changed


def run_record_api_fields(manifest: dict[str, Any] | None) -> dict[str, Any]:
    """Subset exposed on list/get run API responses."""
    data = manifest if isinstance(manifest, dict) else {}
    return normalize_run_record_fields(data)
