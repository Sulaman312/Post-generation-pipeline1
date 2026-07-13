"""Manual inputs for social media runs (paragraph and/or structured fields)."""

from __future__ import annotations

import re

SOCIAL_FIELD_KEYS: tuple[str, ...] = (
    "paragraph",
    "additional_details",
    "caption_language",
    # legacy structured fields (still accepted for older runs)
    "trade",
    "city",
    "audience",
    "season",
    "problem",
)

_FIELD_LABELS: dict[str, str] = {
    "additional_details": "Additional details",
    "caption_language": "Caption language",
    "trade": "Business type",
    "city": "City / location",
    "audience": "Customer type",
    "season": "Season",
    "problem": "Seasonal problem / need",
}


def normalize_caption_language(raw: str | None) -> str:
    """Return 'en' or 'fr' for caption generation."""
    val = (raw or "en").strip().lower()
    if val in {"fr", "french", "français", "francais"}:
        return "fr"
    return "en"


def caption_language_label(lang: str) -> str:
    return "French" if normalize_caption_language(lang) == "fr" else "English"


def sanitize_social_manual_inputs(raw: dict | None) -> dict[str, str] | None:
    if not isinstance(raw, dict):
        return None
    out: dict[str, str] = {}
    if isinstance(raw, dict) and "caption_language" in raw:
        out["caption_language"] = normalize_caption_language(raw.get("caption_language"))
    for key in SOCIAL_FIELD_KEYS:
        if key == "caption_language":
            continue
        val = raw.get(key)
        if val is None:
            continue
        text = str(val).strip()
        if not text:
            continue
        limit = 8000 if key in ("paragraph", "additional_details") else 4000
        out[key] = text[:limit]
    return out or None


def _clean_topic_line(line: str) -> str:
    s = (line or "").strip()
    if not s:
        return ""
    for _ in range(3):
        nxt = re.sub(r"^[\s]*(?:[-•*●▪]|\d+[.)])\s*", "", s).strip()
        if nxt == s:
            break
        s = nxt
    if s.startswith(". ") and len(s) > 2:
        s = s[2:].strip()
    return s


def _first_good_line(text: str) -> str:
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        cleaned = _clean_topic_line(line)
        if len(cleaned) >= 3:
            return cleaned[:500]
    return ""


def topic_from_social(manual: dict | None) -> str:
    """Short display title from paragraph or structured fields."""
    if not isinstance(manual, dict):
        return ""
    para = (manual.get("paragraph") or "").strip()
    if para:
        title = _first_good_line(para)
        if title:
            return title
    details = (manual.get("additional_details") or "").strip()
    if details:
        title = _first_good_line(details)
        if title:
            return title
    trade = (manual.get("trade") or "").strip()
    city = (manual.get("city") or "").strip()
    season = (manual.get("season") or "").strip()
    problem = (manual.get("problem") or "").strip()
    parts = [trade, city and f"({city})", season, problem]
    return " ".join(p for p in parts if p).strip()[:500]


def format_manual_block(manual: dict | None) -> str:
    """Human-readable block for LLM prompts."""
    if not isinstance(manual, dict) or not manual:
        return "No user idea was provided."

    lines: list[str] = []
    para = (manual.get("paragraph") or "").strip()
    if para:
        lines.append("--- POST IDEA (free text) ---")
        lines.append(para)
        lines.append("--- END POST IDEA ---")

    details = (manual.get("additional_details") or "").strip()
    if details:
        lines.append("")
        lines.append("--- ADDITIONAL DETAILS (optional) ---")
        lines.append(details)
        lines.append("--- END ADDITIONAL DETAILS ---")

    lang = normalize_caption_language(manual.get("caption_language"))
    lang_label = caption_language_label(lang)
    lines.append("")
    lines.append(f"--- CAPTION LANGUAGE: {lang_label} ---")
    lines.append(
        f"Write all Instagram, LinkedIn, and Facebook caption text in {lang_label}."
    )
    lines.append("--- END CAPTION LANGUAGE ---")

    structured = [
        f"{_FIELD_LABELS[k]}: {manual[k]}"
        for k in SOCIAL_FIELD_KEYS
        if k not in ("paragraph", "additional_details", "caption_language")
        and (manual.get(k) or "").strip()
    ]
    if structured:
        lines.append("")
        lines.append("--- STRUCTURED FIELDS (optional) ---")
        lines.extend(structured)
        lines.append("--- END STRUCTURED FIELDS ---")

    return "\n".join(lines).strip() if lines else "No user idea was provided."
