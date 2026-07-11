"""App login users and sessions stored in MongoDB."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from werkzeug.security import check_password_hash, generate_password_hash

from . import config, mongo_storage

logger = logging.getLogger(__name__)

USERS_COLLECTION = "app_users"
SESSIONS_COLLECTION = "app_sessions"

DEFAULT_USERNAME = "sulaman312"
DEFAULT_PASSWORD = "admin123"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _require_db():
    db = mongo_storage.database()
    if db is None:
        raise RuntimeError(
            "Authentication requires MongoDB. Set MONGODB_URI in your environment."
        )
    return db


def _users():
    db = _require_db()
    col = db[USERS_COLLECTION]
    col.create_index("username", unique=True)
    return col


def _sessions():
    db = _require_db()
    col = db[SESSIONS_COLLECTION]
    col.create_index("token", unique=True)
    col.create_index("expires_at", expireAfterSeconds=0)
    return col


def ensure_default_user(
    username: str = DEFAULT_USERNAME,
    password: str = DEFAULT_PASSWORD,
) -> None:
    """Create the default admin user when missing."""
    if not config.AUTH_ENABLED or not mongo_storage.enabled():
        return
    try:
        col = _users()
    except RuntimeError:
        logger.warning("Skipping default user seed: MongoDB is not configured")
        return

    uname = str(username or "").strip().lower()
    if not uname:
        return

    existing = col.find_one({"username": uname}, {"_id": 1})
    if existing:
        return

    ts = _now()
    col.insert_one(
        {
            "username": uname,
            "password_hash": generate_password_hash(password),
            "created_at": ts,
            "updated_at": ts,
            "last_login_at": None,
        }
    )
    logger.info("Seeded default app user %r in MongoDB", uname)


def authenticate(username: str, password: str) -> dict[str, Any] | None:
    uname = str(username or "").strip().lower()
    if not uname or not password:
        return None
    row = _users().find_one({"username": uname})
    if not row:
        return None
    if not check_password_hash(str(row.get("password_hash") or ""), password):
        return None
    _users().update_one(
        {"username": uname},
        {"$set": {"last_login_at": _now(), "updated_at": _now()}},
    )
    return {"username": uname}


def create_session(username: str) -> dict[str, Any]:
    uname = str(username or "").strip().lower()
    token = secrets.token_urlsafe(32)
    created = _now()
    expires = created + timedelta(days=max(1, int(config.AUTH_SESSION_DAYS)))
    _sessions().insert_one(
        {
            "token": token,
            "username": uname,
            "created_at": created,
            "expires_at": expires,
        }
    )
    return {
        "token": token,
        "username": uname,
        "expires_at": expires.isoformat(),
    }


def delete_session(token: str) -> None:
    if not token:
        return
    _sessions().delete_one({"token": token})


def user_from_token(token: str) -> dict[str, Any] | None:
    raw = str(token or "").strip()
    if not raw:
        return None
    row = _sessions().find_one({"token": raw})
    if not row:
        return None
    expires = row.get("expires_at")
    if isinstance(expires, datetime) and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if isinstance(expires, datetime) and expires <= _now():
        _sessions().delete_one({"token": raw})
        return None
    username = str(row.get("username") or "").strip().lower()
    if not username:
        return None
    if not _users().find_one({"username": username}, {"_id": 1}):
        return None
    return {"username": username}


def bearer_token_from_request(request) -> str | None:
    auth = str(request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def resolve_request_user(request) -> dict[str, Any] | None:
    if not config.AUTH_ENABLED:
        return {"username": "anonymous"}
    try:
        token = bearer_token_from_request(request)
        if not token:
            return None
        return user_from_token(token)
    except RuntimeError:
        return None
