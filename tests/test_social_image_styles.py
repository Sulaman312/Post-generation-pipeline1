"""Tests for client image prompt parsing (Step 3 → Step 4)."""

from backend.social_image_styles import parse_style_prompts

SIMONETTI_OUTPUT = """\
1. Content angle / caption idea
A glass railing protects without visually interrupting the architecture. Designed to secure
staircases, mezzanines and open voids, it preserves natural light and spatial clarity.

2. Full image-generation prompt
Ultra-realistic luxury architectural interior photography of a high-end residential staircase
with a custom frameless glass railing. Warm beige and travertine tones, matte black fixtures,
soft natural daylight, editorial magazine quality, no people, no clutter.

3. Alternate camera angle / variation
Close-up detail shot from the side of the staircase, focusing on the glass edge and matte
black fixing hardware. Keep the background softly blurred to emphasize craftsmanship.
"""

MARKDOWN_OUTPUT = """\
## Caption angle
Professional caption about glass railings and safety.

## Primary image prompt
Ultra-realistic luxury interior with frameless glass railing, warm neutrals, soft daylight.

## Alternate image prompt
Close-up detail of glass edge and hardware with shallow depth of field.
"""


def test_parse_numbered_client_prompts():
    styles = parse_style_prompts(SIMONETTI_OUTPUT)
    assert len(styles) == 2
    assert styles[0]["style_key"] == "primary"
    assert "frameless glass railing" in styles[0]["prompt"]
    assert styles[1]["style_key"] == "alternate"
    assert "Close-up detail" in styles[1]["prompt"]


def test_parse_markdown_client_prompts():
    styles = parse_style_prompts(MARKDOWN_OUTPUT)
    assert len(styles) == 2
    assert styles[0]["style_key"] == "primary"
    assert "frameless glass" in styles[0]["prompt"]
    assert styles[1]["style_key"] == "alternate"
