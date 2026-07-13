import unittest

from backend.social_steps import _split_captions_by_channel, sanitize_caption_for_publish


class CaptionSanitizeTests(unittest.TestCase):
    def test_strips_suggested_metadata_lines(self):
        raw = """## Instagram
Great post about glass railings.

- Suggested location tag: Geneva
- Suggested posting time window: 10 AM - 12 PM

#glass #design
"""
        sections = _split_captions_by_channel(raw)
        self.assertNotIn("Suggested location tag", sections["instagram"])
        self.assertNotIn("Suggested posting time window", sections["instagram"])
        self.assertIn("Great post about glass railings", sections["instagram"])
        self.assertIn("#glass", sections["instagram"])

    def test_strips_italic_suggested_metadata_lines(self):
        raw = """## Instagram
Great post about logistics.

*Suggested posting time window: 10 AM - 2 PM*
"""
        sections = _split_captions_by_channel(raw)
        self.assertNotIn("Suggested posting time window", sections["instagram"])
        self.assertIn("Great post about logistics", sections["instagram"])

    def test_strips_posting_time_without_window(self):
        raw = """## Instagram
Great post about logistics.

- Suggested posting time: 10 AM - 2 PM
"""
        sections = _split_captions_by_channel(raw)
        self.assertNotIn("Suggested posting time", sections["instagram"])
        self.assertIn("Great post about logistics", sections["instagram"])

    def test_strips_inline_posting_time(self):
        raw = """## Facebook
Hook line here. Suggested posting time window: 9 AM - 11 AM
"""
        sections = _split_captions_by_channel(raw)
        self.assertNotIn("Suggested posting time", sections["facebook"])
        self.assertIn("Hook line here.", sections["facebook"])

    def test_sanitize_caption_for_publish(self):
        text = "Hello\n- Suggested location tag: [Your City]\nWorld"
        self.assertEqual(sanitize_caption_for_publish(text), "Hello\nWorld")


if __name__ == "__main__":
    unittest.main()
