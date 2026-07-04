"""Meta (Facebook + Instagram) OAuth login and callback routes."""

from __future__ import annotations

import logging
import secrets
from urllib.parse import urlencode

import requests
from flask import Response, jsonify, redirect, request

from backend import config
from backend.api.blueprint import api_bp
from backend.integrations.token_store import persist_env_values

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v21.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"
FACEBOOK_OAUTH_URL = f"https://www.facebook.com/{GRAPH_API_VERSION}/dialog/oauth"

META_OAUTH_SCOPES = (
    "pages_show_list,pages_manage_posts,pages_read_engagement,"
    "instagram_basic,instagram_content_publish"
)

_oauth_states: dict[str, str] = {}


def _require_meta_oauth_config() -> None:
    if not config.META_APP_ID:
        raise RuntimeError(
            "META_APP_ID is not set. Add it to `.env` (see .env.example)."
        )
    if not config.META_APP_SECRET:
        raise RuntimeError(
            "META_APP_SECRET is not set. Add it to `.env` (see .env.example)."
        )
    if not config.META_REDIRECT_URI:
        raise RuntimeError(
            "META_REDIRECT_URI is not set. Add it to `.env` (see .env.example)."
        )


def _issue_state() -> str:
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = state
    return state


def _consume_state(state: str | None) -> bool:
    if not state or state not in _oauth_states:
        return False
    del _oauth_states[state]
    return True


def _graph_get(path: str, *, params: dict[str, str]) -> dict:
    url = f"{GRAPH_API_BASE}/{path.lstrip('/')}"
    try:
        response = requests.get(url, params=params, timeout=60)
        body = response.json()
    except requests.RequestException as exc:
        logger.exception("Meta OAuth Graph API GET %s failed", path)
        raise RuntimeError(f"Meta OAuth request failed for {path}") from exc
    except ValueError as exc:
        logger.exception("Meta OAuth Graph API GET %s returned invalid JSON", path)
        raise RuntimeError(f"Meta OAuth returned invalid JSON for {path}") from exc

    if not response.ok or (isinstance(body, dict) and "error" in body):
        err = body.get("error", {}) if isinstance(body, dict) else {}
        message = err.get("message") if isinstance(err, dict) else None
        detail = message or response.text or f"HTTP {response.status_code}"
        logger.warning("Meta OAuth Graph API GET %s error: %s", path, detail)
        raise RuntimeError(f"Meta OAuth error for {path}: {detail}")
    return body if isinstance(body, dict) else {}


def _fetch_pages(user_token: str) -> list[dict]:
    accounts_body = _graph_get(
        "me/accounts",
        params={"access_token": user_token},
    )
    pages = accounts_body.get("data")
    if not isinstance(pages, list) or not pages:
        raise RuntimeError("Meta OAuth returned no Facebook Pages for this account")
    valid_pages = [page for page in pages if isinstance(page, dict)]
    if not valid_pages:
        raise RuntimeError("Meta OAuth returned no Facebook Pages for this account")
    return valid_pages


def _resolve_page_credentials(page: dict) -> dict[str, str]:
    page_id = (page.get("id") or "").strip()
    page_access_token = (page.get("access_token") or "").strip()
    if not page_id or not page_access_token:
        raise RuntimeError("Meta OAuth Page entry did not include id and access_token")

    page_body = _graph_get(
        page_id,
        params={
            "fields": "instagram_business_account",
            "access_token": page_access_token,
        },
    )
    ig_account = page_body.get("instagram_business_account")
    ig_user_id = ""
    if isinstance(ig_account, dict):
        ig_user_id = (ig_account.get("id") or "").strip()
    if not ig_user_id:
        raise RuntimeError(
            "Connected Facebook Page does not have a linked Instagram business account"
        )

    return {
        "META_PAGE_ACCESS_TOKEN": page_access_token,
        "META_PAGE_ID": page_id,
        "META_IG_USER_ID": ig_user_id,
    }


def _find_page_by_id(pages: list[dict], page_id: str) -> dict | None:
    for page in pages:
        if (page.get("id") or "").strip() == page_id:
            return page
    return None


@api_bp.get("/auth/meta/login")
def meta_login():
    try:
        _require_meta_oauth_config()
    except RuntimeError as exc:
        return Response(str(exc), status=400, mimetype="text/plain")

    state = _issue_state()
    query = urlencode(
        {
            "client_id": config.META_APP_ID,
            "redirect_uri": config.META_REDIRECT_URI,
            "scope": META_OAUTH_SCOPES,
            "response_type": "code",
            "state": state,
        }
    )
    return redirect(f"{FACEBOOK_OAUTH_URL}?{query}", code=302)


