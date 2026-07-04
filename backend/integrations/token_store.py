"""Persist OAuth tokens to `.env` and in-memory config."""

from __future__ import annotations

from dotenv import set_key

from backend import config


# TEMPORARY for single test-account setup: writes tokens into the shared .env file.
# Before onboarding real clients, replace this with per-client token storage (e.g. a row
# per client, not a shared file) — nothing in auth_meta.py/auth_linkedin.py should need
# to change when that happens, only this function.
def persist_env_values(values: dict[str, str]) -> None:
    env_path = config.REPO_ROOT / ".env"
    for key, value in values.items():
        set_key(str(env_path), key, value)
        setattr(config, key, (value or "").strip() or None)
