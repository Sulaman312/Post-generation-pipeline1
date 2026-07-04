"""Publishing helpers — connected platforms and channel metadata."""

from __future__ import annotations

from backend import config
from backend.social_channels import SOCIAL_CHANNELS

PLATFORM_KEYS: tuple[str, ...] = tuple(str(c["key"]) for c in SOCIAL_CHANNELS)

PLATFORM_LABELS: dict[str, str] = {
    str(c["key"]): str(c["label"]) for c in SOCIAL_CHANNELS
}


def is_facebook_connected() -> bool:
    return bool(
        (config.META_PAGE_ACCESS_TOKEN or "").strip()
        and (config.META_PAGE_ID or "").strip()
    )


def is_instagram_connected() -> bool:
    return bool(
        (config.META_IG_USER_ID or "").strip()
        and (config.META_PAGE_ACCESS_TOKEN or "").strip()
    )


def is_linkedin_connected() -> bool:
    token = (config.LINKEDIN_ACCESS_TOKEN or "").strip()
    org = (config.LINKEDIN_ORG_URN or "").strip()
    person = (config.LINKEDIN_PERSON_URN or "").strip()
    return bool(token and (org or person))


def connected_platforms() -> list[str]:
    """Platforms with credentials configured for publishing."""
    out: list[str] = []
    if is_facebook_connected():
        out.append("facebook")
    if is_instagram_connected():
        out.append("instagram")
    if is_linkedin_connected():
        out.append("linkedin")
    return out


def connected_platform_rows() -> list[dict[str, str]]:
    connected = set(connected_platforms())
    return [
        {"key": key, "label": PLATFORM_LABELS.get(key, key), "connected": key in connected}
        for key in PLATFORM_KEYS
        if key in connected
    ]
