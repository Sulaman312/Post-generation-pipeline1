/** Must stay in sync with `backend/social_pipeline.py` STEP_ORDER. */
export const SOCIAL_PIPELINE_STEPS = [
  {
    key: "client_profile_topic",
    label: "Client profile & topic",
    matrixLabel: "Client brief",
    matrixCol: "P1",
    index: 1,
  },
  {
    key: "content_angle_intent",
    label: "Content angle & intent",
    matrixLabel: "Angle & intent",
    matrixCol: "AI",
    index: 2,
  },
  {
    key: "image_prompt",
    label: "AI image prompt",
    matrixLabel: "Image prompt",
    matrixCol: "IP",
    index: 3,
  },
  {
    key: "image_generation",
    label: "Image generation",
    matrixLabel: "Generate images",
    matrixCol: "IG",
    index: 4,
  },
  {
    key: "image_formats",
    label: "Resize & formats",
    matrixLabel: "Resize & export",
    matrixCol: "RF",
    index: 5,
  },
  {
    key: "image_template",
    label: "Apply client template",
    matrixLabel: "Template",
    matrixCol: "TP",
    index: 6,
  },
  {
    key: "captions",
    label: "Captions (IG / LI / FB)",
    matrixLabel: "Captions",
    matrixCol: "CP",
    index: 7,
  },
  {
    key: "review_checklist",
    label: "Review checklist",
    matrixLabel: "Review & QA",
    matrixCol: "QA",
    index: 8,
  },
];

export const SOCIAL_PIPELINE_STEP_KEYS = SOCIAL_PIPELINE_STEPS.map((s) => s.key);

