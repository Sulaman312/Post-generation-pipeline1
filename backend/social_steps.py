from __future__ import annotations

import logging
import re
from datetime import datetime

from . import artifacts, config, image_artifacts, social_channels, social_input, social_prompts
from .context_summary import generate_context_summary
from .integrations import openai_chat
from .run_location import location_from_manifest, location_prompt_block
from .social_image_styles import extract_markdown_section

logger = logging.getLogger(__name__)

_PUBLISH_META_PREFIX = (
    r"(?:"
    r"Suggested\s+(?:location\s+tag|posting\s+time(?:\s+window)?)"
    r"|(?:Recommended|Best|Ideal)\s+(?:posting\s+)?time(?:\s+to\s+post|\s+window)?"
    r"|Posting\s+time\s+(?:suggestion|window|recommendation)"
    r")"
)
_PUBLISH_META_LINE = re.compile(
    rf"^\s*(?:[-*•]\s*)?\*{{0,2}}\s*{_PUBLISH_META_PREFIX}\s*:.*$",
    re.IGNORECASE,
)
_INLINE_PUBLISH_META = re.compile(
    rf"\s*(?:[-*•]\s*)?\*{{0,2}}\s*{_PUBLISH_META_PREFIX}\s*:[^\n]*",
    re.IGNORECASE,
)


def sanitize_caption_for_publish(text: str) -> str:
    """Remove scheduling/location suggestions that should not be posted."""
    lines = []
    for line in (text or "").splitlines():
        if _PUBLISH_META_LINE.match(line):
            continue
        cleaned = _INLINE_PUBLISH_META.sub("", line).rstrip()
        if cleaned.strip():
            lines.append(cleaned)
    return "\n".join(lines).strip()


def _rebuild_captions_markdown(sections: dict[str, str]) -> str:
    blocks: list[str] = []
    for key, heading in (
        ("instagram", "## Instagram"),
        ("linkedin", "## LinkedIn"),
        ("facebook", "## Facebook"),
    ):
        body = (sections.get(key) or "").strip()
        if body:
            blocks.append(f"{heading}\n{body}")
    return "\n\n".join(blocks).strip() + ("\n" if blocks else "")

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

def _location_context(client_id: str, run_id: str) -> dict[str, bool | str]:
    manifest = _load_manifest(client_id, run_id)
    return location_from_manifest(manifest)


def _location_block(client_id: str, run_id: str) -> str:
    return location_prompt_block(_location_context(client_id, run_id))


_STEP_ANGLE_MARKER = re.compile(r"^##\s+Primary intent\s*$", re.MULTILINE | re.IGNORECASE)


def split_topic_brief(content: str) -> tuple[str, str]:
    """Split combined topic brief into profile and angle/intent sections."""
    text = (content or "").strip()
    match = _STEP_ANGLE_MARKER.search(text)
    if not match:
        return text, ""
    return text[: match.start()].strip(), text[match.start() :].strip()


def load_angle_intent(client_id: str, run_id: str) -> str:
    """Angle/intent from legacy step file or embedded in the combined topic brief."""
    try:
        legacy = artifacts.load_artifact(client_id, run_id, "content_angle_intent")
        if legacy and legacy.strip():
            return legacy.strip()
    except Exception:
        pass
    try:
        brief = artifacts.load_artifact(client_id, run_id, "client_profile_topic")
        _, angle = split_topic_brief(brief)
        return angle
    except Exception:
        return ""


def _topic_brief_block(client_id: str, run_id: str) -> str:
    """Full topic brief for downstream prompts (profile + angle in one block)."""
    brief = artifacts.load_artifact(client_id, run_id, "client_profile_topic").strip()
    if not brief:
        return ""
    _, angle = split_topic_brief(brief)
    if angle:
        return (
            "---TOPIC BRIEF (profile + angle)---\n"
            f"{brief}\n"
            "---END TOPIC BRIEF---\n"
        )
    legacy_angle = load_angle_intent(client_id, run_id)
    if legacy_angle:
        return (
            "---CLIENT PROFILE---\n"
            f"{brief}\n\n"
            "---ANGLE / INTENT---\n"
            f"{legacy_angle}\n"
            "---END---\n"
        )
    return (
        "---CLIENT PROFILE---\n"
        f"{brief}\n"
        "---END---\n"
    )


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


def _topic_card_angles_block(client_id: str, run_id: str) -> str:
    """Short angle + alternatives from Step 1 topic brief for image prompt generation."""
    brief = artifacts.load_artifact(client_id, run_id, "client_profile_topic").strip()
    if not brief:
        return ""
    sections: list[str] = []
    for heading in (
        "Primary intent",
        "Post format",
        "Short angle statement",
        "Alternative angles",
    ):
        body = extract_markdown_section(brief, heading)
        if body:
            sections.append(f"## {heading}\n{body}")
    if not sections:
        return ""
    return (
        "---TOPIC CARD (Step 1 — use for visual direction)---\n"
        + "\n\n".join(sections)
        + "\n---END TOPIC CARD---\n"
    )


