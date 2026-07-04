from __future__ import annotations



import logging

from datetime import datetime



from . import artifacts

from . import config

from . import image_artifacts

from . import social_input

from . import social_prompts

from .context_summary import generate_context_summary

from .integrations import linkedin_api, meta_graph, openai_chat

from . import social_channels

from .run_record import normalize_platforms, normalize_published_results



logger = logging.getLogger(__name__)





def _chat(system_msg: str, user_msg: str, *, step_label: str) -> str:

    return openai_chat.chat_complete(system_msg, user_msg, step_label=step_label)





def _load_manifest(client_id: str, run_id: str) -> dict:

    return artifacts.read_run_manifest(client_id, run_id) or {}





def _save_md(client_id: str, run_id: str, step_name: str, content: str) -> str:

    artifacts.save_artifact(client_id, run_id, step_name, content)

    return content





def _context_block(client_id: str, run_id: str) -> str:

    manifest = _load_manifest(client_id, run_id)

    cached = manifest.get("context_summary")

    if isinstance(cached, str) and cached.strip():

        return cached.strip()

    summary = generate_context_summary(client_id)

    return summary.strip()





def _user_idea_block(manifest: dict) -> str:

    manual = manifest.get("manual_inputs")

    manual = manual if isinstance(manual, dict) else None

    return social_input.format_manual_block(manual)


def _image_style_block(client_id: str) -> str:

    path = config.CLIENTS_DIR / client_id / "context" / "image_style.md"

    if not path.is_file():

        return ""

    return path.read_text(encoding="utf-8").strip()


def _content_topic_block(manifest: dict) -> str:
    """Full post idea/title for the generalized image prompt template."""
    manual = manifest.get("manual_inputs")
    manual = manual if isinstance(manual, dict) else None
    if manual:
        para = (manual.get("paragraph") or "").strip()
        details = (manual.get("additional_details") or "").strip()
        if para and details:
            return f"{para}\n\n{details}"
        if para:
            return para
        if details:
            return details
    topic = (manifest.get("topic") or "").strip()
    if topic:
        return topic
    return _user_idea_block(manifest)





def run_step_1_client_profile_topic(

    client_id: str, run_id: str, previous_artifact: str = ""

) -> str:

    """Summarize user idea + workspace context for a social post."""

    step_name = "client_profile_topic"

    manifest = _load_manifest(client_id, run_id)

    context = _context_block(client_id, run_id)

    user_msg = (

        "Summarize this client profile + post idea for a social post.\n\n"

        f"Run: {run_id}\n"

        f"Client: {client_id}\n"

        f"Generated at: {datetime.now().isoformat(timespec='seconds')}\n\n"

        "---WORKSPACE ARTIFACT SUMMARY---\n"

        f"{context}\n"

        "---END WORKSPACE ARTIFACT SUMMARY---\n\n"

        "---USER IDEA---\n"

        f"{_user_idea_block(manifest)}\n"

        "---END USER IDEA---\n\n"

        "---EXTRA TOPIC (if any)---\n"

        f"{(previous_artifact or '').strip()}\n"

        "---END EXTRA TOPIC---\n"

    )

    out = _chat(social_prompts.CLIENT_PROFILE_TOPIC_SYSTEM, user_msg, step_label="Social Step 1")

    return _save_md(client_id, run_id, step_name, out.strip() + "\n")





def run_step_2_content_angle_intent(

    client_id: str, run_id: str, previous_artifact: str = ""

) -> str:

    step_name = "content_angle_intent"

    manifest = _load_manifest(client_id, run_id)

    profile = (previous_artifact or "").strip() or artifacts.load_artifact(

        client_id, run_id, "client_profile_topic"

    )

    context = _context_block(client_id, run_id)

    user_msg = (

        "---WORKSPACE ARTIFACT SUMMARY---\n"

        f"{context}\n"

        "---END WORKSPACE ARTIFACT SUMMARY---\n\n"

        "---USER IDEA---\n"

        f"{_user_idea_block(manifest)}\n"

        "---END USER IDEA---\n\n"

        "---CLIENT PROFILE (STEP 1)---\n"

        f"{profile}\n"

        "---END---\n"

    )

    out = _chat(social_prompts.CONTENT_ANGLE_INTENT_SYSTEM, user_msg, step_label="Social Step 2")

    return _save_md(client_id, run_id, step_name, out.strip() + "\n")