@api_bp.get("/auth/meta/callback")
def meta_callback():
    state = request.args.get("state")
    if not _consume_state(state):
        return Response(
            "Invalid or missing OAuth state.",
            status=400,
            mimetype="text/plain",
        )

    code = (request.args.get("code") or "").strip()
    if not code:
        return Response(
            "Missing OAuth authorization code.",
            status=400,
            mimetype="text/plain",
        )

    try:
        _require_meta_oauth_config()
    except RuntimeError as exc:
        return Response(str(exc), status=400, mimetype="text/plain")

    try:
        short_lived = _graph_get(
            "oauth/access_token",
            params={
                "client_id": config.META_APP_ID or "",
                "client_secret": config.META_APP_SECRET or "",
                "redirect_uri": config.META_REDIRECT_URI or "",
                "code": code,
            },
        )
        short_token = (short_lived.get("access_token") or "").strip()
        if not short_token:
            raise RuntimeError("Meta OAuth code exchange did not return an access token")

        long_lived = _graph_get(
            "oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": config.META_APP_ID or "",
                "client_secret": config.META_APP_SECRET or "",
                "fb_exchange_token": short_token,
            },
        )
        user_token = (long_lived.get("access_token") or "").strip()
        if not user_token:
            raise RuntimeError(
                "Meta OAuth long-lived token exchange did not return an access token"
            )

        pages = _fetch_pages(user_token)
        configured_page_id = (config.META_PAGE_ID or "").strip()

        if configured_page_id:
            chosen = _find_page_by_id(pages, configured_page_id)
            if chosen is None:
                raise RuntimeError(
                    f"Configured META_PAGE_ID {configured_page_id!r} was not found "
                    "in the authorized Pages list"
                )
            creds = _resolve_page_credentials(chosen)
            persist_env_values(
                {
                    "META_USER_ACCESS_TOKEN": user_token,
                    **creds,
                }
            )
            return Response(
                "Meta OAuth succeeded. Page and Instagram credentials saved.",
                mimetype="text/plain",
            )

        if len(pages) == 1:
            creds = _resolve_page_credentials(pages[0])
            persist_env_values(
                {
                    "META_USER_ACCESS_TOKEN": user_token,
                    **creds,
                }
            )
            return Response(
                "Meta OAuth succeeded. Page and Instagram credentials saved.",
                mimetype="text/plain",
            )

        persist_env_values({"META_USER_ACCESS_TOKEN": user_token})
        page_lines = [
            f"{(page.get('id') or '').strip()} ({(page.get('name') or '').strip()})"
            for page in pages
        ]
        pages_list = ", ".join(page_lines)
        return Response(
            "Meta OAuth succeeded. User access token saved. "
            f"Multiple Pages found ({pages_list}). "
            "Select one via POST /auth/meta/select-page.",
            mimetype="text/plain",
        )
    except RuntimeError as exc:
        logger.warning("Meta OAuth callback failed: %s", exc)
        return Response(str(exc), status=400, mimetype="text/plain")


@api_bp.get("/auth/meta/pages")
def meta_list_pages():
    user_token = (config.META_USER_ACCESS_TOKEN or "").strip()
    if not user_token:
        return jsonify(
            detail="META_USER_ACCESS_TOKEN is not set. Complete OAuth login first."
        ), 400

    try:
        pages = _fetch_pages(user_token)
    except RuntimeError as exc:
        logger.warning("Meta page list failed: %s", exc)
        return jsonify(detail=str(exc)), 400

    return jsonify(
        [
            {
                "id": (page.get("id") or "").strip(),
                "name": (page.get("name") or "").strip(),
            }
            for page in pages
        ]
    )


@api_bp.post("/auth/meta/select-page")
def meta_select_page():
    body = request.get_json(silent=True) or {}
    page_id = (body.get("page_id") or "").strip()
    if not page_id:
        return jsonify(success=False, detail="page_id is required"), 400

    user_token = (config.META_USER_ACCESS_TOKEN or "").strip()
    if not user_token:
        return jsonify(
            success=False,
            detail="META_USER_ACCESS_TOKEN is not set. Complete OAuth login first.",
        ), 400

    try:
        pages = _fetch_pages(user_token)
    except RuntimeError as exc:
        logger.warning("Meta page selection failed: %s", exc)
        return jsonify(success=False, detail=str(exc)), 400

    chosen = _find_page_by_id(pages, page_id)
    if chosen is None:
        return jsonify(
            success=False,
            detail="page_id is not in the authorized Pages list",
        ), 400

    try:
        creds = _resolve_page_credentials(chosen)
    except RuntimeError as exc:
        logger.warning("Meta page selection failed: %s", exc)
        return jsonify(success=False, detail=str(exc)), 400

    persist_env_values(creds)
    return jsonify(
        success=True,
        page_id=creds["META_PAGE_ID"],
        ig_user_id=creds["META_IG_USER_ID"],
    )
