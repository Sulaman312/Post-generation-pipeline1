import unittest

from backend.social_input import (
    caption_language_label,
    format_manual_block,
    normalize_caption_language,
    sanitize_social_manual_inputs,
)


class SocialInputCaptionLanguageTests(unittest.TestCase):
    def test_normalize_caption_language(self):
        self.assertEqual(normalize_caption_language("en"), "en")
        self.assertEqual(normalize_caption_language("fr"), "fr")
        self.assertEqual(normalize_caption_language("French"), "fr")
        self.assertEqual(normalize_caption_language(None), "en")

    def test_sanitize_keeps_caption_language(self):
        manual = sanitize_social_manual_inputs(
            {
                "paragraph": "Post about spring maintenance",
                "caption_language": "fr",
            }
        )
        self.assertEqual(manual["caption_language"], "fr")
        self.assertIn("paragraph", manual)

    def test_format_manual_block_includes_language(self):
        block = format_manual_block(
            {
                "paragraph": "Idée de publication",
                "caption_language": "fr",
            }
        )
        self.assertIn("CAPTION LANGUAGE: French", block)
        self.assertIn("caption text in French", block)

    def test_caption_language_label(self):
        self.assertEqual(caption_language_label("fr"), "French")
        self.assertEqual(caption_language_label("en"), "English")


if __name__ == "__main__":
    unittest.main()
