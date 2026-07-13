"""Tests for social image generation prompt loading."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import artifacts, config, image_artifacts
from backend.social_image_generation import generate_all_styles, load_image_prompt_markdown


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

    @patch("backend.integrations.openai_images.generate_images")
    def test_generate_all_styles_saves_incrementally(self, mock_generate):
        prompt = """## Photorealistic scene
Scene one.

## Close-up detail
Scene two.
"""
        artifacts.save_artifact("client-a", "run-a", "image_prompt", prompt)
        mock_generate.side_effect = [
            [b"png-one"],
            [b"png-two"],
            [b"png-three"],
            [b"png-four"],
        ]

        idx = generate_all_styles("client-a", "run-a")

        self.assertEqual(len(idx.images), 4)
        self.assertEqual(mock_generate.call_count, 4)
        stored = image_artifacts.load_image_index("client-a", "run-a")
        self.assertIsNotNone(stored)
        assert stored is not None
        style_keys = {stored.meta[fn]["style_key"] for fn in stored.images}
        self.assertIn("photorealistic", style_keys)
        self.assertIn("close_up_detail", style_keys)

    @patch("backend.integrations.openai_images.generate_images")
    def test_generate_all_styles_runs_api_calls_in_parallel(self, mock_generate):
        import threading
        import time

        prompt = """## Photorealistic scene
A.

## Close-up detail
B.

## Environmental wide
C.

## Lifestyle warm
D.
"""
        artifacts.save_artifact("client-a", "run-a", "image_prompt", prompt)
        active = {"count": 0, "max": 0}
        lock = threading.Lock()
        started = threading.Barrier(2)

        def slow_generate(_prompt, n=1):
            with lock:
                active["count"] += 1
                active["max"] = max(active["max"], active["count"])
            try:
                started.wait(timeout=5)
            except threading.BrokenBarrierError:
                pass
            time.sleep(0.05)
            with lock:
                active["count"] -= 1
            return [b"png"]

        mock_generate.side_effect = slow_generate
        generate_all_styles("client-a", "run-a")
        self.assertGreaterEqual(active["max"], 2)


if __name__ == "__main__":
    unittest.main()
