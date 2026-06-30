"""OpenAI Chat Completions — social media pipeline text steps.

Environment (see repo `env.example`):
  OPENAI_API_KEY      — required
  OPENAI_CHAT_MODEL   — default `gpt-4o-mini`
  MAX_TOKENS          — max output tokens (config.py)
  TEMPERATURE         — sampling temperature (config.py)
"""

from __future__ import annotations

import logging
import time

from .. import config

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        if not config.OPENAI_API_KEY:
            raise RuntimeError(
                "OPENAI_API_KEY is not set. Add it to `.env` (see env.example)."
            )
        try:
            from openai import OpenAI
        except ImportError as e:
            raise RuntimeError(
                "openai package not installed. Run: pip install openai"
            ) from e
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def chat_complete(
    system_msg: str,
    user_msg: str,
    *,
    step_label: str = "pipeline step",
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> str:
    """Call OpenAI chat with system + user messages; retry once after 3s on failure."""
    client = _get_client()
    model = config.OPENAI_CHAT_MODEL
    max_tok = max_tokens if max_tokens is not None else config.MAX_TOKENS
    temp = temperature if temperature is not None else config.TEMPERATURE

    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            response = client.chat.completions.create(
                model=model,
                max_tokens=max_tok,
                temperature=temp,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
            )
            choice = response.choices[0] if response.choices else None
            raw = (choice.message.content if choice and choice.message else "") or ""
            raw = raw.strip()
            if not raw:
                raise ValueError("OpenAI returned empty content")
            return raw
        except Exception as e:
            last_exc = e
            logger.warning(
                "%s: OpenAI chat attempt %s failed: %s",
                step_label,
                attempt + 1,
                e,
            )
            if attempt == 0:
                time.sleep(3)
            else:
                raise RuntimeError(
                    f"OpenAI chat call failed after retry for {step_label}"
                ) from last_exc
    raise AssertionError("unreachable")
