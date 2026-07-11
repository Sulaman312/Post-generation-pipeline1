"""Application login, session, and route protection."""

from flask import g, jsonify, make_response, request

from backend import auth_store, config
from backend.api.blueprint import api_bp


def _public_path(path: str, method: str) -> bool:
    if path == "/health" or path == "/api":
        return True
    if path == "/auth/login" and method == "POST":
        return True
    if path.startswith("/auth/meta") or path.startswith("/auth/linkedin"):
        return True
    return False


def _session_cookie_kwargs() -> dict:
    forwarded = (request.headers.get("X-Forwarded-Proto") or "").strip().lower()
    secure = config.AUTH_COOKIE_SECURE or request.is_secure or forwarded == "https"
    return {
        "httponly": True,
        "secure": secure,
        "samesite": config.AUTH_COOKIE_SAMESITE,
        "max_age": max(1, int(config.AUTH_SESSION_DAYS)) * 86400,
        "path": "/",
    }


@api_bp.before_request
def require_app_login():
    if not config.AUTH_ENABLED:
        g.current_user = {"username": "anonymous"}
        return None
    if request.method == "OPTIONS":
        return None
    path = request.path or ""
    if _public_path(path, request.method):
        return None
    user = auth_store.resolve_request_user(request)
    if not user:
        return jsonify(detail="Authentication required"), 401
    g.current_user = user
    return None


@api_bp.post("/auth/login")
def app_login():
    if not config.AUTH_ENABLED:
        return jsonify(detail="Authentication is disabled"), 503
    body = request.get_json(silent=True) or {}
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    if not username or not password:
        return jsonify(detail="Username and password are required"), 400
    try:
        user = auth_store.authenticate(username, password)
    except RuntimeError as exc:
        return jsonify(detail=str(exc)), 503
    if not user:
        return jsonify(detail="Invalid username or password"), 401
    session = auth_store.create_session(user["username"])
    resp = make_response(
        jsonify(
            token=session["token"],
            user={"username": session["username"]},
            expires_at=session["expires_at"],
        )
    )
    resp.set_cookie(config.AUTH_COOKIE_NAME, session["token"], **_session_cookie_kwargs())
    return resp


@api_bp.get("/auth/me")
def app_me():
    user = getattr(g, "current_user", None)
    if not user:
        return jsonify(detail="Authentication required"), 401
    return jsonify(user={"username": user["username"]})


@api_bp.post("/auth/logout")
def app_logout():
    token = auth_store.session_token_from_request(request)
    if token:
        try:
            auth_store.delete_session(token)
        except RuntimeError as exc:
            return jsonify(detail=str(exc)), 503
    resp = make_response(jsonify(ok=True))
    resp.delete_cookie(config.AUTH_COOKIE_NAME, path="/")
    return resp
