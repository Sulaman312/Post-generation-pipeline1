"""OpenAI Images API integration for social media pipeline."""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from urllib.request import urlopen

from .. import config

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GeneratedImage:
    filename: str
    data: bytes


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


def generate_images(prompt: str, *, n: int, model: str | None = None) -> list[bytes]:
    """Return raw bytes for `n` PNG images generated from `prompt`."""
    p = (prompt or "").strip()
    if not p:
        raise ValueError("prompt is required")
    if n < 1 or n > 8:
        raise ValueError("n must be between 1 and 8")

    client = _get_client()
    m = (model or config.OPENAI_IMAGE_MODEL or "").strip() or "gpt-image-1"
    # Use a square master image; Step 6 will crop/resize to IG/LinkedIn formats.
    # The exact size tokens can be adjusted if the model requires a different enum.
    def _call(model_name: str):
        return client.images.generate(model=model_name, prompt=p, n=n, size="1024x1024")

    try:
        # Some OpenAI image models / gateways reject `response_format`. We omit it
        # and accept either base64 or URL responses.
        resp = _call(m)
    except Exception as e:
        msg = str(e)
        # If the configured model is invalid, automatically fall back to a known images model.
        if "does not exist" in msg or "invalid_value" in msg or "model" in msg.lower():
            fallback = "gpt-image-1"
            if m != fallback:
                logger.warning("OpenAI image model %r invalid; falling back to %r", m, fallback)
                try:
                    resp = _call(fallback)
                except Exception as e2:
                    logger.exception("OpenAI image generation failed (fallback)")
                    raise RuntimeError(
                        f"OpenAI image generation failed (model {m!r} then {fallback!r}): {e2}"
                    ) from e2
            else:
                logger.exception("OpenAI image generation failed")
                raise RuntimeError(f"OpenAI image generation failed: {e}") from e
        else:
            logger.exception("OpenAI image generation failed")
            raise RuntimeError(f"OpenAI image generation failed: {e}") from e

    out: list[bytes] = []
    data = getattr(resp, "data", None)
    if not data:
        raise RuntimeError("OpenAI returned no images")
    for item in data:
        b64 = getattr(item, "b64_json", None)
        if isinstance(b64, str) and b64.strip():
            try:
                out.append(base64.b64decode(b64))
                continue
            except Exception:
                pass
        url = getattr(item, "url", None)
        if isinstance(url, str) and url.strip().startswith("http"):
            try:
                with urlopen(url.strip(), timeout=120) as resp2:
                    out.append(resp2.read())
                continue
            except Exception:
                pass
    if len(out) == 0:
        raise RuntimeError("OpenAI returned no usable image data (no base64/url)")
    return out

