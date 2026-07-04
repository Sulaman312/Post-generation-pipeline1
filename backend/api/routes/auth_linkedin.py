"""LinkedIn OAuth login and callback routes."""

from __future__ import annotations

import logging
import secrets
from urllib.parse import urlencode

import requests
from flask import Response, jsonify, redirect, request

from backend import config
from backend.api.blueprint import api_bp
from backend.integrations.linkedin_api import LINKEDIN_API_BASE, LINKEDIN_API_VERSION
from backend.integrations.token_store import persist_env_values

logger = logging.getLogger(__name__)

LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_ACCESS_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_ORG_ACLS_URL = f"{LINKEDIN_API_BASE}/organizationAcls"
LINKEDIN_ORG_ACLS_QUERY = {
    "q": "roleAssignee",
    "role": "ADMINISTRATOR",
    "state": "APPROVED",
}

LINKEDIN_OAUTH_SCOPES = "openid profile w_organization_social"

_oauth_states: dict[str, str] = {}


def _require_linkedin_oauth_config(*, include_secret: bool = False) -> None:
    if not config.LINKEDIN_CLIENT_ID:
        raise RuntimeError(
            "LINKEDIN_CLIENT_ID is not set. Add it to `.env` (see .env.example)."
        )
    if not config.LINKEDIN_REDIRECT_URI:
        raise RuntimeError(
            "LINKEDIN_REDIRECT_URI is not set. Add it to `.env` (see .env.example)."
        )
    if include_secret and not config.LINKEDIN_CLIENT_SECRET:
        raise RuntimeError(
            "LINKEDIN_CLIENT_SECRET is not set. Add it to `.env` (see .env.example)."
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


def _linkedin_api_headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
    }


def _normalize_org_urn(raw: str) -> str:
    value = (raw or "").strip()
    if value.startswith("urn:li:organization:"):
        return value
    return f"urn:li:organization:{value}"


def _extract_org_urn_from_acl_element(element: dict) -> str:
    for key in ("organizationTarget", "organization"):
        raw = element.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
        if isinstance(raw, dict):
            urn = (raw.get("id") or raw.get("urn") or "").strip()
            if urn:
                return urn
    return ""


def _extract_org_name_from_acl_element(element: dict) -> str:
    for key in ("organization~", "organizationTarget~", "organization"):
        expanded = element.get(key)
        if isinstance(expanded, dict):
            name = (
                expanded.get("localizedName") or expanded.get("name") or ""
            ).strip()
            if name:
                return name
    return ""


def _fetch_admin_organization_acls(
    access_token: str, *, projection: str | None = None
) -> list[dict]:
    params = dict(LINKEDIN_ORG_ACLS_QUERY)
    if projection:
        params["projection"] = projection
    try:
        response = requests.get(
            LINKEDIN_ORG_ACLS_URL,
            headers=_linkedin_api_headers(access_token),
            params=params,
            timeout=60,
        )
        body = response.json()
    except requests.RequestException as exc:
        logger.exception("LinkedIn organizationAcls request failed")
        raise RuntimeError("LinkedIn organizationAcls request failed") from exc
    except ValueError as exc:
        logger.exception("LinkedIn organizationAcls returned invalid JSON")
        raise RuntimeError(
            "LinkedIn organizationAcls returned invalid JSON"
        ) from exc

    if not response.ok:
        detail = body if isinstance(body, dict) else response.text
        logger.warning("LinkedIn organizationAcls error: %s", detail)
        raise RuntimeError("LinkedIn organizationAcls request failed")

    elements = body.get("elements") if isinstance(body, dict) else None
    if not isinstance(elements, list):
        return []
    return [element for element in elements if isinstance(element, dict)]


def _fetch_admin_org_urns(access_token: str) -> list[str]:
    urns: list[str] = []
    seen: set[str] = set()
    for element in _fetch_admin_organization_acls(access_token):
        urn = _extract_org_urn_from_acl_element(element)
        if urn and urn not in seen:
            seen.add(urn)
            urns.append(urn)
    return urns


def _fetch_admin_organizations(access_token: str) -> list[dict[str, str]]:
    projection = "(elements*(organization~(localizedName)))"
    orgs: list[dict[str, str]] = []
    seen: set[str] = set()
    for element in _fetch_admin_organization_acls(
        access_token, projection=projection
    ):
        urn = _extract_org_urn_from_acl_element(element)
        if not urn or urn in seen:
            continue
        seen.add(urn)
        orgs.append(
            {
                "urn": urn,
                "name": _extract_org_name_from_acl_element(element),
            }
        )
    return orgs


