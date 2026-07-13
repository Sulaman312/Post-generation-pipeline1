"""Tests for Step 3 image prompt input assembly."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend import artifacts, config
from backend.social_steps import _image_prompt_user_message, _topic_card_angles_block


class ImagePromptInputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_dir = config.CLIENTS_DIR
        config.CLIENTS_DIR = Path(self.temp.name)

    def tearDown(self):
        config.CLIENTS_DIR = self.original_dir
        self.temp.cleanup()

    def test_topic_card_angles_block_extracts_step1_sections(self):
        brief = """\
## Client & topic brief
Some business context.

## Primary intent
Build trust

## Post format
Single image

## Short angle statement
Show craftsmanship up close.

## Alternative angles
- Wide shot of the finished install
- Candid homeowner moment
"""
        artifacts.save_artifact("client-a", "run-a", "client_profile_topic", brief)
        block = _topic_card_angles_block("client-a", "run-a")
        self.assertIn("Short angle statement", block)
        self.assertIn("Show craftsmanship up close.", block)
        self.assertIn("Wide shot of the finished install", block)

    def test_image_prompt_user_message_includes_template_idea_and_angles(self):
        context_dir = config.CLIENTS_DIR / "client-a" / "context"
        context_dir.mkdir(parents=True)
        (context_dir / "image_style.md").write_text(
            "Generalized brand template for glass railings.",
            encoding="utf-8",
        )
        artifacts.save_artifact(
            "client-a",
            "run-a",
            "client_profile_topic",
            "## Short angle statement\nSafety without blocking the view.\n\n"
            "## Alternative angles\n- Detail shot\n",
        )
        artifacts.save_run_manifest(
            "client-a",
            "run-a",
            topic="Glass railing install",
            statuses={},
            manual_inputs={"paragraph": "Winter safety tips for staircases"},
        )
        msg = _image_prompt_user_message(
            "client-a",
            "run-a",
            artifacts.read_run_manifest("client-a", "run-a") or {},
            image_style="Generalized brand template for glass railings.",
        )
        self.assertIn("Generalized brand template for glass railings.", msg)
        self.assertIn("Winter safety tips for staircases", msg)
        self.assertIn("Safety without blocking the view.", msg)
        self.assertIn("Detail shot", msg)


if __name__ == "__main__":
    unittest.main()
