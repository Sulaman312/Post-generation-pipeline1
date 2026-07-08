"""Test vs live publishing credentials and active environment selection.

Test credentials are global (``.env`` ``META_*`` / ``LINKEDIN_*``).
Live credentials are per workspace in ``.env``::

    META_LIVE_<WORKSPACE>_PAGE_ACCESS_TOKEN
    META_LIVE_<WORKSPACE>_PAGE_ID
    META_LIVE_<WORKSPACE>_IG_USER_ID
    LINKEDIN_LIVE_<WORKSPACE>_ACCESS_TOKEN
    LINKEDIN_LIVE_<WORKSPACE>_ORG_URN
    LINKEDIN_LIVE_<WORKSPACE>_PERSON_URN

``<WORKSPACE>`` is the uppercased workspace id (non-alphanumeric → ``_``).
Optional legacy global fallback: ``META_LIVE_PAGE_*`` / ``LINKEDIN_LIVE_*`` (no workspace).
"""

from __future__ import annotations

import contextvars
import os
import re
from contextlib import contextmanager
from typing import Any, Iterator, Literal

from backend import config

PublishEnvironment = Literal["test", "live"]
PUBLISH_ENVIRONMENTS: tuple[str, ...] = ("test", "live")

_active_env: PublishEnvironment = (
    "live" if (os.getenv("PUBLISH_ENV") or "test").strip().lower() == "live" else "test"
)
_publish_client_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "publish_client_id", default=None
)


