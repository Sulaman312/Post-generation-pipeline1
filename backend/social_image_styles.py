"""Named image style presets and prompt parsing for social Step 3 / 4."""

from __future__ import annotations

import re

STYLE_PRESETS: tuple[dict[str, str], ...] = (
    {
        "key": "photorealistic",
        "label": "Photorealistic scene",
        "description": "Photorealistic scene, natural lighting, believable local trade context.",
    },
    {
        "key": "close_up_detail",
        "label": "Close-up detail",
        "description": "Macro or close-up photograph of materials, craftsmanship, or product in context.",
    },
    {
        "key": "environmental_wide",
        "label": "Environmental wide",
        "description": "Wide environmental photograph showing space, setting, and scale — not a graphic layout.",
    },
    {
        "key": "lifestyle_warm",
        "label": "Lifestyle warm",
        "description": "Warm authentic lifestyle photograph with candid human connection.",
    },
)

CLIENT_STYLE_PRESETS: tuple[dict[str, str], ...] = (
    {
        "key": "primary",
        "label": "Primary image prompt",
        "description": "Client-specific primary brand image direction.",
    },
    {
        "key": "alternate",
        "label": "Alternate image prompt",
        "description": "Client-specific alternate camera angle or visual variation.",
    },
)

PRESET_BY_KEY = {p["key"]: p for p in (*STYLE_PRESETS, *CLIENT_STYLE_PRESETS)}


def extract_markdown_section(markdown: str, label: str) -> str:
    """Public helper: body text under a ## heading that matches label."""
    return _extract_section(markdown, label)


