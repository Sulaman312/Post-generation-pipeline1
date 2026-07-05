import os
import unittest
from unittest.mock import patch

from backend import publish_env


class PublishEnvTests(unittest.TestCase):
    def tearDown(self):
        publish_env.set_active_publish_env("test")

    @patch.dict(
        os.environ,
        {
            "META_PAGE_ACCESS_TOKEN": "test-page-token",
            "META_PAGE_ID": "111",
            "META_IG_USER_ID": "222",
            "LINKEDIN_ACCESS_TOKEN": "li-test",
            "LINKEDIN_ORG_URN": "123",
        },
        clear=True,
    )
    def test_test_credentials_use_default_env_vars(self):
        creds = publish_env.meta_credentials("test")
        self.assertEqual(creds["page_access_token"], "test-page-token")
        self.assertTrue(publish_env.is_instagram_connected("test"))

    @patch.dict(
        os.environ,
        {
            "META_LIVE_PAGE_ACCESS_TOKEN": "live-page-token",
            "META_LIVE_PAGE_ID": "999",
            "META_LIVE_IG_USER_ID": "888",
        },
        clear=False,
    )
    def test_live_credentials_use_live_prefixed_vars(self):
        creds = publish_env.meta_credentials("live")
        self.assertEqual(creds["page_access_token"], "live-page-token")
        self.assertTrue(publish_env.live_env_configured())

    def test_set_active_env_requires_live_credentials(self):
        with patch.object(publish_env, "live_env_configured", return_value=False):
            with self.assertRaises(ValueError):
                publish_env.set_active_publish_env("live")


if __name__ == "__main__":
    unittest.main()
