"""Publishing helpers — connected platforms and channel metadata."""

from __future__ import annotations

from backend import publish_env
from backend.social_channels import SOCIAL_CHANNELS

PLATFORM_KEYS: tuple[str, ...] = tuple(str(c["key"]) for c in SOCIAL_CHANNELS)

PLATFORM_LABELS: dict[str, str] = {
    str(c["key"]): str(c["label"]) for c in SOCIAL_CHANNELS
}


def is_facebook_connected() -> bool:
    return publish_env.is_facebook_connected()


def is_instagram_connected() -> bool:
    return publish_env.is_instagram_connected()


def is_linkedin_connected() -> bool:
    return publish_env.is_linkedin_connected()


def connected_platforms() -> list[str]:
    """Platforms with credentials configured for the active publish environment."""
    return publish_env.connected_platform_keys()


def connected_platform_rows() -> list[dict[str, str]]:
    connected = set(connected_platforms())
    return [
        {"key": key, "label": PLATFORM_LABELS.get(key, key), "connected": key in connected}
        for key in PLATFORM_KEYS
        if key in connected
    ]
