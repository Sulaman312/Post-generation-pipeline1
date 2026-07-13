#!/usr/bin/env python3
"""Rename an app login user in MongoDB."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import mongo_storage  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Rename an app_users login.")
    parser.add_argument("--from", dest="old_name", required=True)
    parser.add_argument("--to", dest="new_name", required=True)
    args = parser.parse_args()

    old = str(args.old_name or "").strip().lower()
    new = str(args.new_name or "").strip().lower()
    if not old or not new:
        parser.error("Both usernames are required")

    db = mongo_storage.database()
    if db is None:
        parser.error("MONGODB_URI is not set or MongoDB is unavailable")

    users = db["app_users"]
    sessions = db["app_sessions"]

    old_user = users.find_one({"username": old})
    new_user = users.find_one({"username": new})

    if old_user and new_user and str(old_user["_id"]) != str(new_user["_id"]):
        parser.error(f"Cannot rename: user {new!r} already exists")

    now = datetime.now(timezone.utc)
    if old_user:
        users.update_one(
            {"username": old},
            {"$set": {"username": new, "updated_at": now}},
        )
        print(f"Updated app_users: {old!r} -> {new!r}")
    elif new_user:
        print(f"User already named {new!r}")
    else:
        print(f"No user {old!r} found in app_users")
        return 1

    sess = sessions.update_many({"username": old}, {"$set": {"username": new}})
    print(f"Updated app_sessions: {sess.modified_count} session(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
