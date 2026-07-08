"""LinkedIn Community Management API — image post publishing to an ORGANIZATION Page.

Credentials:
  Test — ``.env`` LINKEDIN_ACCESS_TOKEN / LINKEDIN_ORG_URN (or PERSON_URN)
  Live — ``.env`` LINKEDIN_LIVE_<WORKSPACE>_ACCESS_TOKEN / _ORG_URN / _PERSON_URN
         (optional legacy fallback: LINKEDIN_LIVE_* without workspace)
"""

from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

import requests

from .. import publish_env

logger = logging.getLogger(__name__)

LINKEDIN_API_BASE = "https://api.linkedin.com/rest"
LINKEDIN_API_VERSION = "202606"

_client: requests.Session | None = None


def _linkedin_creds() -> dict[str, str | None]:
    return publish_env.linkedin_credentials()


def _missing_live_hint() -> str:
    cid = publish_env.resolve_client_id()
    if cid:
        names = publish_env.live_env_var_names(cid)
        return (
            f"Set {names['linkedin_access_token']} and "
            f"{names['linkedin_org_urn']} (or {names['linkedin_person_urn']}) in `.env`."
        )
    return (
        "Pass a workspace client_id, or set LINKEDIN_LIVE_* in `.env` "
        "as a temporary fallback."
    )


def _access_token() -> str:
    token = (_linkedin_creds().get("access_token") or "").strip()
    if not token:
        env = publish_env.active_publish_env()
        if env == "live":
            raise RuntimeError(
                f"Live LinkedIn access token is not set. {_missing_live_hint()}"
            )
        raise RuntimeError(
            "LINKEDIN_ACCESS_TOKEN is not set for test publishing. "
            "Add it to `.env` (see .env.example)."
        )
    return token


def _get_client() -> requests.Session:
    global _client
    if _client is None:
        _access_token()
        creds = _linkedin_creds()
        if not (creds.get("org_urn") or creds.get("person_urn")):
            env = publish_env.active_publish_env()
            if env == "live":
                raise RuntimeError(
                    f"Live LinkedIn org_urn or person_urn is required. "
                    f"{_missing_live_hint()}"
                )
            raise RuntimeError(
                "LINKEDIN_ORG_URN or LINKEDIN_PERSON_URN is required for test publishing. "
                "Add it to `.env` (see .env.example)."
            )
        _client = requests.Session()
    return _client


def _author_urn() -> str:
    creds = _linkedin_creds()
    org = (creds.get("org_urn") or "").strip()
    if org:
        if org.startswith("urn:li:organization:"):
            return org
        return f"urn:li:organization:{org}"
    person = (creds.get("person_urn") or "").strip()
    if person:
        if person.startswith("urn:li:person:"):
            return person
        return f"urn:li:person:{person}"
    env = publish_env.active_publish_env()
    if env == "live":
        raise RuntimeError(
            f"Live LinkedIn org_urn or person_urn is not set. {_missing_live_hint()}"
        )
    raise RuntimeError(
        "LINKEDIN_ORG_URN or LINKEDIN_PERSON_URN is not set for test publishing."
    )


def _linkedin_headers(*, json_content: bool = True) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {_access_token()}",
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
    }
    if json_content:
        headers["Content-Type"] = "application/json"
    return headers


def _read_image(image_path: str) -> tuple[bytes, str]:
    path = Path(image_path)
    if not path.is_file():
        raise RuntimeError(f"Image file not found: {image_path}")
    data = path.read_bytes()
    if not data:
        raise RuntimeError(f"Image file is empty: {image_path}")
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return data, content_type


def publish_linkedin_post(image_path: str, caption: str) -> str:
    """Register image upload, PUT binary, create post; return post URN."""
    session = _get_client()
    author = _author_urn()
    image_bytes, content_type = _read_image(image_path)

    init_url = f"{LINKEDIN_API_BASE}/images?action=initializeUpload"
    init_payload = {"initializeUploadRequest": {"owner": author}}
    try:
        init_response = session.post(
            init_url,
            headers=_linkedin_headers(),
            json=init_payload,
            timeout=60,
        )
        init_body = init_response.json()
    except requests.RequestException as exc:
        logger.exception("LinkedIn image initializeUpload failed")
        raise RuntimeError(
            f"LinkedIn image upload registration failed: {exc}"
        ) from exc
    except ValueError as exc:
        logger.exception("LinkedIn image initializeUpload returned invalid JSON")
        raise RuntimeError(
            "LinkedIn image upload registration returned invalid JSON"
        ) from exc

    if not init_response.ok:
        detail = init_body if isinstance(init_body, dict) else init_response.text
        logger.warning("LinkedIn image initializeUpload error: %s", detail)
        raise RuntimeError(
            f"LinkedIn image upload registration failed: {detail}"
        )

    value = init_body.get("value") if isinstance(init_body, dict) else None
    if not isinstance(value, dict):
        raise RuntimeError(
            "LinkedIn image upload registration did not return a value object"
        )
    upload_url = (value.get("uploadUrl") or "").strip()
    image_urn = (value.get("image") or "").strip()
    if not upload_url or not image_urn:
        raise RuntimeError(
            "LinkedIn image upload registration did not return uploadUrl and image URN"
        )

    try:
        upload_response = session.put(
            upload_url,
            data=image_bytes,
            headers={
                "Authorization": f"Bearer {_access_token()}",
                "Content-Type": content_type,
            },
            timeout=120,
        )
    except requests.RequestException as exc:
        logger.exception("LinkedIn image binary upload failed")
        raise RuntimeError(f"LinkedIn image binary upload failed: {exc}") from exc

    if not upload_response.ok:
        detail = upload_response.text or f"HTTP {upload_response.status_code}"
        logger.warning("LinkedIn image binary upload error: %s", detail)
        raise RuntimeError(f"LinkedIn image binary upload failed: {detail}")

    post_payload = {
        "author": author,
        "commentary": (caption or "").strip(),
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "content": {
            "media": {
                "id": image_urn,
            }
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    posts_url = f"{LINKEDIN_API_BASE}/posts"
    try:
        post_response = session.post(
            posts_url,
            headers=_linkedin_headers(),
            json=post_payload,
            timeout=60,
        )
        post_body = post_response.json() if post_response.content else {}
    except requests.RequestException as exc:
        logger.exception("LinkedIn post creation failed")
        raise RuntimeError(f"LinkedIn post creation failed: {exc}") from exc
    except ValueError as exc:
        logger.exception("LinkedIn post creation returned invalid JSON")
        raise RuntimeError("LinkedIn post creation returned invalid JSON") from exc

    if not post_response.ok:
        detail = post_body if isinstance(post_body, dict) else post_response.text
        logger.warning("LinkedIn post creation error: %s", detail)
        raise RuntimeError(f"LinkedIn post creation failed: {detail}")

    post_urn = ""
    if isinstance(post_body, dict):
        post_urn = (post_body.get("id") or "").strip()
    if not post_urn:
        post_urn = (post_response.headers.get("x-restli-id") or "").strip()
    if not post_urn:
        raise RuntimeError("LinkedIn post creation did not return a post URN")
    return post_urn