def run_step_3_image_prompt(

    client_id: str, run_id: str, previous_artifact: str = ""

) -> str:

    step_name = "image_prompt"

    manifest = _load_manifest(client_id, run_id)
    image_style = _image_style_block(client_id)

    if image_style:
        topic = _content_topic_block(manifest)
        user_msg = (
            f"{image_style}\n\n"
            "---CONTENT TOPIC---\n"
            f"{topic}\n"
            "---END CONTENT TOPIC---"
        )
        system_msg = social_prompts.CLIENT_IMAGE_FROM_TEMPLATE_SYSTEM
    else:
        angle = (previous_artifact or "").strip() or artifacts.load_artifact(
            client_id, run_id, "content_angle_intent"
        )
        profile = artifacts.load_artifact(client_id, run_id, "client_profile_topic")
        context = _context_block(client_id, run_id)
        user_msg = (
            "---WORKSPACE ARTIFACT SUMMARY---\n"
            f"{context}\n"
            "---END WORKSPACE ARTIFACT SUMMARY---\n\n"
            "---USER IDEA---\n"
            f"{_user_idea_block(manifest)}\n"
            "---END USER IDEA---\n\n"
            "---CLIENT PROFILE---\n"
            f"{profile.strip()}\n\n"
            "---ANGLE / INTENT---\n"
            f"{angle.strip()}\n"
        )
        system_msg = social_prompts.IMAGE_PROMPT_SYSTEM

    out = _chat(system_msg, user_msg, step_label="Social Step 3")

    return _save_md(client_id, run_id, step_name, out.strip() + "\n")





def run_step_4_image_generation(client_id: str, run_id: str, previous_artifact: str = "") -> str:

    step_name = "image_generation"

    from . import social_image_generation

    idx = social_image_generation.generate_all_styles(
        client_id, run_id, previous_artifact=previous_artifact
    )

    lines = ["Generated images (one per style):", ""]
    for fn in idx.images:
        info = idx.meta.get(fn) or {}
        label = info.get("style_label") or fn
        lines.append(f"- **{label}** → `{fn}`")
    lines.append("")
    lines.append("Next: select your preferred style in the UI, then continue to Step 5 (image_formats).")

    return _save_md(client_id, run_id, step_name, "\n".join(lines) + "\n")





def run_step_5_image_compose(client_id: str, run_id: str, previous_artifact: str = "") -> str:

    step_name = "image_compose"

    idx = image_artifacts.load_image_index(client_id, run_id)

    if not idx or not idx.images:

        raise RuntimeError("No generated images found. Run Step 4 first.")

    if not idx.selected_primary:

        raise RuntimeError("No primary image selected. Select one in Step 4 first.")



    from . import image_overlay

    overlay = image_overlay.load_overlay(client_id, run_id)

    logo_path = artifacts.client_logo_path(client_id)

    overlay_summary = image_overlay.overlay_apply_summary(

        overlay,

        logo_path=logo_path,

        primary_image=idx.selected_primary,

    )

    saved = bool(overlay and image_overlay.has_visible_overlay(overlay))

    hint = (

        "Overlay saved with logo and/or headline."

        if saved

        else "No overlay saved yet — open Step 5 in the UI, place logo & text, and click Save overlay before Step 6 export."

    )

    out = (

        "Image compose:\n\n"

        f"- Primary image: {idx.selected_primary}\n"

        f"- Overlay: {overlay_summary}\n"

        f"- Status: {hint}\n\n"

        "Next: run Step 6 (image_formats) to create platform images, then Step 7 to place the client template.\n"

    )

    return _save_md(client_id, run_id, step_name, out)





