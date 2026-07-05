"""Publish social posts to connected platforms."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from backend import artifacts, publish_env
from backend.integrations import linkedin_api, meta_graph
from backend.run_record import (
    derive_post_status_after_publish,
    earliest_scheduled_at,
    merge_published_results,
    normalize_platforms,
    normalize_published_results,
    normalize_run_record_fields,
    published_platform_keys,
    run_record_api_fields,
)
from backend.social_steps import (
    _channel_export_image_path,
    _load_manifest,
    _save_md,
    _split_captions_by_channel,
)

logger = logging.getLogger(__name__)

_CHANNEL_SPECS = (
    (
        "facebook",
        "Facebook",
        lambda: publish_env.is_facebook_connected(),
        meta_graph.publish_facebook_post,
    ),
    (
        "instagram",
        "Instagram",
        lambda: publish_env.is_instagram_connected(),
        meta_graph.publish_instagram_post,
    ),
    (
        "linkedin",
        "LinkedIn",
        lambda: publish_env.is_linkedin_connected(),
        linkedin_api.publish_linkedin_post,
    ),
)


@dataclass
class PublishOutcome:
    published_results: list[dict]
    any_published: bool
    any_failed: bool
    content: str


def publish_to_platforms(
    client_id: str,
    run_id: str,
    platforms_to_publish: set[str],
    *,
    include_unselected: bool = True,
) -> PublishOutcome:
    """Publish to the given platform keys. Other selected platforms may be skipped."""
    manifest = _load_manifest(client_id, run_id)
    selected = set(normalize_platforms(manifest.get("platforms"), allow_empty=True))
    targets = {p for p in platforms_to_publish if p in selected}
    already_published = published_platform_keys(
        normalize_run_record_fields(manifest).get("published_results")
    )
    targets -= already_published
    captions_md = artifacts.load_artifact(client_id, run_id, "captions")
    caption_by_channel = _split_captions_by_channel(captions_md)

    lines = ["Publish results:", ""]
    published_results: list[dict] = []
    any_published = False
    any_failed = False

    for channel_key, label, is_connected, publish_fn in _CHANNEL_SPECS:
        if channel_key not in targets:
            if include_unselected:
                lines.append(f"## {label}")
                lines.append("- Status: Skipped — not selected")
                published_results.append(
                    {
                        "platform": channel_key,
                        "status": "skipped",
                        "published_at": None,
                        "post_url": None,
                        "error": None,
                    }
                )
                lines.append("")
            continue

        if channel_key not in selected:
            lines.append(f"## {label}")
            lines.append("- Status: Skipped — not selected")
            published_results.append(
                {
                    "platform": channel_key,
                    "status": "skipped",
                    "published_at": None,
                    "post_url": None,
                    "error": None,
                }
            )
            lines.append("")
            continue

        lines.append(f"## {label}")

        if not is_connected():
            lines.append("- Status: Skipped — not connected")
            published_results.append(
                {
                    "platform": channel_key,
                    "status": "skipped",
                    "published_at": None,
                    "post_url": None,
                    "error": "not connected",
                }
            )
            lines.append("")
            continue

        try:
            image_path = _channel_export_image_path(client_id, run_id, channel_key)
            if not image_path.is_file():
                raise RuntimeError(f"Exported image not found: {image_path.name}")
            caption = caption_by_channel.get(channel_key, "").strip()
            post_id = publish_fn(str(image_path), caption)
            lines.append("- Status: Posted")
            lines.append(f"- Post id: {post_id}")
            published_results.append(
                {
                    "platform": channel_key,
                    "status": "published",
                    "published_at": datetime.now().isoformat(),
                    "post_url": None,
                    "error": None,
                }
            )
            any_published = True
        except Exception as exc:
            logger.exception("Publish to %s failed", label)
            lines.append("- Status: Failed")
            lines.append(f"- Error: {exc}")
            published_results.append(
                {
                    "platform": channel_key,
                    "status": "failed",
                    "published_at": None,
                    "post_url": None,
                    "error": str(exc),
                }
            )
            any_failed = True
        lines.append("")

    content = "\n".join(lines).strip() + "\n"
    return PublishOutcome(
        published_results=published_results,
        any_published=any_published,
        any_failed=any_failed,
        content=content,
    )


def persist_publish_outcome(
    client_id: str,
    run_id: str,
    outcome: PublishOutcome,
    *,
    clear_schedules_for: set[str] | None = None,
    mark_publish_step_done: bool = False,
) -> None:
    manifest = _load_manifest(client_id, run_id)
    if not manifest:
        return

    record = normalize_run_record_fields(manifest)
    merged_results = merge_published_results(
        record.get("published_results"),
        outcome.published_results,
    )
    platform_schedules = dict(record.get("platform_schedules") or {})
    clear_for = clear_schedules_for or published_platform_keys(outcome.published_results)
    for platform in clear_for:
        platform_schedules.pop(platform, None)

    scheduled_at = earliest_scheduled_at(
        {k: v for k, v in platform_schedules.items() if v}
    )
    draft_record = {
        **record,
        "platform_schedules": platform_schedules,
        "scheduled_at": scheduled_at,
        "published_results": merged_results,
    }
    post_status = derive_post_status_after_publish(draft_record)
    if post_status == "published":
        scheduled_at = None
        platform_schedules = {}

    statuses = dict(manifest.get("statuses") or {})
    if mark_publish_step_done and statuses.get("publish") == "running":
        statuses["publish"] = "done"

    _save_md(client_id, run_id, "publish", outcome.content)
    artifacts.save_run_manifest(
        client_id,
        run_id,
        manifest.get("topic") or "untitled",
        statuses,
        pipeline_id=manifest.get("pipeline_id"),
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
        platforms=manifest.get("platforms"),
        scheduled_at=scheduled_at,
        platform_schedules=platform_schedules,
        published_results=normalize_published_results(merged_results),
    )


def run_step_publish(client_id: str, run_id: str, previous_artifact: str = "") -> str:
    """Pipeline publish step — selected platforms not yet published."""
    del previous_artifact
    manifest = _load_manifest(client_id, run_id)
    record = normalize_run_record_fields(manifest)
    selected = set(normalize_platforms(manifest.get("platforms"), allow_empty=True))
    already = published_platform_keys(record.get("published_results"))
    targets = selected - already
    if not targets:
        existing = artifacts.load_artifact(client_id, run_id, "publish")
        return existing if existing else "All selected platforms are already published.\n"
    outcome = publish_to_platforms(
        client_id,
        run_id,
        targets,
        include_unselected=True,
    )
    clear_for = set(selected) if outcome.any_published else published_platform_keys(
        outcome.published_results
    )
    persist_publish_outcome(
        client_id,
        run_id,
        outcome,
        clear_schedules_for=clear_for,
        mark_publish_step_done=False,
    )
    return outcome.content


def publish_selected_platforms(
    client_id: str,
    run_id: str,
    platforms: list[str] | set[str] | None = None,
    *,
    mark_publish_step_done: bool = True,
) -> dict:
    """Publish specific platforms (or all unpublished selected). Returns updated run fields."""
    manifest = _load_manifest(client_id, run_id)
    if not manifest:
        raise ValueError("run not found")

    record = normalize_run_record_fields(manifest)
    selected = set(normalize_platforms(manifest.get("platforms"), allow_empty=True))
    already = published_platform_keys(record.get("published_results"))

    if platforms is not None:
        targets = {p for p in platforms if p in selected} - already
    else:
        targets = selected - already

    if not targets:
        raise ValueError("No platforms available to publish")

    statuses = dict(manifest.get("statuses") or {})
    statuses["publish"] = "running"
    artifacts.save_run_manifest(
        client_id,
        run_id,
        manifest.get("topic") or "untitled",
        statuses,
        pipeline_id=manifest.get("pipeline_id"),
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
        post_status=record.get("status"),
        platforms=record.get("platforms"),
        scheduled_at=record.get("scheduled_at"),
        platform_schedules=record.get("platform_schedules"),
        published_results=record.get("published_results"),
    )

    outcome = publish_to_platforms(
        client_id,
        run_id,
        targets,
        include_unselected=False,
    )
    persist_publish_outcome(
        client_id,
        run_id,
        outcome,
        clear_schedules_for=set(targets),
        mark_publish_step_done=mark_publish_step_done,
    )

    updated = _load_manifest(client_id, run_id) or {}
    return run_record_api_fields(updated)
