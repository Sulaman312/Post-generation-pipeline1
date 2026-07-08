"""Generate and regenerate styled preview images for social runs."""

from __future__ import annotations

import logging

from . import artifacts, image_artifacts, social_image_styles
from .integrations import openai_images

logger = logging.getLogger(__name__)


def load_image_prompt_markdown(client_id: str, run_id: str) -> str:
    """Always read the saved image_prompt step artifact (includes user edits)."""
    return (artifacts.load_artifact(client_id, run_id, "image_prompt") or "").strip()


def generate_all_styles(
    client_id: str,
    run_id: str,
    *,
    previous_artifact: str = "",
) -> image_artifacts.ImageIndex:
    # User-edited image_prompt.md is the source of truth; ignore stale request bodies.
    _ = previous_artifact
    prompt_md = load_image_prompt_markdown(client_id, run_id)
    if not prompt_md:
        raise RuntimeError("No image prompt found. Run Step 3 first.")

    styles = social_image_styles.parse_style_prompts(prompt_md)
    items: list[tuple[bytes, dict[str, str]]] = []
    for style in styles:
        logger.info(
            "Generating style %s for %s/%s",
            style["style_key"],
            client_id,
            run_id,
        )
        blobs = openai_images.generate_images(style["prompt"], n=1)
        if not blobs:
            raise RuntimeError(f"Image API returned no data for style {style['style_label']}")
        items.append((blobs[0], style))

    return image_artifacts.save_generated_images(client_id, run_id, styled_items=items)


def regenerate_style(
    client_id: str,
    run_id: str,
    style_key: str,
) -> image_artifacts.ImageIndex:
    key = (style_key or "").strip()
    if not key:
        raise ValueError("style_key is required")

    prompt_md = load_image_prompt_markdown(client_id, run_id)
    if not prompt_md:
        raise ValueError("No image prompt found. Run Step 3 first.")

    styles = social_image_styles.parse_style_prompts(prompt_md)
    style = next((s for s in styles if s["style_key"] == key), None)
    if not style:
        raise ValueError(f"No prompt found for style {key!r}")

    blobs = openai_images.generate_images(style["prompt"], n=1)
    if not blobs:
        raise RuntimeError("Image API returned no data")

    preset = social_image_styles.PRESET_BY_KEY.get(key)
    label = style.get("style_label") or (preset["label"] if preset else key)

    return image_artifacts.replace_style_image(
        client_id,
        run_id,
        style_key=key,
        style_label=label,
        png_blob=blobs[0],
    )
