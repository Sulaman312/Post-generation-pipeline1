"""Meta Graph API — Facebook Page and Instagram publishing.

Environment (see repo `.env.example`):
  META_PAGE_ACCESS_TOKEN — required for all calls
  META_PAGE_ID           — required for Facebook + temp image hosting
  META_IG_USER_ID        — required for Instagram publishing
  META_APP_ID            — optional (OAuth setup; not used by publish helpers yet)
  META_APP_SECRET        — optional (OAuth setup; not used by publish helpers yet)
"""

from __future__ import annotations

import io
import logging
import mimetypes
import time
from pathlib import Path

import requests
from PIL import Image

from .. import publish_env

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v21.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

_client: requests.Session | None = None


def _meta_creds() -> dict[str, str | None]:
    return publish_env.meta_credentials()


def _page_access_token() -> str:
    token = (_meta_creds().get("page_access_token") or "").strip()
    if not token:
        env = publish_env.active_publish_env()
        prefix = "META_LIVE_" if env == "live" else "META_"
        raise RuntimeError(
            f"{prefix}PAGE_ACCESS_TOKEN is not set for {env} publishing. "
            "Add it to `.env` (see .env.example)."
        )
    return token


def _get_client() -> requests.Session:
    global _client
    if _client is None:
        _page_access_token()
        _client = requests.Session()
    return _client


def _require_page_id() -> str:
    page_id = (_meta_creds().get("page_id") or "").strip()
    if not page_id:
        env = publish_env.active_publish_env()
        prefix = "META_LIVE_" if env == "live" else "META_"
        raise RuntimeError(
            f"{prefix}PAGE_ID is not set for {env} publishing. "
            "Add it to `.env` (see .env.example)."
        )
    return page_id


def _require_ig_user_id() -> str:
    ig_user_id = (_meta_creds().get("ig_user_id") or "").strip()
    if not ig_user_id:
        env = publish_env.active_publish_env()
        prefix = "META_LIVE_" if env == "live" else "META_"
        raise RuntimeError(
            f"{prefix}IG_USER_ID is not set for {env} publishing. "
            "Add it to `.env` (see .env.example)."
        )
    return ig_user_id


def _read_image(image_path: str) -> tuple[str, bytes, str]:
    path = Path(image_path)
    if not path.is_file():
        raise RuntimeError(f"Image file not found: {image_path}")
    data = path.read_bytes()
    if not data:
        raise RuntimeError(f"Image file is empty: {image_path}")
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return path.name, data, content_type


def _read_image_as_jpeg(image_path: str) -> tuple[str, bytes, str]:
    _filename, raw_bytes, _content_type = _read_image(image_path)
    path = Path(image_path)
    jpeg_filename = f"{path.stem}.jpg"

    with Image.open(io.BytesIO(raw_bytes)) as img:
        needs_flatten = img.mode in ("RGBA", "LA", "PA") or (
            img.mode == "P" and "transparency" in img.info
        )
        if needs_flatten:
            rgba = img.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.split()[3])
            rgb = background
        else:
            rgb = img.convert("RGB")

        buffer = io.BytesIO()
        rgb.save(buffer, format="JPEG", quality=92)
        jpeg_bytes = buffer.getvalue()

    return jpeg_filename, jpeg_bytes, "image/jpeg"


def _graph_post(
    session: requests.Session,
    path: str,
    *,
    data: dict[str, str] | None = None,
    files: dict[str, tuple[str, bytes, str]] | None = None,
    timeout: int = 120,
) -> dict:
    url = f"{GRAPH_API_BASE}/{path.lstrip('/')}"
    payload = dict(data or {})
    payload["access_token"] = _page_access_token()
    try:
        response = session.post(url, data=payload, files=files, timeout=timeout)
        body = response.json()
    except requests.RequestException as exc:
        logger.exception("Meta Graph API POST %s failed", path)
        raise RuntimeError(f"Meta Graph API request failed for {path}: {exc}") from exc
    except ValueError as exc:
        logger.exception("Meta Graph API POST %s returned invalid JSON", path)
        raise RuntimeError(
            f"Meta Graph API returned invalid JSON for {path}"
        ) from exc

    if not response.ok or "error" in body:
        err = body.get("error", {}) if isinstance(body, dict) else {}
        message = err.get("message") if isinstance(err, dict) else None
        detail = message or response.text or f"HTTP {response.status_code}"
        logger.warning("Meta Graph API POST %s error: %s", path, detail)
        raise RuntimeError(f"Meta Graph API error for {path}: {detail}")
    return body if isinstance(body, dict) else {}


