"""Tests for social image generation prompt loading."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import artifacts, config
from backend.social_image_generation import load_image_prompt_markdown


class SocialImageGenerationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_dir = config.CLIENTS_DIR
        config.CLIENTS_DIR = Path(self.temp.name)

    def tearDown(self):
        config.CLIENTS_DIR = self.original_dir
        self.temp.cleanup()

    def test_load_image_prompt_reads_saved_artifact(self):
        artifacts.save_artifact(
            "client-a",
            "run-a",
            "image_prompt",
            "## Primary image prompt\nEdited prompt text.\n",
        )
        self.assertEqual(
            load_image_prompt_markdown("client-a", "run-a"),
            "## Primary image prompt\nEdited prompt text.",
        )


if __name__ == "__main__":
    unittest.main()
