"""Tests for client location extraction and per-run location settings."""

from __future__ import annotations

import unittest

from backend.client_location import (
    extract_client_location_from_context,
    _looks_like_street_address,
)
from backend.run_location import location_from_manifest, normalize_run_location


class ClientLocationTests(unittest.TestCase):
    def test_extracts_labeled_city_region(self):
        md = """## Company overview
- Company name: GlassCo
- Location (city/region for marketing): Lausanne and Vaud
- What you sell: Glass railings
"""
        self.assertEqual(
            extract_client_location_from_context(md),
            "Lausanne and Vaud",
        )

    def test_rejects_street_address(self):
        md = """## Company overview
- Location: Route de Vallaire 149, 1260 Écublens
"""
        self.assertIsNone(extract_client_location_from_context(md))

    def test_service_area_label(self):
        md = "- Service area: Écublens, Lausanne\n"
        self.assertEqual(
            extract_client_location_from_context(md),
            "Écublens, Lausanne",
        )

    def test_location_section(self):
        md = """## Location
Lausanne and surrounding areas
"""
        self.assertEqual(
            extract_client_location_from_context(md),
            "Lausanne and surrounding areas",
        )

    def test_extracts_markdown_table_row(self):
        md = """# A. Gauchat SA — Company Context

| FIELD | DETAIL |
| --- | --- |
| Company Name | A. Gauchat SA |
| Founded | 1961 |
| Location | Bussigny, French-speaking Switzerland (Suisse romande) |
| Website | https://www.gauchat.ch/ |
"""
        self.assertEqual(
            extract_client_location_from_context(md),
            "Bussigny, French-speaking Switzerland (Suisse romande)",
        )

    def test_extracts_bold_location_table_row(self):
        md = """| Field | Detail |
| --- | --- |
| **Location** | Bussigny, French-speaking Switzerland (Suisse romande) |
"""
        self.assertEqual(
            extract_client_location_from_context(md),
            "Bussigny, French-speaking Switzerland (Suisse romande)",
        )

    def test_street_heuristic(self):
        self.assertTrue(_looks_like_street_address("Route de Vallaire 149"))
        self.assertFalse(_looks_like_street_address("Lausanne and Vaud"))


class RunLocationTests(unittest.TestCase):
    def test_normalize_disables_when_empty_value(self):
        loc = normalize_run_location(True, "  ")
        self.assertFalse(loc["use_location"])
        self.assertEqual(loc["location_value"], "")

    def test_location_from_manifest_defaults(self):
        loc = location_from_manifest({})
        self.assertFalse(loc["use_location"])
        self.assertEqual(loc["location_value"], "")

    def test_location_from_manifest_reads_fields(self):
        loc = location_from_manifest(
            {"use_location": True, "location_value": "Lausanne"}
        )
        self.assertTrue(loc["use_location"])
        self.assertEqual(loc["location_value"], "Lausanne")


if __name__ == "__main__":
    unittest.main()
