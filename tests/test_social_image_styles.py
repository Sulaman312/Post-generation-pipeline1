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
    assert styles[0]["style_key"] == "variation_1"
    assert "frameless glass" in styles[0]["prompt"]
    assert styles[1]["style_key"] == "variation_2"


def test_parse_numbered_variation_blocks():
    markdown = """\
## Caption angle
Caption text here.

**Variation 1: CLOSE-UP DETAIL SHOT**
Intimate close-up of two hands gently clasped together.

**Variation 2: WIDER ENVIRONMENTAL SHOT**
Peaceful room with a wooden table and a lit candle.

**Variation 4: WIDER ENVIRONMENTAL SHOT**
Majestic tree in a serene outdoor setting.
"""
    styles = parse_style_prompts(markdown)
    assert len(styles) == 3
    assert styles[0]["style_key"] == "variation_1"
    assert styles[1]["style_key"] == "variation_2"
    assert styles[2]["style_key"] == "variation_4"
    assert "hands gently clasped" in styles[0]["prompt"]


def test_parse_preset_sections_skips_removed_styles():
    markdown = """\
## Photorealistic scene
Scene one prompt.

## Close-up detail
Scene two prompt.

## Environmental wide
Scene three prompt.
"""
    styles = parse_style_prompts(markdown)
    assert len(styles) == 3
    assert {s["style_key"] for s in styles} == {
        "photorealistic",
        "close_up_detail",
        "environmental_wide",
    }


def test_parse_multiple_client_variations():
    markdown = """\
## Caption angle
Caption text here.

## Primary image prompt (Variation 1 - WIDE EQUIPMENT SHOT)
Wide shot prompt one.

## Alternate image prompt (Variation 2 - HUMAN TRUST SHOT)
Human shot prompt two.

## Primary image prompt (Variation 3 - WIDE EQUIPMENT SHOT)
Wide shot prompt three.

## Alternate image prompt (Variation 4 - HUMAN TRUST SHOT)
Human shot prompt four.
"""
    styles = parse_style_prompts(markdown)
    assert len(styles) == 4
    assert styles[0]["prompt"] == "Wide shot prompt one."
    assert styles[3]["prompt"] == "Human shot prompt four."
    assert styles[0]["style_key"] == "variation_1"
    assert styles[3]["style_key"] == "variation_4"
