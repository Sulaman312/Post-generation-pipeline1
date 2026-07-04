"""Social media content pipeline (Instagram + LinkedIn).

This pipeline is additive: it does not modify the existing article pipeline.
Step artifacts are stored the same way: `clients/<client_id>/runs/<run_id>/<step>.md`.
Binary image outputs will live under `clients/<client_id>/runs/<run_id>/images/` (implemented separately).
"""

from __future__ import annotations

from . import social_steps

STEP_RUNNERS = {
    "client_profile_topic": social_steps.run_step_1_client_profile_topic,
    "content_angle_intent": social_steps.run_step_2_content_angle_intent,
    "image_prompt": social_steps.run_step_3_image_prompt,
    "image_generation": social_steps.run_step_4_image_generation,
    "image_formats": social_steps.run_step_6_image_formats,
    "image_template": social_steps.run_step_7_image_template,
    "captions": social_steps.run_step_8_captions,
    "review_checklist": social_steps.run_step_9_review_checklist,
    "publish": social_steps.run_step_publish,
}

STEP_ORDER = list(STEP_RUNNERS.keys())

