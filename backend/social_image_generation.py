"""Generate and regenerate styled preview images for social runs."""

from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import artifacts, image_artifacts, social_image_styles
from .integrations import openai_images

logger = logging.getLogger(__name__)

_IMAGE_PROMPT_GUARDRAILS = (
    "CRITICAL CONSTRAINTS: Photographic image only. No infographics, charts, diagrams, icons, "
    "illustrations, vector art, or flat-design layouts. No readable text, letters, numbers, "
    "headlines, captions, labels, logos, or watermarks anywhere in the image."
)

_DEFAULT_MAX_WORKERS = 4


def _max_image_gen_workers() -> int:
    raw = (os.getenv("IMAGE_GEN_MAX_WORKERS") or "").strip()
    if raw.isdigit():
        return max(1, min(int(raw), 8))
    return _DEFAULT_MAX_WORKERS


def _enforce_image_prompt_constraints(prompt: str) -> str:
    text = (prompt or "").strip()
    if not text:
        return text
    if "no readable text" in text.lower() and "no infographics" in text.lower():
        return text
    return f"{text}\n\n{_IMAGE_PROMPT_GUARDRAILS}"


def load_image_prompt_markdown(client_id: str, run_id: str) -> str:
    """Always read the saved image_prompt step artifact (includes user edits)."""
    return (artifacts.load_artifact(client_id, run_id, "image_prompt") or "").strip()


def list_style_plan(client_id: str, run_id: str) -> list[dict[str, str]]:
    prompt_md = load_image_prompt_markdown(client_id, run_id)
    if not prompt_md:
        return []
    return social_image_styles.parse_style_prompts(prompt_md)


def _generate_style_blob(style: dict[str, str]) -> tuple[dict[str, str], bytes]:
    """Call OpenAI Images for one style (safe to run in a worker thread)."""
    blobs = openai_images.generate_images(
        _enforce_image_prompt_constraints(style["prompt"]),
        n=1,
    )
    if not blobs:
        label = style.get("style_label") or style.get("style_key") or "unknown"
        raise RuntimeError(f"Image API returned no data for style {label}")
    return style, blobs[0]


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
    styles = [s for s in styles if (s.get("prompt") or "").strip()]
    if not styles:
        raise RuntimeError("No image style prompts found in image_prompt.md")

    image_artifacts.begin_generated_batch(client_id, run_id)
    workers = min(len(styles), _max_image_gen_workers())
    logger.info(
        "Generating %s styles in parallel (workers=%s) for %s/%s",
        len(styles),
        workers,
        client_id,
        run_id,
    )

    idx: image_artifacts.ImageIndex | None = None
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(_generate_style_blob, style): style for style in styles
        }
        for future in as_completed(futures):
            style = futures[future]
            style_key = style.get("style_key") or "?"
            try:
                finished_style, png_blob = future.result()
                idx = image_artifacts.append_generated_image(
                    client_id,
                    run_id,
                    png_blob=png_blob,
                    style=finished_style,
                )
                logger.info(
                    "Saved style %s for %s/%s (%s/%s)",
                    finished_style.get("style_key") or style_key,
                    client_id,
                    run_id,
                    len(idx.images),
                    len(styles),
                )
            except Exception as exc:
                logger.exception(
                    "Style %s failed for %s/%s",
                    style_key,
                    client_id,
                    run_id,
                )
                errors.append(f"{style_key}: {exc}")

    if errors:
        detail = errors[0] if len(errors) == 1 else "; ".join(errors)
        raise RuntimeError(detail)
    if idx is None:
        raise RuntimeError("No image styles were generated")
    return idx


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

    _, png_blob = _generate_style_blob(style)

    preset = social_image_styles.PRESET_BY_KEY.get(key)
    label = style.get("style_label") or (preset["label"] if preset else key)

    return image_artifacts.replace_style_image(
        client_id,
        run_id,
        style_key=key,
        style_label=label,
        png_blob=png_blob,
    )