def _image_prompt_user_message(
    client_id: str,
    run_id: str,
    manifest: dict,
    *,
    image_style: str,
) -> str:
    """Build Step 3 user message: template + idea + topic card angles + location."""
    parts: list[str] = []
    if image_style:
        parts.append(image_style)

    idea = _user_idea_block(manifest).strip()
    if idea:
        parts.append(f"---USER IDEA---\n{idea}\n---END USER IDEA---")

    topic = _content_topic_block(manifest).strip()
    if topic:
        parts.append(f"---CONTENT TOPIC---\n{topic}\n---END CONTENT TOPIC---")

    angles = _topic_card_angles_block(client_id, run_id)
    if angles:
        parts.append(angles)

    if not image_style:
        context = _context_block(client_id, run_id)
        parts.insert(
            0,
            "---WORKSPACE ARTIFACT SUMMARY---\n"
            f"{context}\n"
            "---END WORKSPACE ARTIFACT SUMMARY---",
        )
        brief = _topic_brief_block(client_id, run_id).strip()
        if brief:
            parts.append(brief)

    parts.append(_location_block(client_id, run_id))
    return "\n\n".join(p for p in parts if p.strip())

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

        f"{_location_block(client_id, run_id)}\n\n"

        "---EXTRA TOPIC (if any)---\n"

        f"{(previous_artifact or '').strip()}\n"

        "---END EXTRA TOPIC---\n"

    )

    out = _chat(social_prompts.TOPIC_BRIEF_SYSTEM, user_msg, step_label="Social topic brief")

    return _save_md(client_id, run_id, step_name, out.strip() + "\n")

def run_step_3_image_prompt(

    client_id: str, run_id: str, previous_artifact: str = ""

) -> str:

    step_name = "image_prompt"

    manifest = _load_manifest(client_id, run_id)
    image_style = _image_style_block(client_id)
    user_msg = _image_prompt_user_message(
        client_id,
        run_id,
        manifest,
        image_style=image_style,
    )
    system_msg = (
        social_prompts.CLIENT_IMAGE_FROM_TEMPLATE_SYSTEM
        if image_style
        else social_prompts.IMAGE_PROMPT_SYSTEM
    )

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
    lines.append("Next: select your preferred style in the UI, then continue to Brand template.")

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

        "Next: run Brand template to create platform images with your client template.\n"

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

def export_channel_formats(client_id: str, run_id: str) -> dict:
    """Export resized platform images from the selected primary (no template overlay)."""
    idx = image_artifacts.load_image_index(client_id, run_id)

    if not idx or not idx.images:
        raise RuntimeError("No generated images found. Run image generation first.")

    if not idx.selected_primary:
        raise RuntimeError("No primary image selected. Select one in image generation first.")

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

    from . import config, image_overlay, social_channels

    importlib.reload(config)
    importlib.reload(image_overlay)

    outputs: dict[str, dict] = {}

    with Image.open(src_path) as im0:
        base = im0.convert("RGB")
        rendered_by_key = image_overlay.render_channel_exports(
            base,
            None,
            logo_path=None,
        )
        for ch in social_channels.SOCIAL_CHANNELS:
            key = str(ch["key"])
            rendered = rendered_by_key[key]
            fn = str(ch["filename"])
            out_path = image_artifacts.format_image_path(client_id, run_id, fn)
            rendered.save(out_path, format="PNG", optimize=True)
            base_fn = f"base_{fn}"
            base_path = image_artifacts.format_image_path(client_id, run_id, base_fn)
            rendered.save(base_path, format="PNG", optimize=True)
            outputs[key] = {
                "filename": fn,
                "base_filename": base_fn,
                "width": int(ch["width"]),
                "height": int(ch["height"]),
                "label": str(ch["label"]),
            }

    payload = {
        "selected_primary": idx.selected_primary,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "resize_policy": image_overlay.export_resize_policy(),
        "overlay_applied": False,
        "template_applied": False,
        "outputs": outputs,
    }
    image_artifacts.save_formats_index(client_id, run_id, payload)
    return payload

def run_step_8_captions(client_id: str, run_id: str, previous_artifact: str = "") -> str:

    step_name = "captions"

    manifest = _load_manifest(client_id, run_id)

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

        f"{_topic_brief_block(client_id, run_id)}\n\n"

        "---IMAGE PROMPT---\n"

        f"{img_prompt.strip()}\n\n"

        "---SELECTED VISUAL STYLE---\n"

        f"{style_label or '(not recorded)'}\n\n"

        "---ON-IMAGE HEADLINE / OVERLAY TEXT---\n"

        f"{overlay_text or '(none)'}\n\n"

        "---EXPORTED PLATFORM FILES---\n"

        f"{chr(10).join(format_lines) if format_lines else '(run Step 6 first)'}\n\n"

        f"{_location_block(client_id, run_id)}\n"

    )

    out = _chat(social_prompts.CAPTIONS_SYSTEM, user_msg, step_label="Social Step 8")
    sections = _split_captions_by_channel(out)
    clean = _rebuild_captions_markdown(sections)

    return _save_md(client_id, run_id, step_name, clean)

def run_step_9_review_checklist(

    client_id: str, run_id: str, previous_artifact: str = ""

) -> str:

    step_name = "review_checklist"

    out = (
        "Use the platform previews in the UI to review captions and images before publish.\n"
    )

    return _save_md(client_id, run_id, step_name, out)

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

    for key in result:
        result[key] = sanitize_caption_for_publish(result[key])

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
    from backend.publish_runner import run_step_publish as _run_publish

    return _run_publish(client_id, run_id, previous_artifact)

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