def _normalize_heading(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def _extract_h1_section(markdown: str, label: str) -> str:
    """Extract body under a `# Heading` (single hash) section."""
    target = _normalize_heading(label)
    if not target:
        return ""
    pattern = re.compile(
        r"^#\s+(.+?)\s*$([\s\S]*?)(?=^#\s+|\Z)",
        re.MULTILINE,
    )
    for match in pattern.finditer(markdown):
        heading = _normalize_heading(match.group(1))
        if heading == target or target in heading or heading in target:
            body = (match.group(2) or "").strip()
            body = re.sub(r"^#+\s.*$", "", body, flags=re.MULTILINE).strip()
            return body
    return ""


def _extract_section(markdown: str, label: str) -> str:
    """Extract body text under a ## heading that matches label."""
    target = _normalize_heading(label)
    if not target:
        return ""
    pattern = re.compile(
        r"^##\s+(.+?)\s*$([\s\S]*?)(?=^##\s+|\Z)",
        re.MULTILINE,
    )
    for match in pattern.finditer(markdown):
        heading = _normalize_heading(match.group(1))
        if heading == target or target in heading or heading in target:
            body = (match.group(2) or "").strip()
            body = re.sub(r"^#+\s.*$", "", body, flags=re.MULTILINE).strip()
            return body
    return ""


def _heading_matches(label: str, target: str) -> bool:
    if not target:
        return False
    return target == label or target in label or label in target


def _extract_numbered_section(markdown: str, label: str) -> str:
    """Extract body under a numbered heading like `2. Full image-generation prompt`."""
    target = _normalize_heading(label)
    if not target:
        return ""
    pattern = re.compile(
        r"^(\d+\.)\s+(.+?)\s*$([\s\S]*?)(?=^\d+\.\s+|\Z)",
        re.MULTILINE,
    )
    for match in pattern.finditer(markdown):
        heading = _normalize_heading(match.group(2))
        if _heading_matches(heading, target):
            body = (match.group(3) or "").strip()
            body = re.sub(r"^#+\s.*$", "", body, flags=re.MULTILINE).strip()
            return body
    return ""


def _extract_by_aliases(markdown: str, aliases: tuple[str, ...]) -> str:
    for alias in aliases:
        body = _extract_section(markdown, alias)
        if body:
            return body
        body = _extract_numbered_section(markdown, alias)
        if body:
            return body
    return ""


def _master_prompt_fallback(markdown: str) -> str:
    text = (markdown or "").strip()
    if not text:
        return "Professional social media image for a local trade business."
    for label in (
        "MASTER PROMPT",
        "Master Prompt",
        "MASTER",
        "Image Prompt",
    ):
        body = _extract_h1_section(text, label)
        if body:
            return body[:2000]
    for label in ("Photorealistic", "Master"):
        body = _extract_section(text, label)
        if body:
            return body[:2000]
    # Legacy: first paragraph only — never mash IG/LI sections into every style.
    chunks = [c.strip() for c in re.split(r"\n\s*\n", text) if c.strip()]
    if chunks:
        first = re.sub(r"^#+\s.*\n?", "", chunks[0], flags=re.MULTILINE).strip()
        if first:
            return first[:2000]
    without_headers = re.sub(r"^#+\s.*$", "", text, flags=re.MULTILINE).strip()
    return (without_headers[:2000] or text[:2000])


def _fallback_style_prompt(master: str, preset: dict[str, str]) -> str:
    base = _master_prompt_fallback(master)
    return (
        f"{base}\n\nVisual style: {preset['label']}. {preset['description']} "
        "Square composition suitable for cropping to Instagram, LinkedIn, and Facebook."
    )


def _extract_all_client_prompt_sections(markdown: str) -> list[dict[str, str]]:
    """Collect every ## section whose heading is a primary/alternate image prompt."""
    md = (markdown or "").strip()
    if not md:
        return []
    primary_aliases = tuple(
        _normalize_heading(alias)
        for alias in (
            "Primary image prompt",
            "Full image-generation prompt",
            "Full image generation prompt",
        )
    )
    alternate_aliases = tuple(
        _normalize_heading(alias)
        for alias in (
            "Alternate image prompt",
            "Alternate camera angle / variation",
            "Alternate camera angle",
        )
    )
    pattern = re.compile(
        r"^##\s+(.+?)\s*$([\s\S]*?)(?=^##\s+|\Z)",
        re.MULTILINE,
    )
    results: list[dict[str, str]] = []
    for match in pattern.finditer(md):
        raw_heading = (match.group(1) or "").strip()
        heading = _normalize_heading(raw_heading)
        body = (match.group(2) or "").strip()
        body = re.sub(r"^#+\s.*$", "", body, flags=re.MULTILINE).strip()
        if not body:
            continue
        kind = ""
        for alias in primary_aliases:
            if _heading_matches(heading, alias):
                kind = "primary"
                break
        if not kind:
            for alias in alternate_aliases:
                if _heading_matches(heading, alias):
                    kind = "alternate"
                    break
        if not kind:
            continue
        index = len(results) + 1
        results.append(
            {
                "style_key": f"variation_{index}",
                "style_label": raw_heading,
                "prompt": body,
            }
        )
    return results


def parse_style_prompts(markdown: str) -> list[dict[str, str]]:
    """Return one prompt dict per preset, in stable order."""
    md = (markdown or "").strip()
    all_client_sections = _extract_all_client_prompt_sections(md)
    if len(all_client_sections) >= 2:
        return all_client_sections

    client_style_results: list[dict[str, str]] = []
    primary_aliases = (
        "Primary image prompt",
        "Full image-generation prompt",
        "Full image generation prompt",
    )
    alternate_aliases = (
        "Alternate image prompt",
        "Alternate camera angle / variation",
        "Alternate camera angle",
    )
    for preset in CLIENT_STYLE_PRESETS:
        if preset["key"] == "primary":
            prompt = _extract_by_aliases(md, primary_aliases)
        elif preset["key"] == "alternate":
            prompt = _extract_by_aliases(md, alternate_aliases)
        else:
            prompt = _extract_by_aliases(md, (preset["label"], preset["key"].replace("_", " ")))
        if not prompt:
            prompt = _extract_section(md, preset["label"])
        if not prompt:
            prompt = _extract_section(md, preset["key"].replace("_", " "))
        if prompt:
            client_style_results.append(
                {
                    "style_key": preset["key"],
                    "style_label": preset["label"],
                    "prompt": prompt.strip(),
                }
            )
    # Require both image prompts; caption-only output is not enough for Step 4.
    has_primary = any(r["style_key"] == "primary" for r in client_style_results)
    has_alternate = any(r["style_key"] == "alternate" for r in client_style_results)
    if has_primary and has_alternate:
        return client_style_results
    if client_style_results:
        client_style_results.clear()

    results: list[dict[str, str]] = []

    # New format: ## Photorealistic, ## Flat graphic, …
    found_named = 0
    for preset in STYLE_PRESETS:
        prompt = _extract_section(md, preset["label"])
        if not prompt:
            prompt = _extract_section(md, preset["key"].replace("_", " "))
        if prompt:
            found_named += 1
        results.append(
            {
                "style_key": preset["key"],
                "style_label": preset["label"],
                "prompt": (prompt or "").strip(),
            }
        )

    if found_named >= 2:
        for i, preset in enumerate(STYLE_PRESETS):
            if not results[i]["prompt"]:
                results[i]["prompt"] = _fallback_style_prompt(md, preset)
        return [{**r, "prompt": r["prompt"].strip()} for r in results]

    # Legacy format: # MASTER / # INSTAGRAM / # LINKEDIN — build 4 styles from master only.
    master = _extract_h1_section(md, "MASTER PROMPT") or _extract_h1_section(md, "Master Prompt")
    if master:
        base = master[:2000]
        return [
            {
                "style_key": preset["key"],
                "style_label": preset["label"],
                "prompt": (
                    f"{base}\n\nVisual style: {preset['label']}. {preset['description']} "
                    "Square composition suitable for cropping to Instagram, LinkedIn, and Facebook."
                ).strip(),
            }
            for preset in STYLE_PRESETS
        ]

    return [
        {
            "style_key": preset["key"],
            "style_label": preset["label"],
            "prompt": _fallback_style_prompt(md, preset).strip(),
        }
        for preset in STYLE_PRESETS
    ]
