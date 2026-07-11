import unittest
from datetime import timedelta
from unittest.mock import MagicMock, patch

from werkzeug.security import check_password_hash, generate_password_hash

from backend import auth_store


class AuthStoreTests(unittest.TestCase):
    def setUp(self):
        self.users = MagicMock()
        self.sessions = MagicMock()
        self.users.find_one.return_value = None
        self.db = MagicMock()
        self.db.__getitem__.side_effect = lambda name: {
            auth_store.USERS_COLLECTION: self.users,
            auth_store.SESSIONS_COLLECTION: self.sessions,
        }[name]

    @patch("backend.auth_store.mongo_storage.database")
    def test_ensure_default_user_inserts_hashed_password(self, db_mock):
        db_mock.return_value = self.db
        auth_store.ensure_default_user("sulaman312", "admin123")
        self.users.insert_one.assert_called_once()
        payload = self.users.insert_one.call_args.args[0]
        self.assertEqual(payload["username"], "sulaman312")
        self.assertTrue(check_password_hash(payload["password_hash"], "admin123"))

    @patch("backend.auth_store.mongo_storage.database")
    def test_authenticate_rejects_bad_password(self, db_mock):
        db_mock.return_value = self.db
        self.users.find_one.return_value = {
            "username": "sulaman312",
            "password_hash": generate_password_hash("admin123"),
        }
        self.assertIsNone(auth_store.authenticate("sulaman312", "wrong"))
        self.assertEqual(
            auth_store.authenticate("sulaman312", "admin123")["username"],
            "sulaman312",
        )

    @patch("backend.auth_store.mongo_storage.database")
    def test_create_and_resolve_session(self, db_mock):
        db_mock.return_value = self.db
        self.sessions.find_one.return_value = {
            "token": "abc123",
            "username": "sulaman312",
            "expires_at": auth_store._now() + timedelta(days=1),
        }
        self.users.find_one.return_value = {"username": "sulaman312"}
        session = auth_store.create_session("sulaman312")
        self.assertEqual(session["username"], "sulaman312")
        self.assertTrue(session["token"])
        self.sessions.insert_one.assert_called_once()

        req = MagicMock()
        req.headers = {"Authorization": f"Bearer {session['token']}"}
        with patch.object(auth_store, "user_from_token", return_value={"username": "sulaman312"}):
            user = auth_store.resolve_request_user(req)
        self.assertEqual(user["username"], "sulaman312")


if __name__ == "__main__":
    unittest.main()