def _graph_get(
    session: requests.Session,
    path: str,
    *,
    params: dict[str, str] | None = None,
    timeout: int = 60,
) -> dict:
    url = f"{GRAPH_API_BASE}/{path.lstrip('/')}"
    query = dict(params or {})
    query["access_token"] = _page_access_token()
    try:
        response = session.get(url, params=query, timeout=timeout)
        body = response.json()
    except requests.RequestException as exc:
        logger.exception("Meta Graph API GET %s failed", path)
        raise RuntimeError(f"Meta Graph API request failed for {path}: {exc}") from exc
    except ValueError as exc:
        logger.exception("Meta Graph API GET %s returned invalid JSON", path)
        raise RuntimeError(
            f"Meta Graph API returned invalid JSON for {path}"
        ) from exc

    if not response.ok or "error" in body:
        err = body.get("error", {}) if isinstance(body, dict) else {}
        message = err.get("message") if isinstance(err, dict) else None
        detail = message or response.text or f"HTTP {response.status_code}"
        logger.warning("Meta Graph API GET %s error: %s", path, detail)
        raise RuntimeError(f"Meta Graph API error for {path}: {detail}")
    return body if isinstance(body, dict) else {}


def _photo_hosted_url(session: requests.Session, photo_id: str) -> str:
    body = _graph_get(session, photo_id, params={"fields": "images"})
    images = body.get("images")
    if not isinstance(images, list) or not images:
        raise RuntimeError(
            f"Meta Graph API photo {photo_id} did not return hosted image URLs"
        )
    best = max(images, key=lambda item: int(item.get("width") or 0))
    url = (best.get("source") or "").strip()
    if not url:
        raise RuntimeError(
            f"Meta Graph API photo {photo_id} returned images without a source URL"
        )
    return url


def _get_public_image_url(image_path: str) -> str:
    # TEMPORARY for testing: uploads the image to the Page as an unpublished photo
    # (published=false) via POST /{page-id}/photos and returns Meta's hosted url
    # from the response. Replace this function's internals with real object storage
    # (S3/R2/Cloudinary) before production — nothing else in this file should need
    # to change when that happens.
    session = _get_client()
    page_id = _require_page_id()
    filename, image_bytes, content_type = _read_image_as_jpeg(image_path)
    body = _graph_post(
        session,
        f"{page_id}/photos",
        data={"published": "false"},
        files={"source": (filename, image_bytes, content_type)},
    )
    photo_id = (body.get("id") or "").strip()
    if not photo_id:
        raise RuntimeError(
            "Meta Graph API unpublished photo upload did not return a photo id"
        )
    return _photo_hosted_url(session, photo_id)


def publish_facebook_post(image_path: str, caption: str) -> str:
    """Upload image + caption to the Facebook Page; return the post id."""
    session = _get_client()
    page_id = _require_page_id()
    filename, image_bytes, content_type = _read_image_as_jpeg(image_path)
    body = _graph_post(
        session,
        f"{page_id}/photos",
        data={"caption": (caption or "").strip(), "published": "true"},
        files={"source": (filename, image_bytes, content_type)},
    )
    post_id = (body.get("post_id") or body.get("id") or "").strip()
    if not post_id:
        raise RuntimeError(
            "Meta Graph API Facebook photo publish did not return a post id"
        )
    return post_id


def publish_instagram_post(image_path: str, caption: str) -> str:
    """Create, poll, and publish an Instagram media container; return media id."""
    session = _get_client()
    ig_user_id = _require_ig_user_id()
    image_url = _get_public_image_url(image_path)

    create_body = _graph_post(
        session,
        f"{ig_user_id}/media",
        data={
            "image_url": image_url,
            "caption": (caption or "").strip(),
        },
    )
    container_id = (create_body.get("id") or "").strip()
    if not container_id:
        raise RuntimeError(
            "Meta Graph API Instagram media creation did not return a container id"
        )

    status_code = ""
    for poll in range(5):
        status_body = _graph_get(
            session,
            container_id,
            params={"fields": "status_code"},
        )
        status_code = (status_body.get("status_code") or "").strip().upper()
        if status_code == "FINISHED":
            break
        if status_code in {"ERROR", "EXPIRED"}:
            raise RuntimeError(
                f"Instagram media container {container_id} failed with status "
                f"{status_code!r}"
            )
        if poll < 4:
            time.sleep(60)
    else:
        raise RuntimeError(
            f"Instagram media container {container_id} did not finish after 5 polls "
            f"(last status {status_code!r})"
        )

    publish_body = _graph_post(
        session,
        f"{ig_user_id}/media_publish",
        data={"creation_id": container_id},
    )
    media_id = (publish_body.get("id") or "").strip()
    if not media_id:
        raise RuntimeError(
            "Meta Graph API Instagram media_publish did not return a media id"
        )
    return media_id
