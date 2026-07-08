"""Per-run location settings (use_location + location_value)."""

from __future__ import annotations

from typing import Any

from .client_location import _MAX_LOCATION_LEN, _clean_location_value

_MAX_VALUE = _MAX_LOCATION_LEN


def normalize_run_location(
    use_location: Any = None,
    location_value: Any = None,
    *,
    fallback_use: bool | None = None,
    fallback_value: str | None = None,
) -> dict[str, bool | str]:
    """Return normalized ``use_location`` and ``location_value`` for a run manifest."""
    ul = fallback_use if use_location is None else bool(use_location)
    raw_val = fallback_value if location_value is None else location_value
    val = _clean_location_value(str(raw_val or ""))

    if ul and not val:
        ul = False
        val = ""

    return {"use_location": ul, "location_value": val}


def location_from_manifest(manifest: dict[str, Any] | None) -> dict[str, bool | str]:
    if not isinstance(manifest, dict):
        return normalize_run_location(False, "")
    prev_use = manifest.get("use_location")
    prev_val = manifest.get("location_value")
    return normalize_run_location(
        prev_use if isinstance(prev_use, bool) else None,
        prev_val if isinstance(prev_val, str) else None,
        fallback_use=False,
        fallback_value="",
    )


def location_prompt_block(loc: dict[str, bool | str]) -> str:
    """User-message block consumed by pipeline steps."""
    use = bool(loc.get("use_location"))
    value = str(loc.get("location_value") or "").strip()
    if use and value:
        return (
            "---LOCATION---\n"
            f"Location is ENABLED. Use this exact text when geography is relevant: {value}\n"
            "Do not invent, abbreviate, or substitute a different place name.\n"
            "---END LOCATION---"
        )
    return (
        "---LOCATION---\n"
        "Location is DISABLED for this run.\n"
        "Do not mention any city, region, or local geography.\n"
        "Do not infer location from the brief or workspace summary.\n"
        "Never output placeholder tokens like [City Name].\n"
        "---END LOCATION---"
    )
