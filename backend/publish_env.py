"""Test vs live publishing credentials and active environment selection."""

from __future__ import annotations

import os
from typing import Any, Literal

from backend import config

PublishEnvironment = Literal["test", "live"]
PUBLISH_ENVIRONMENTS: tuple[str, ...] = ("test", "live")

_active_env: PublishEnvironment = (
    "live" if (os.getenv("PUBLISH_ENV") or "test").strip().lower() == "live" else "test"
)


def _strip(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def active_publish_env() -> PublishEnvironment:
    return _active_env


def set_active_publish_env(env: str) -> PublishEnvironment:
    global _active_env
    normalized = (env or "").strip().lower()
    if normalized not in PUBLISH_ENVIRONMENTS:
        raise ValueError("env must be 'test' or 'live'")
    if normalized == "live" and not live_env_configured():
        raise ValueError("Live publishing credentials are not configured in .env")
    _active_env = normalized  # type: ignore[assignment]
    return _active_env


def meta_credentials(env: PublishEnvironment | None = None) -> dict[str, str | None]:
    target = env or active_publish_env()
    if target == "live":
        return {
            "page_access_token": _strip(os.getenv("META_LIVE_PAGE_ACCESS_TOKEN")),
            "page_id": _strip(os.getenv("META_LIVE_PAGE_ID")),
            "ig_user_id": _strip(os.getenv("META_LIVE_IG_USER_ID")),
        }
    return {
        "page_access_token": _strip(os.getenv("META_PAGE_ACCESS_TOKEN")) or config.META_PAGE_ACCESS_TOKEN,
        "page_id": _strip(os.getenv("META_PAGE_ID")) or config.META_PAGE_ID,
        "ig_user_id": _strip(os.getenv("META_IG_USER_ID")) or config.META_IG_USER_ID,
    }


def linkedin_credentials(env: PublishEnvironment | None = None) -> dict[str, str | None]:
    target = env or active_publish_env()
    if target == "live":
        return {
            "access_token": _strip(os.getenv("LINKEDIN_LIVE_ACCESS_TOKEN")),
            "org_urn": _strip(os.getenv("LINKEDIN_LIVE_ORG_URN")),
            "person_urn": _strip(os.getenv("LINKEDIN_LIVE_PERSON_URN")),
        }
    return {
        "access_token": _strip(os.getenv("LINKEDIN_ACCESS_TOKEN")) or config.LINKEDIN_ACCESS_TOKEN,
        "org_urn": _strip(os.getenv("LINKEDIN_ORG_URN")) or config.LINKEDIN_ORG_URN,
        "person_urn": _strip(os.getenv("LINKEDIN_PERSON_URN")) or config.LINKEDIN_PERSON_URN,
    }


def is_facebook_connected(env: PublishEnvironment | None = None) -> bool:
    creds = meta_credentials(env)
    return bool(creds.get("page_access_token") and creds.get("page_id"))


def is_instagram_connected(env: PublishEnvironment | None = None) -> bool:
    creds = meta_credentials(env)
    return bool(creds.get("page_access_token") and creds.get("ig_user_id"))


def is_linkedin_connected(env: PublishEnvironment | None = None) -> bool:
    creds = linkedin_credentials(env)
    token = creds.get("access_token")
    org = creds.get("org_urn")
    person = creds.get("person_urn")
    return bool(token and (org or person))


def live_env_configured() -> bool:
    return (
        is_facebook_connected("live")
        or is_instagram_connected("live")
        or is_linkedin_connected("live")
    )


def env_availability() -> dict[str, bool]:
    return {
        "test": (
            is_facebook_connected("test")
            or is_instagram_connected("test")
            or is_linkedin_connected("test")
        ),
        "live": live_env_configured(),
    }


def settings_payload() -> dict[str, Any]:
    availability = env_availability()
    active = active_publish_env()
    return {
        "env": active,
        "availability": availability,
        "connected_platforms": connected_platform_keys(active),
    }


def connected_platform_keys(env: PublishEnvironment | None = None) -> list[str]:
    target = env or active_publish_env()
    out: list[str] = []
    if is_facebook_connected(target):
        out.append("facebook")
    if is_instagram_connected(target):
        out.append("instagram")
    if is_linkedin_connected(target):
        out.append("linkedin")
    return out
