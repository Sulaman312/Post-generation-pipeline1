"""Batch format index endpoint for Publishing queue previews."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import config, image_artifacts


class BatchFormatsIndexTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_dir = config.CLIENTS_DIR
        self.original_mongo = config.MONGODB_URI
        self.original_auth = config.AUTH_ENABLED
        config.CLIENTS_DIR = Path(self.temp.name) / "clients"
        config.MONGODB_URI = None
        config.AUTH_ENABLED = False
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
        config.AUTH_ENABLED = self.original_auth
        self.temp.cleanup()

    def _write_formats(self, client_id: str, run_id: str, payload: dict) -> None:
        path = image_artifacts._formats_path(client_id, run_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")

    def test_batch_returns_multiple_runs(self):
        self._write_formats(
            "acme",
            "run-a",
            {
                "generated_at": "2026-07-01T12:00:00",
                "outputs": {"instagram": {"filename": "ig.png"}},
            },
        )
        self._write_formats(
            "acme",
            "run-b",
            {"generated_at": "2026-07-02T12:00:00", "outputs": {}},
        )

        res = self.client.post(
            "/clients/acme/runs/image-formats/batch",
            json={"run_ids": ["run-a", "run-b", "missing-run"]},
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertIn("runs", body)
        self.assertEqual(
            body["runs"]["run-a"]["outputs"]["instagram"]["filename"], "ig.png"
        )
        self.assertEqual(body["runs"]["run-b"]["outputs"], {})
        self.assertEqual(body["runs"]["missing-run"], {})

    def test_batch_rejects_invalid_body(self):
        res = self.client.post(
            "/clients/acme/runs/image-formats/batch",
            json={"run_ids": "not-a-list"},
        )
        self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()
