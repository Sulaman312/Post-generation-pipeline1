"""Social media content pipeline (Instagram + LinkedIn).

This pipeline is additive: it does not modify the existing article pipeline.
Step artifacts are stored the same way: `clients/<client_id>/runs/<run_id>/<step>.md`.
Binary image outputs will live under `clients/<client_id>/runs/<run_id>/images/` (implemented separately).
"""

from __future__ import annotations

from . import social_steps
from .pipeline_contract import step_order
from .publish_runner import run_step_publish

STEP_RUNNERS = {
    "client_profile_topic": social_steps.run_step_1_client_profile_topic,
    "image_prompt": social_steps.run_step_3_image_prompt,
    "image_generation": social_steps.run_step_4_image_generation,
    "image_template": social_steps.run_step_7_image_template,
    "captions": social_steps.run_step_8_captions,
    "review_checklist": social_steps.run_step_9_review_checklist,
    "publish": run_step_publish,
}

STEP_ORDER = step_order()

