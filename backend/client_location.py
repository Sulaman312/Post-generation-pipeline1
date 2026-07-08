"""Client location — single source of truth from company context (Artifact 1)."""

from __future__ import annotations

import re

from . import artifacts, config

_MAX_LOCATION_LEN = 500

_LOCATION_LABELS = frozenset(
    {
        "location",
        "service area",
        "city region",
        "geographic area",
        "areas served",
        "region for marketing",
    }
)

# Bullet / plain labeled lines.
_LOCATION_LINE = re.compile(
    r"^\s*(?:[-*•]\s*)?"
    r"(?:\*\*)?"
    r"(?:location(?:\s*\(city/region[^)]*\))?|service\s*area|city\s*/\s*region|"
    r"geographic\s*area|areas?\s*served|region\s+for\s+marketing)"
    r"(?:\*\*)?"
    r"\s*:\s*(.+?)\s*$",
    re.IGNORECASE,
)

_STREET_HINT = re.compile(
    r"\b("
    r"route|rue|street|st\.|avenue|ave\.|boulevard|blvd|chemin|impasse|allée|allee|"
    r"drive|dr\.|lane|ln\.|road|rd\.|highway|hwy|place|pl\.|court|ct\."
    r")\b",
    re.IGNORECASE,
)

_STREET_NUMBER = re.compile(
    r"(?:^\s*\d{1,5}\s+)|"
    r"(?:\b\d{1,5}\s*$)|"
    r"(?:\b\d{4,5}\b)",
    re.IGNORECASE,
)

_TABLE_HEADER_VALUES = frozenset(
    {"field", "fields", "detail", "details", "value", "values", "---", "—"}
)


def _normalize_label(text: str) -> str:
    s = re.sub(r"^\*\*|\*\*$", "", (text or "").strip())
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return s


def _is_location_label(label: str) -> bool:
    norm = _normalize_label(label)
    if not norm:
        return False
    if norm in _LOCATION_LABELS:
        return True
    return norm.startswith("location ") or norm.startswith("location city region")


def _looks_like_street_address(text: str) -> bool:
    s = (text or "").strip()
    if not s:
        return True
    if _STREET_HINT.search(s) and _STREET_NUMBER.search(s):
        return True
    if re.match(r"^\d{1,5}\s+\S", s) and _STREET_HINT.search(s):
        return True
    return False


def _clean_location_value(raw: str) -> str:
    s = (raw or "").strip()
    s = re.sub(r"^\*\*|\*\*$", "", s).strip()
    s = re.sub(r"\s+", " ", s)
    return s[:_MAX_LOCATION_LEN]


def _is_table_separator(cells: list[str]) -> bool:
    if not cells:
        return True
    return all(re.match(r"^:?-{3,}:?$", c.strip()) for c in cells if c.strip())


def _extract_from_table_line(line: str) -> str | None:
    stripped = (line or "").strip()
    if not stripped.startswith("|"):
        return None
    cells = [c.strip() for c in stripped.strip("|").split("|")]
    if len(cells) < 2 or _is_table_separator(cells):
        return None
    key = cells[0]
    val = _clean_location_value(cells[1])
    if not val or _normalize_label(val) in _TABLE_HEADER_VALUES:
        return None
    if _is_location_label(key):
        return val
    return None


def extract_client_location_from_context(context_md: str) -> str | None:
    """Read explicit location from context.md; never infer or return street addresses."""
    text = (context_md or "").strip()
    if not text or "[NOT YET PROVIDED]" in text:
        return None

    candidates: list[str] = []

    for line in text.splitlines():
        table_val = _extract_from_table_line(line)
        if table_val:
            candidates.append(table_val)
            continue

        m = _LOCATION_LINE.match(line)
        if m:
            candidates.append(_clean_location_value(m.group(1)))
            continue

        plain = re.match(
            r"^\s*(?:\*\*)?Location(?:\*\*)?\s*:\s*(.+?)\s*$",
            line,
            re.IGNORECASE,
        )
        if plain:
            candidates.append(_clean_location_value(plain.group(1)))

    section = re.search(
        r"^##\s+Location\s*$([\s\S]*?)(?=^##\s+|\Z)",
        text,
        re.MULTILINE | re.IGNORECASE,
    )
    if section:
        body = (section.group(1) or "").strip()
        for line in body.splitlines():
            line = line.strip()
            if not line:
                continue
            table_val = _extract_from_table_line(line)
            if table_val:
                candidates.append(table_val)
                continue
            if ":" in line:
                key, _, rest = line.partition(":")
                if _is_location_label(key):
                    val = _clean_location_value(rest)
                    if val:
                        candidates.append(val)
            else:
                val = _clean_location_value(re.sub(r"^[-*•]\s*", "", line))
                if val:
                    candidates.append(val)

    for val in candidates:
        if val and not _looks_like_street_address(val):
            return val
    return None


def load_client_location(client_id: str) -> str | None:
    """Location from clients/<id>/context/context.md only."""
    path = config.CLIENTS_DIR / client_id / "context" / "context.md"
    if path.is_file():
        loc = extract_client_location_from_context(path.read_text(encoding="utf-8"))
        if loc:
            return loc

    combined = artifacts.load_context(client_id, "topic_card")
    if not combined:
        return None
    from .context_summary import _blocks_from_combined

    ctx = _blocks_from_combined(combined).get("context.md", "")
    return extract_client_location_from_context(ctx)


def default_run_location(client_id: str) -> dict[str, object]:
    """Defaults when starting a new run: on + value if client has a location."""
    loc = load_client_location(client_id)
    if loc:
        return {"use_location": True, "location_value": loc}
    return {"use_location": False, "location_value": ""}