def _strip(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def workspace_env_key(client_id: str) -> str:
    """Normalize a workspace id for env var suffixes (e.g. ``Simonetti`` → ``SIMONETTI``)."""
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", (client_id or "").strip())
    return cleaned.strip("_").upper()


def live_env_var_names(client_id: str) -> dict[str, str]:
    """Return the preferred ``.env`` key names for a workspace's live credentials."""
    suffix = workspace_env_key(client_id)
    return {
        "meta_page_access_token": f"META_LIVE_{suffix}_PAGE_ACCESS_TOKEN",
        "meta_page_id": f"META_LIVE_{suffix}_PAGE_ID",
        "meta_ig_user_id": f"META_LIVE_{suffix}_IG_USER_ID",
        "linkedin_access_token": f"LINKEDIN_LIVE_{suffix}_ACCESS_TOKEN",
        "linkedin_org_urn": f"LINKEDIN_LIVE_{suffix}_ORG_URN",
        "linkedin_person_urn": f"LINKEDIN_LIVE_{suffix}_PERSON_URN",
    }


def active_publish_env() -> PublishEnvironment:
    return _active_env


def set_active_publish_env(env: str, *, client_id: str | None = None) -> PublishEnvironment:
    global _active_env
    normalized = (env or "").strip().lower()
    if normalized not in PUBLISH_ENVIRONMENTS:
        raise ValueError("env must be 'test' or 'live'")
    if normalized == "live" and not live_env_configured(client_id=client_id):
        cid = resolve_client_id(client_id)
        if cid:
            names = live_env_var_names(cid)
            hint = (
                f"Add {names['meta_page_access_token']} / "
                f"{names['linkedin_access_token']} (etc.) to `.env`."
            )
        else:
            hint = "Pass a workspace client_id and add META_LIVE_<WORKSPACE>_* to `.env`."
        raise ValueError(f"Live publishing credentials are not configured. {hint}")
    _active_env = normalized  # type: ignore[assignment]
    return _active_env


@contextmanager
def using_publish_client(client_id: str | None) -> Iterator[None]:
    """Bind the workspace id used when resolving live credentials."""
    cid = (client_id or "").strip() or None
    token = _publish_client_id.set(cid)
    try:
        yield
    finally:
        _publish_client_id.reset(token)


def resolve_client_id(client_id: str | None = None) -> str | None:
    explicit = (client_id or "").strip() or None
    if explicit:
        return explicit
    return _publish_client_id.get()


def _global_live_meta_credentials() -> dict[str, str | None]:
    """Legacy fallback: process-wide META_LIVE_* (no workspace suffix)."""
    return {
        "page_access_token": _strip(os.getenv("META_LIVE_PAGE_ACCESS_TOKEN")),
        "page_id": _strip(os.getenv("META_LIVE_PAGE_ID")),
        "ig_user_id": _strip(os.getenv("META_LIVE_IG_USER_ID")),
    }


def _global_live_linkedin_credentials() -> dict[str, str | None]:
    """Legacy fallback: process-wide LINKEDIN_LIVE_* (no workspace suffix)."""
    return {
        "access_token": _strip(os.getenv("LINKEDIN_LIVE_ACCESS_TOKEN")),
        "org_urn": _strip(os.getenv("LINKEDIN_LIVE_ORG_URN")),
        "person_urn": _strip(os.getenv("LINKEDIN_LIVE_PERSON_URN")),
    }


def workspace_live_meta_credentials(client_id: str) -> dict[str, str | None]:
    names = live_env_var_names(client_id)
    return {
        "page_access_token": _strip(os.getenv(names["meta_page_access_token"])),
        "page_id": _strip(os.getenv(names["meta_page_id"])),
        "ig_user_id": _strip(os.getenv(names["meta_ig_user_id"])),
    }


def workspace_live_linkedin_credentials(client_id: str) -> dict[str, str | None]:
    names = live_env_var_names(client_id)
    return {
        "access_token": _strip(os.getenv(names["linkedin_access_token"])),
        "org_urn": _strip(os.getenv(names["linkedin_org_urn"])),
        "person_urn": _strip(os.getenv(names["linkedin_person_urn"])),
    }


def _prefer_filled(
    preferred: dict[str, str | None], fallback: dict[str, str | None]
) -> dict[str, str | None]:
    if any(preferred.values()):
        return preferred
    return fallback


def meta_credentials(
    env: PublishEnvironment | None = None,
    *,
    client_id: str | None = None,
) -> dict[str, str | None]:
    target = env or active_publish_env()
    if target == "live":
        cid = resolve_client_id(client_id)
        if cid:
            return _prefer_filled(
                workspace_live_meta_credentials(cid),
                _global_live_meta_credentials(),
            )
        return _global_live_meta_credentials()
    return {
        "page_access_token": _strip(os.getenv("META_PAGE_ACCESS_TOKEN"))
        or config.META_PAGE_ACCESS_TOKEN,
        "page_id": _strip(os.getenv("META_PAGE_ID")) or config.META_PAGE_ID,
        "ig_user_id": _strip(os.getenv("META_IG_USER_ID")) or config.META_IG_USER_ID,
    }


def linkedin_credentials(
    env: PublishEnvironment | None = None,
    *,
    client_id: str | None = None,
) -> dict[str, str | None]:
    target = env or active_publish_env()
    if target == "live":
        cid = resolve_client_id(client_id)
        if cid:
            return _prefer_filled(
                workspace_live_linkedin_credentials(cid),
                _global_live_linkedin_credentials(),
            )
        return _global_live_linkedin_credentials()
    return {
        "access_token": _strip(os.getenv("LINKEDIN_ACCESS_TOKEN"))
        or config.LINKEDIN_ACCESS_TOKEN,
        "org_urn": _strip(os.getenv("LINKEDIN_ORG_URN")) or config.LINKEDIN_ORG_URN,
        "person_urn": _strip(os.getenv("LINKEDIN_PERSON_URN")) or config.LINKEDIN_PERSON_URN,
    }


def is_facebook_connected(
    env: PublishEnvironment | None = None,
    *,
    client_id: str | None = None,
) -> bool:
    creds = meta_credentials(env, client_id=client_id)
    return bool(creds.get("page_access_token") and creds.get("page_id"))


def is_instagram_connected(
    env: PublishEnvironment | None = None,
    *,
    client_id: str | None = None,
) -> bool:
    creds = meta_credentials(env, client_id=client_id)
    return bool(creds.get("page_access_token") and creds.get("ig_user_id"))


def is_linkedin_connected(
    env: PublishEnvironment | None = None,
    *,
    client_id: str | None = None,
) -> bool:
    creds = linkedin_credentials(env, client_id=client_id)
    token = creds.get("access_token")
    org = creds.get("org_urn")
    person = creds.get("person_urn")
    return bool(token and (org or person))


def live_env_configured(*, client_id: str | None = None) -> bool:
    cid = resolve_client_id(client_id)
    return (
        is_facebook_connected("live", client_id=cid)
        or is_instagram_connected("live", client_id=cid)
        or is_linkedin_connected("live", client_id=cid)
    )


def env_availability(*, client_id: str | None = None) -> dict[str, bool]:
    cid = resolve_client_id(client_id)
    return {
        "test": (
            is_facebook_connected("test")
            or is_instagram_connected("test")
            or is_linkedin_connected("test")
        ),
        "live": live_env_configured(client_id=cid),
    }


def settings_payload(*, client_id: str | None = None) -> dict[str, Any]:
    cid = resolve_client_id(client_id)
    availability = env_availability(client_id=cid)
    active = active_publish_env()
    payload: dict[str, Any] = {
        "env": active,
        "availability": availability,
        "connected_platforms": connected_platform_keys(active, client_id=cid),
        "client_id": cid,
    }
    if cid:
        payload["live_env_vars"] = live_env_var_names(cid)
    return payload


def connected_platform_keys(
    env: PublishEnvironment | None = None,
    *,
    client_id: str | None = None,
) -> list[str]:
    target = env or active_publish_env()
    cid = resolve_client_id(client_id)
    out: list[str] = []
    if is_facebook_connected(target, client_id=cid):
        out.append("facebook")
    if is_instagram_connected(target, client_id=cid):
        out.append("instagram")
    if is_linkedin_connected(target, client_id=cid):
        out.append("linkedin")
    return out