def run_step_7_image_template(client_id: str, run_id: str, previous_artifact: str = "") -> str:
    step_name = "image_template"

    idx = image_artifacts.load_image_index(client_id, run_id)

    if not idx or not idx.images:

        raise RuntimeError("No generated images found. Run Step 4 first.")

    if not idx.selected_primary:

        raise RuntimeError("No primary image selected. Select one in Step 4 first.")

    from . import image_templates

    current_template = image_templates.load_run_template(client_id, run_id)
    template_id = str((current_template or {}).get("template_id") or "").strip()
    if not template_id:
        templates = image_templates.list_client_templates(client_id)
        template_id = templates[0]["id"] if templates else image_templates.DEFAULT_TEMPLATE_ID

    saved = image_templates.save_run_template(
        client_id,
        run_id,
        template_id=template_id,
    )
    applied = image_templates.apply_run_template_to_formats(client_id, run_id)
    lines = (saved.get("headline") or {}).get("lines") or []
    headline_lines = [
        f"- {str(line.get('text') or '').strip()} ({str(line.get('weight') or 'normal')})"
        for line in lines
        if isinstance(line, dict) and str(line.get("text") or "").strip()
    ]
    export_lines = []
    for key, info in (applied.get("outputs") or {}).items():
        if isinstance(info, dict):
            export_lines.append(
                f"- {info.get('label') or key}: {info.get('filename') or ''} "
                f"({info.get('width')}×{info.get('height')})"
            )

    out = (
        "Image template applied:\n\n"
        f"- Input image: {idx.selected_primary}\n"
        f"- Template: {saved.get('template_name') or saved.get('template_id')}\n"
        f"- Source: `{saved.get('source_template')}`\n"
        f"- Fixed assets folder: `clients/{client_id}/templates/{saved.get('template_id')}/assets/`\n"
        "- Headline text:\n"
        + "\n".join(headline_lines)
        + "\n\n"
        "Branded platform exports:\n"
        + ("\n".join(export_lines) if export_lines else "- (none)")
        + "\n"
    )

    return _save_md(client_id, run_id, step_name, out)




def run_step_6_image_formats(client_id: str, run_id: str, previous_artifact: str = "") -> str:

    step_name = "image_formats"

    idx = image_artifacts.load_image_index(client_id, run_id)

    if not idx or not idx.images:

        raise RuntimeError("No generated images found. Run Step 4 first.")

    if not idx.selected_primary:

        raise RuntimeError("No primary image selected. Select one in Step 4 first.")



    try:

        from PIL import Image

    except ImportError as e:

        raise RuntimeError("Pillow not installed. Run: pip install pillow") from e



    src_path = image_artifacts.generated_image_path(

        client_id, run_id, idx.selected_primary

    )

    if not src_path.is_file():

        raise RuntimeError("Selected primary image file is missing on disk.")



    import importlib

    from . import image_overlay
    from . import social_channels

    importlib.reload(image_overlay)

    overlay = None

    outputs: dict[str, dict] = {}
    export_lines: list[str] = []

    with Image.open(src_path) as im0:
        base = im0.convert("RGB")
        for ch in social_channels.SOCIAL_CHANNELS:
            rendered = image_overlay.export_formatted_image(
                base,
                None,
                logo_path=None,
                target_w=int(ch["width"]),
                target_h=int(ch["height"]),
                resize_mode="crop",
            )
            fn = str(ch["filename"])
            out_path = image_artifacts.format_image_path(client_id, run_id, fn)
            rendered.save(out_path, format="PNG", optimize=True)
            base_fn = f"base_{fn}"
            base_path = image_artifacts.format_image_path(client_id, run_id, base_fn)
            rendered.save(base_path, format="PNG", optimize=True)
            key = str(ch["key"])
            outputs[key] = {
                "filename": fn,
                "base_filename": base_fn,
                "width": int(ch["width"]),
                "height": int(ch["height"]),
                "label": str(ch["label"]),
            }
            export_lines.append(
                f"- {ch['label']}: {fn} ({ch['width']}×{ch['height']})"
            )

    image_artifacts.save_formats_index(
        client_id,
        run_id,
        {
            "selected_primary": idx.selected_primary,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "overlay_applied": False,
            "template_applied": False,
            "outputs": outputs,
        },
    )

    out = (
        "Formatted images saved:\n\n"
        + "\n".join(export_lines)
        + "\n\n"
        "Overlay: Not applied in this step.\n"
        "Template: Applied automatically in Step 6.\n"
    )

    return _save_md(client_id, run_id, step_name, out)





