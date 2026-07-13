/** Steps that render a dedicated visual panel instead of markdown artifacts. */
export const INTERACTIVE_OUTPUT_STEPS = new Set([
  "image_generation",
  "image_compose",
  "image_template",
  "review_checklist",
]);

export function isInteractiveOutputStep(stepKey) {
  return INTERACTIVE_OUTPUT_STEPS.has(stepKey);
}

/** Markdown-heavy steps that should show text skeletons while loading. */
export const TEXT_ARTIFACT_STEPS = new Set([
  "client_profile_topic",
  "content_angle_intent",
  "topic_card",
  "image_prompt",
  "captions",
  "draft",
  "fact_check",
  "final_output",
  "publish",
  "review_checklist", // also interactive; handled separately when preview mounts
]);

export function stepShowsTextSkeletonWhileLoading(stepKey) {
  return !isInteractiveOutputStep(stepKey);
}

export function stepShowsVisualSkeletonWhileRunning(stepKey) {
  return isInteractiveOutputStep(stepKey);
}
