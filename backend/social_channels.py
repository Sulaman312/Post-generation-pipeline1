"""Platform export sizes for the social media pipeline."""

from __future__ import annotations

SOCIAL_CHANNELS: tuple[dict[str, str | int], ...] = (
    {
        "key": "instagram",
        "label": "Instagram",
        "filename": "ig_1080x1350.png",
        "width": 1080,
        "height": 1350,
    },
    {
        "key": "linkedin",
        "label": "LinkedIn",
        "filename": "li_1200x628.png",
        "width": 1200,
        "height": 628,
    },
    {
        "key": "facebook",
        "label": "Facebook",
        "filename": "fb_1200x630.png",
        "width": 1200,
        "height": 630,
    },
)

CHANNEL_BY_KEY = {str(c["key"]): c for c in SOCIAL_CHANNELS}