def run_step_8_captions(client_id: str, run_id: str, previous_artifact: str = "") -> str:

    step_name = "captions"

    manifest = _load_manifest(client_id, run_id)

    profile = artifacts.load_artifact(client_id, run_id, "client_profile_topic")

    angle = artifacts.load_artifact(client_id, run_id, "content_angle_intent")

    img_prompt = artifacts.load_artifact(client_id, run_id, "image_prompt")

    context = _context_block(client_id, run_id)

    from . import image_overlay

    overlay = image_overlay.load_overlay(client_id, run_id) or {}
    overlay_text = ""
    text_block = overlay.get("text")
    if isinstance(text_block, dict):
        overlay_text = str(text_block.get("content") or "").strip()

    formats = image_artifacts.load_formats_index(client_id, run_id) or {}
    format_lines: list[str] = []
    for key, info in (formats.get("outputs") or {}).items():
        if isinstance(info, dict):
            format_lines.append(
                f"- {info.get('label') or key}: {info.get('filename')} "
                f"({info.get('width')}×{info.get('height')})"
            )

    style_label = ""
    img_idx = image_artifacts.load_image_index(client_id, run_id)
    if img_idx and img_idx.selected_primary:
        style_label = (img_idx.meta.get(img_idx.selected_primary) or {}).get(
            "style_label", ""
        )

    user_msg = (

        "---WORKSPACE ARTIFACT SUMMARY---\n"

        f"{context}\n"

        "---END WORKSPACE ARTIFACT SUMMARY---\n\n"

        "---USER IDEA---\n"

        f"{_user_idea_block(manifest)}\n"

        "---END USER IDEA---\n\n"

        "---CLIENT PROFILE---\n"

        f"{profile.strip()}\n\n"

        "---ANGLE / INTENT---\n"

        f"{angle.strip()}\n\n"

        "---IMAGE PROMPT---\n"

        f"{img_prompt.strip()}\n\n"

        "---SELECTED VISUAL STYLE---\n"

        f"{style_label or '(not recorded)'}\n\n"

        "---ON-IMAGE HEADLINE / OVERLAY TEXT---\n"

        f"{overlay_text or '(none)'}\n\n"

        "---EXPORTED PLATFORM FILES---\n"

        f"{chr(10).join(format_lines) if format_lines else '(run Step 6 first)'}\n"

    )

    out = _chat(social_prompts.CAPTIONS_SYSTEM, user_msg, step_label="Social Step 8")

    return _save_md(client_id, run_id, step_name, out.strip() + "\n")





def run_step_9_review_checklist(

    client_id: str, run_id: str, previous_artifact: str = ""

) -> str:

    step_name = "review_checklist"

    manifest = _load_manifest(client_id, run_id)

    profile = artifacts.load_artifact(client_id, run_id, "client_profile_topic")

    captions = artifacts.load_artifact(client_id, run_id, "captions")

    context = _context_block(client_id, run_id)

    user_msg = (

        "---WORKSPACE ARTIFACT SUMMARY---\n"

        f"{context}\n"

        "---END WORKSPACE ARTIFACT SUMMARY---\n\n"

        "---USER IDEA---\n"

        f"{_user_idea_block(manifest)}\n"

        "---END USER IDEA---\n\n"

        "---CLIENT PROFILE---\n"

        f"{profile.strip()}\n\n"

        "---CAPTIONS (STEP 7)---\n"

        f"{captions.strip()}\n"

    )

    out = _chat(social_prompts.REVIEW_CHECKLIST_SYSTEM, user_msg, step_label="Social Step 9")

    return _save_md(client_id, run_id, step_name, out.strip() + "\n")





def _split_captions_by_channel(captions_md: str) -> dict[str, str]:

    sections = {

        "instagram": "## Instagram",

        "linkedin": "## LinkedIn",

        "facebook": "## Facebook",

    }

    result = {key: "" for key in sections}

    current: str | None = None

    buffer: list[str] = []

    for line in (captions_md or "").splitlines():

        stripped = line.strip()

        matched = None

        for key, heading in sections.items():

            if stripped.lower() == heading.lower():

                matched = key

                break

        if matched is not None:

            if current is not None:

                result[current] = "\n".join(buffer).strip()

            current = matched

            buffer = []

            continue

        if current is not None:

            buffer.append(line)

    if current is not None:

        result[current] = "\n".join(buffer).strip()

    return result





