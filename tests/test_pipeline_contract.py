import unittest

from backend import config
from backend.pipeline_contract import load_contract, step_order
from backend.social_pipeline import STEP_ORDER


class PipelineContractTests(unittest.TestCase):
    def test_contract_file_exists(self):
        path = (
            config.REPO_ROOT
            / "atlas-ui"
            / "src"
            / "constants"
            / "pipeline-contract.json"
        )
        self.assertTrue(path.is_file(), f"missing contract: {path}")

    def test_backend_step_order_matches_contract(self):
        self.assertEqual(STEP_ORDER, step_order())

    def test_frontend_contract_exports_match_backend(self):
        contract = load_contract()
        keys = [step["key"] for step in contract["steps"]]
        self.assertEqual(step_order(), keys)

    def test_contract_platforms(self):
        contract = load_contract()
        self.assertEqual(
            contract["platforms"],
            ["instagram", "linkedin", "facebook"],
        )

    def test_social_pipeline_has_eight_steps(self):
        contract = load_contract()
        self.assertEqual(len(contract["steps"]), 8)
        self.assertEqual(contract["steps"][0]["key"], "client_profile_topic")
        self.assertNotIn(
            "content_angle_intent",
            [step["key"] for step in contract["steps"]],
        )

    def test_split_combined_topic_brief(self):
        from backend.social_steps import split_topic_brief

        text = (
            "## Client & topic brief\n"
            "- Business: glazing\n"
            "- Hook: custom showers\n\n"
            "## Primary intent\n"
            "Educate\n\n"
            "## Post format\n"
            "Single image\n"
        )
        profile, angle = split_topic_brief(text)
        self.assertIn("glazing", profile)
        self.assertIn("Educate", angle)
        self.assertIn("## Primary intent", angle)


if __name__ == "__main__":
    unittest.main()
