import json
import unittest
from pathlib import Path

from PIL import Image

from backend.image_overlay import (
    compute_fit_placement,
    export_for_brand_template,
    export_formatted_image,
)
from backend.image_templates import content_band_from_format


class ImageExportFitTests(unittest.TestCase):
    def _bordered_square(self) -> Image.Image:
        base = Image.new("RGB", (1024, 1024), (200, 100, 50))
        for y in range(1024):
            base.putpixel((0, y), (0, 0, 255))
            base.putpixel((1023, y), (255, 255, 0))
        return base

    def test_instagram_fit_preserves_full_source_width(self):
        out = export_formatted_image(
            self._bordered_square(),
            None,
            logo_path=None,
            target_w=1080,
            target_h=1350,
            resize_mode="fit",
        )
        mid_y = out.size[1] // 2
        self.assertEqual(out.getpixel((0, mid_y)), (0, 0, 255))
        self.assertEqual(out.getpixel((out.size[0] - 1, mid_y)), (255, 255, 0))

    def test_export_always_uses_contain_not_crop(self):
        base = self._bordered_square()
        contain = export_formatted_image(
            base,
            None,
            logo_path=None,
            target_w=1080,
            target_h=1350,
            resize_mode="fit",
        )
        forced_crop_ignored = export_formatted_image(
            base,
            None,
            logo_path=None,
            target_w=1080,
            target_h=1350,
            resize_mode="crop",
        )
        mid_y = contain.size[1] // 2
        self.assertEqual(contain.getpixel((0, mid_y)), (0, 0, 255))
        self.assertEqual(forced_crop_ignored.getpixel((0, mid_y)), (0, 0, 255))

    def test_schneiter_facebook_content_band(self):
        repo = Path(__file__).resolve().parents[1]
        tpl = repo / "clients/Schneiteretfils/templates/Schneiteretfils_template/template.json"
        if not tpl.is_file():
            self.skipTest("Schneiter template fixture missing")
        fmt = json.loads(tpl.read_text(encoding="utf-8"))["formats"]["facebook"]
        band = content_band_from_format(fmt, 630)
        self.assertIsNotNone(band)
        top, bottom = band
        self.assertGreaterEqual(top, 110)
        self.assertLessEqual(top, 140)
        self.assertGreaterEqual(bottom, 400)
        self.assertLessEqual(bottom, 430)

    def test_brand_template_contains_full_source_above_footer(self):
        base = Image.new("RGB", (800, 400), (255, 0, 0))
        for x in range(400, 800):
            for y in range(400):
                base.putpixel((x, y), (0, 0, 255))
        photo_h = 413
        out = export_for_brand_template(base, 1200, 630, (0, photo_h))
        paste_left, paste_top, paste_w, paste_h = compute_fit_placement(
            base.size[0], base.size[1], 1200, photo_h
        )
        mid_y = paste_top + paste_h // 2
        self.assertEqual(out.getpixel((paste_left + paste_w // 4, mid_y)), (255, 0, 0))
        self.assertEqual(
            out.getpixel((paste_left + (3 * paste_w) // 4, mid_y)),
            (0, 0, 255),
        )
        self.assertLessEqual(paste_top + paste_h, photo_h)


if __name__ == "__main__":
    unittest.main()