def _channel_export_image_path(client_id: str, run_id: str, channel_key: str):

    formats = image_artifacts.load_formats_index(client_id, run_id) or {}

    outputs = formats.get("outputs") or {}

    info = outputs.get(channel_key)

    filename = ""

    if isinstance(info, dict):

        filename = str(info.get("filename") or "").strip()

    if not filename:

        ch = social_channels.CHANNEL_BY_KEY.get(channel_key) or {}

        filename = str(ch.get("filename") or "").strip()

    if not filename:

        raise RuntimeError(f"No exported image filename recorded for {channel_key!r}")

    return image_artifacts.format_image_path(client_id, run_id, filename)





def run_step_publish(client_id: str, run_id: str, previous_artifact: str = "") -> str:

    step_name = "publish"

    manifest = _load_manifest(client_id, run_id)

    selected = set(normalize_platforms(manifest.get("platforms"), allow_empty=True))

    captions_md = artifacts.load_artifact(client_id, run_id, "captions")

    caption_by_channel = _split_captions_by_channel(captions_md)

    lines = ["Publish results:", ""]

    published_results: list[dict] = []

    any_published = False

    any_failed = False

    channel_specs = (

        (

            "facebook",

            "Facebook",

            lambda: bool(

                (config.META_PAGE_ACCESS_TOKEN or "").strip()

                and (config.META_PAGE_ID or "").strip()

            ),

            meta_graph.publish_facebook_post,

        ),

        (

            "instagram",

            "Instagram",

            lambda: bool(

                (config.META_IG_USER_ID or "").strip()

                and (config.META_PAGE_ACCESS_TOKEN or "").strip()

            ),

            meta_graph.publish_instagram_post,

        ),

        (

            "linkedin",

            "LinkedIn",

            lambda: bool(

                (config.LINKEDIN_ACCESS_TOKEN or "").strip()

                and (config.LINKEDIN_ORG_URN or "").strip()

            ),

            linkedin_api.publish_linkedin_post,

        ),

    )

    for channel_key, label, is_connected, publish_fn in channel_specs:

        lines.append(f"## {label}")

        if channel_key not in selected:

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

    content = _save_md(client_id, run_id, step_name, "\n".join(lines).strip() + "\n")

    manifest = _load_manifest(client_id, run_id)

    if manifest:

        if any_published:

            post_status = "published"

        elif any_failed:

            post_status = "failed"

        else:

            post_status = manifest.get("status") or "draft"

        artifacts.save_run_manifest(

            client_id,

            run_id,

            manifest.get("topic") or "untitled",

            manifest.get("statuses") or {},

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

            scheduled_at=None if any_published else manifest.get("scheduled_at"),

            published_results=normalize_published_results(published_results),

        )

    return content





def run_step_8_schedule_publish(

    client_id: str, run_id: str, previous_artifact: str = ""

) -> str:

    step_name = "schedule_publish"

    manifest = _load_manifest(client_id, run_id)

    profile = artifacts.load_artifact(client_id, run_id, "client_profile_topic")

    captions = artifacts.load_artifact(client_id, run_id, "captions")

    context = _context_block(client_id, run_id)

    user_msg = (

        "---WORKSPACE ARTIFACT SUMMARY---\n"

        f"{context}\n"

        "---END WORKSPACE ARTIFACT SUMMARY---\n\n"

        "---USER IDEA---\n"

        f"{_user_idea_block(manifest)}\n"

        "---END USER IDEA---\n\n"

        "---CLIENT PROFILE---\n"

        f"{profile.strip()}\n\n"

        "---CAPTIONS---\n"

        f"{captions.strip()}\n"

    )

    out = _chat(social_prompts.SCHEDULE_PUBLISH_SYSTEM, user_msg, step_label="Social Step 7")

    return _save_md(client_id, run_id, step_name, out.strip() + "\n")


