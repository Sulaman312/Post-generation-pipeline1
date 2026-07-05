/** Must stay in sync with `backend/social_pipeline.py` STEP_ORDER. */
export const SOCIAL_PIPELINE_STEPS = [
  {
    key: "client_profile_topic",
    label: "Client & topic brief",
    matrixLabel: "Client & topic brief",
    matrixCol: "P1",
    index: 1,
  },
  {
    key: "content_angle_intent",
    label: "Angle & intent",
    matrixLabel: "Angle & intent",
    matrixCol: "AI",
    index: 2,
  },
  {
    key: "image_prompt",
    label: "Image prompt",
    matrixLabel: "Image prompt",
    matrixCol: "IP",
    index: 3,
  },
  {
    key: "image_generation",
    label: "Generate & select image",
    matrixLabel: "Generate & select image",
    matrixCol: "IG",
    index: 4,
  },
  {
    key: "image_formats",
    label: "Export channel sizes",
    matrixLabel: "Export channel sizes",
    matrixCol: "RF",
    index: 5,
  },
  {
    key: "image_template",
    label: "Brand template",
    matrixLabel: "Brand template",
    matrixCol: "TP",
    index: 6,
  },
  {
    key: "captions",
    label: "Channel captions",
    matrixLabel: "Channel captions",
    matrixCol: "CP",
    index: 7,
  },
  {
    key: "review_checklist",
    label: "Review & QA",
    matrixLabel: "Review & QA",
    matrixCol: "QA",
    index: 8,
  },
  {
    key: "publish",
    label: "Publish",
    matrixLabel: "Publish",
    matrixCol: "PB",
    index: 9,
  },
];

export const SOCIAL_PIPELINE_STEP_KEYS = SOCIAL_PIPELINE_STEPS.map((s) => s.key);
