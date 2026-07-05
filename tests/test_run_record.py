import unittest
from datetime import datetime

from backend.run_record import (
    default_run_record_fields,
    due_platforms,
    earliest_scheduled_at,
    merge_published_results,
    normalize_platform_schedules,
    normalize_published_results,
    normalize_run_record_fields,
    schedule_is_due,
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

    def test_schedule_is_due(self):
        past = "2020-01-01T12:00:00+00:00"
        future = "2099-01-01T12:00:00+00:00"
        now = datetime.fromisoformat("2025-06-01T12:00:00+00:00")
        self.assertTrue(schedule_is_due(past, now))
        self.assertFalse(schedule_is_due(future, now))

    def test_due_platforms_skips_published_and_future(self):
        now = datetime.fromisoformat("2026-07-05T12:00:00+00:00")
        record = normalize_run_record_fields(
            {
                "platforms": ["instagram", "facebook", "linkedin"],
                "platform_schedules": {
                    "instagram": "2026-07-05T11:00:00+00:00",
                    "facebook": "2026-07-05T13:00:00+00:00",
                    "linkedin": "2026-07-05T10:00:00+00:00",
                },
                "published_results": [
                    {
                        "platform": "linkedin",
                        "status": "published",
                        "published_at": "2026-07-05T10:05:00+00:00",
                        "post_url": None,
                        "error": None,
                    }
                ],
            }
        )
        self.assertEqual(due_platforms(record, now), ["instagram"])

    def test_partial_publish_marks_overall_status_published(self):
        normalized = normalize_run_record_fields(
            {
                "status": "scheduled",
                "platforms": ["instagram", "linkedin", "facebook"],
                "platform_schedules": {},
                "scheduled_at": None,
                "published_results": [
                    {
                        "platform": "instagram",
                        "status": "published",
                        "published_at": "2026-07-05T17:53:43+00:00",
                        "post_url": None,
                        "error": None,
                    },
                    {
                        "platform": "linkedin",
                        "status": "skipped",
                        "published_at": None,
                        "post_url": None,
                        "error": "not connected",
                    },
                    {
                        "platform": "facebook",
                        "status": "published",
                        "published_at": "2026-07-05T17:53:28+00:00",
                        "post_url": None,
                        "error": None,
                    },
                ],
            }
        )
        self.assertEqual(normalized["status"], "published")

    def test_merge_published_results_prefers_latest(self):
        merged = merge_published_results(
            [
                {
                    "platform": "instagram",
                    "status": "scheduled",
                    "published_at": None,
                    "post_url": None,
                    "error": None,
                }
            ],
            [
                {
                    "platform": "instagram",
                    "status": "published",
                    "published_at": "2026-07-05T12:00:00+00:00",
                    "post_url": None,
                    "error": None,
                }
            ],
        )
        self.assertEqual(merged[0]["status"], "published")


if __name__ == "__main__":
    unittest.main()