@api_bp.get("/auth/linkedin/login")
def linkedin_login():
    try:
        _require_linkedin_oauth_config()
    except RuntimeError as exc:
        return Response(str(exc), status=400, mimetype="text/plain")

    state = _issue_state()
    query = urlencode(
        {
            "response_type": "code",
            "client_id": config.LINKEDIN_CLIENT_ID,
            "redirect_uri": config.LINKEDIN_REDIRECT_URI,
            "scope": LINKEDIN_OAUTH_SCOPES,
            "state": state,
        }
    )
    return redirect(f"{LINKEDIN_AUTHORIZE_URL}?{query}", code=302)


@api_bp.get("/auth/linkedin/callback")
def linkedin_callback():
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
        _require_linkedin_oauth_config(include_secret=True)
    except RuntimeError as exc:
        return Response(str(exc), status=400, mimetype="text/plain")

    try:
        try:
            token_response = requests.post(
                LINKEDIN_ACCESS_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": config.LINKEDIN_REDIRECT_URI or "",
                    "client_id": config.LINKEDIN_CLIENT_ID or "",
                    "client_secret": config.LINKEDIN_CLIENT_SECRET or "",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=60,
            )
            token_body = token_response.json()
        except requests.RequestException as exc:
            logger.exception("LinkedIn OAuth access token exchange failed")
            raise RuntimeError("LinkedIn OAuth access token exchange failed") from exc
        except ValueError as exc:
            logger.exception("LinkedIn OAuth access token exchange returned invalid JSON")
            raise RuntimeError(
                "LinkedIn OAuth access token exchange returned invalid JSON"
            ) from exc

        if not token_response.ok:
            detail = (
                token_body if isinstance(token_body, dict) else token_response.text
            )
            logger.warning("LinkedIn OAuth access token exchange error: %s", detail)
            raise RuntimeError("LinkedIn OAuth access token exchange failed")

        access_token = (
            token_body.get("access_token") if isinstance(token_body, dict) else ""
        )
        access_token = (access_token or "").strip()
        if not access_token:
            raise RuntimeError(
                "LinkedIn OAuth access token exchange did not return an access token"
            )

        persist_env_values({"LINKEDIN_ACCESS_TOKEN": access_token})
    except RuntimeError as exc:
        logger.warning("LinkedIn OAuth callback failed: %s", exc)
        return Response(str(exc), status=400, mimetype="text/plain")

    success_message = (
        "LinkedIn OAuth succeeded. Access token saved. "
        "Auto-discovery of admin organizations was unavailable; "
        "set LINKEDIN_ORG_URN manually or use POST /auth/linkedin/select-organization."
    )
    try:
        org_urns = _fetch_admin_org_urns(access_token)
        if len(org_urns) == 1:
            org_urn = org_urns[0]
            persist_env_values({"LINKEDIN_ORG_URN": org_urn})
            success_message = (
                f"LinkedIn OAuth succeeded. Organization {org_urn} saved."
            )
        elif len(org_urns) > 1:
            org_list = ", ".join(org_urns)
            success_message = (
                "LinkedIn OAuth succeeded. Access token saved. "
                f"Multiple organizations found ({org_list}). "
                "Select one via POST /auth/linkedin/select-organization."
            )
    except Exception:
        logger.exception("LinkedIn admin organization lookup failed")

    return Response(success_message, mimetype="text/plain")


@api_bp.get("/auth/linkedin/organizations")
def linkedin_list_organizations():
    access_token = (config.LINKEDIN_ACCESS_TOKEN or "").strip()
    if not access_token:
        return jsonify(
            detail="LINKEDIN_ACCESS_TOKEN is not set. Complete OAuth login first."
        ), 400

    try:
        organizations = _fetch_admin_organizations(access_token)
    except RuntimeError as exc:
        logger.warning("LinkedIn organization list failed: %s", exc)
        return jsonify(detail=str(exc)), 400

    return jsonify(organizations)


@api_bp.post("/auth/linkedin/select-organization")
def linkedin_select_organization():
    body = request.get_json(silent=True) or {}
    org_urn_raw = (body.get("org_urn") or "").strip()
    if not org_urn_raw:
        return jsonify(success=False, detail="org_urn is required"), 400

    access_token = (config.LINKEDIN_ACCESS_TOKEN or "").strip()
    if not access_token:
        return jsonify(
            success=False,
            detail="LINKEDIN_ACCESS_TOKEN is not set. Complete OAuth login first.",
        ), 400

    org_urn = _normalize_org_urn(org_urn_raw)
    try:
        organizations = _fetch_admin_organizations(access_token)
    except RuntimeError as exc:
        logger.warning("LinkedIn organization selection failed: %s", exc)
        return jsonify(success=False, detail=str(exc)), 400

    valid_urns = {_normalize_org_urn(item["urn"]) for item in organizations}
    if org_urn not in valid_urns:
        return jsonify(
            success=False,
            detail="org_urn is not in the authorized admin organization list",
        ), 400

    persist_env_values({"LINKEDIN_ORG_URN": org_urn})
    return jsonify(success=True, org_urn=org_urn)
