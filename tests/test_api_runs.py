"""Flask integration tests for run CRUD, platforms, and scheduling."""

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from backend import config


class ApiRunsIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_dir = config.CLIENTS_DIR
        self.original_mongo = config.MONGODB_URI
        config.CLIENTS_DIR = Path(self.temp.name) / "clients"
        config.MONGODB_URI = None
        config.CLIENTS_DIR.mkdir(parents=True, exist_ok=True)

        from backend.app import create_app

        self.app = create_app()
        self.client = self.app.test_client()
        self._schedule_patcher = patch(
            "backend.schedule_publisher.start_schedule_publisher"
        )
        self._schedule_patcher.start()

    def tearDown(self):
        self._schedule_patcher.stop()
        config.CLIENTS_DIR = self.original_dir
        config.MONGODB_URI = self.original_mongo
        self.temp.cleanup()

    def _create_client(self, client_id: str = "acme") -> None:
        res = self.client.post(f"/clients/{client_id}", json={"display_name": "Acme"})
        self.assertEqual(res.status_code, 200)

    def _create_run(self, client_id: str = "acme", paragraph: str = "Summer promo") -> str:
        res = self.client.post(
            f"/clients/{client_id}/runs",
            json={"manual_inputs": {"paragraph": paragraph}},
        )
        self.assertEqual(res.status_code, 200)
        return res.get_json()["run_id"]

    def test_create_run_returns_social_pipeline(self):
        self._create_client()
        run_id = self._create_run()
        res = self.client.get(f"/clients/acme/runs/{run_id}")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["pipeline_id"], "social_media")
        self.assertIn("client_profile_topic", body["statuses"])
        self.assertIn("publish", body["statuses"])
        self.assertIn("use_location", body)
        self.assertIn("location_value", body)

    def test_create_run_with_location(self):
        self._create_client()
        ctx_dir = config.CLIENTS_DIR / "acme" / "context"
        ctx_dir.mkdir(parents=True, exist_ok=True)
        (ctx_dir / "context.md").write_text(
            "- Location (city/region for marketing): Lausanne\n",
            encoding="utf-8",
        )
        res = self.client.post(
            "/clients/acme/runs",
            json={"manual_inputs": {"paragraph": "Summer promo"}},
        )
        self.assertEqual(res.status_code, 200)
        run_id = res.get_json()["run_id"]
        body = self.client.get(f"/clients/acme/runs/{run_id}").get_json()
        self.assertTrue(body["use_location"])
        self.assertEqual(body["location_value"], "Lausanne")

    def test_patch_run_location(self):
        self._create_client()
        run_id = self._create_run()
        res = self.client.patch(
            f"/clients/acme/runs/{run_id}",
            json={"use_location": True, "location_value": "Vaud"},
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertTrue(body["use_location"])
        self.assertEqual(body["location_value"], "Vaud")

    def test_context_file_includes_location(self):
        self._create_client()
        ctx_dir = config.CLIENTS_DIR / "acme" / "context"
        ctx_dir.mkdir(parents=True, exist_ok=True)
        (ctx_dir / "context.md").write_text(
            "| Field | Detail |\n| Location | Bussigny |\n",
            encoding="utf-8",
        )
        res = self.client.get("/clients/acme/context-files/context.md")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["location"], "Bussigny")
        self.assertTrue(body["has_location"])

    def test_client_location_endpoint(self):
        self._create_client()
        ctx_dir = config.CLIENTS_DIR / "acme" / "context"
        ctx_dir.mkdir(parents=True, exist_ok=True)
        (ctx_dir / "context.md").write_text(
            "- Service area: Écublens\n",
            encoding="utf-8",
        )
        res = self.client.get("/clients/acme/location")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertTrue(body["has_location"])
        self.assertEqual(body["location"], "Écublens")

    def test_list_runs_includes_run_summary(self):
        self._create_client()
        run_id = self._create_run()
        res = self.client.get("/clients/acme/runs")
        self.assertEqual(res.status_code, 200)
        rows = res.get_json()["runs"]
        self.assertTrue(any(row["run_id"] == run_id for row in rows))

    def test_patch_platforms_persists(self):
        self._create_client()
        run_id = self._create_run()
        res = self.client.patch(
            f"/clients/acme/runs/{run_id}",
            json={"platforms": ["instagram", "linkedin"]},
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["platforms"], ["instagram", "linkedin"])

        manifest = json.loads(
            (config.CLIENTS_DIR / "acme" / "runs" / run_id / "run_manifest.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(manifest["platforms"], ["instagram", "linkedin"])

    def test_schedule_run_sets_status(self):
        self._create_client()
        run_id = self._create_run()
        future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        res = self.client.post(
            f"/clients/acme/runs/{run_id}/schedule",
            json={"scheduled_at": future},
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["status"], "scheduled")
        self.assertEqual(body["scheduled_at"], future)

    def test_archive_and_unarchive_run(self):
        self._create_client()
        run_id = self._create_run()
        res = self.client.post(f"/clients/acme/runs/{run_id}/archive")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["archived"])

        res = self.client.post(f"/clients/acme/runs/{run_id}/unarchive")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.get_json()["archived"])


if __name__ == "__main__":
    unittest.main()
