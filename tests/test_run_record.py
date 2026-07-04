import unittest

from backend.run_record import (
    default_run_record_fields,
    earliest_scheduled_at,
    normalize_platform_schedules,
    normalize_published_results,
    normalize_run_record_fields,
    upgrade_run_record,
)


class RunRecordTests(unittest.TestCase):
    def test_default_fields(self):
        defaults = default_run_record_fields()
        self.assertEqual(defaults["status"], "draft")
        self.assertEqual(
            defaults["platforms"], ["instagram", "linkedin", "facebook"]
        )
        self.assertIsNone(defaults["scheduled_at"])
        self.assertEqual(defaults["platform_schedules"], {})
        self.assertEqual(defaults["published_results"], [])

    def test_platform_schedules_bootstrap_from_scheduled_at(self):
        normalized = normalize_run_record_fields(
            {
                "platforms": ["instagram", "facebook"],
                "scheduled_at": "2026-07-05T10:00:00+00:00",
            }
        )
        self.assertEqual(
            normalized["platform_schedules"]["instagram"],
            "2026-07-05T10:00:00+00:00",
        )
        self.assertEqual(
            normalized["platform_schedules"]["facebook"],
            "2026-07-05T10:00:00+00:00",
        )

    def test_earliest_scheduled_at(self):
        schedules = normalize_platform_schedules(
            {
                "instagram": "2026-07-05T12:00:00+00:00",
                "linkedin": "2026-07-05T09:30:00+00:00",
            }
        )
        self.assertEqual(
            earliest_scheduled_at(schedules),
            "2026-07-05T09:30:00+00:00",
        )

    def test_upgrade_legacy_manifest(self):
        manifest = {"topic": "Hello", "statuses": {}}
        upgraded, changed = upgrade_run_record(manifest)
        self.assertTrue(changed)
        self.assertEqual(upgraded["status"], "draft")
        self.assertEqual(len(upgraded["platforms"]), 3)

    def test_normalize_published_results_dedupes_platforms(self):
        rows = normalize_published_results(
            [
                {
                    "platform": "instagram",
                    "status": "published",
                    "published_at": "2026-07-04T12:00:00",
                    "post_url": "https://example.com/ig/1",
                    "error": None,
                },
                {
                    "platform": "instagram",
                    "status": "failed",
                    "published_at": None,
                    "post_url": None,
                    "error": "duplicate",
                },
                {
                    "platform": "linkedin",
                    "status": "failed",
                    "published_at": None,
                    "post_url": None,
                    "error": "token expired",
                },
            ]
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["platform"], "instagram")
        self.assertEqual(rows[1]["error"], "token expired")

    def test_invalid_status_falls_back_to_draft(self):
        normalized = normalize_run_record_fields({"status": "unknown"})
        self.assertEqual(normalized["status"], "draft")


if __name__ == "__main__":
    unittest.main()
