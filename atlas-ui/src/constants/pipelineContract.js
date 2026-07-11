import contract from "./pipeline-contract.json";

/** Shared pipeline contract — keep in sync with `backend/pipeline_contract.py`. */
export const PIPELINE_CONTRACT = contract;

/** Step index is always derived from contract order (not hand-edited JSON). */
export const SOCIAL_PIPELINE_STEPS = contract.steps.map((step, i) => ({
  ...step,
  index: i + 1,
}));

export const SOCIAL_PIPELINE_STEP_KEYS = SOCIAL_PIPELINE_STEPS.map((s) => s.key);

export function findPipelineStep(stepKey, steps = SOCIAL_PIPELINE_STEPS) {
  return steps.find((s) => s.key === stepKey) ?? null;
}

export function pipelineStepIndex(stepKey, steps = SOCIAL_PIPELINE_STEPS) {
  const step = findPipelineStep(stepKey, steps);
  return step?.index ?? null;
}

export function pipelineStepLabel(stepKey, steps = SOCIAL_PIPELINE_STEPS) {
  const step = findPipelineStep(stepKey, steps);
  return step?.label ?? stepKey;
}

export const PLATFORMS = [...contract.platforms];

export const DEFAULT_PLATFORMS = [...contract.default_platforms];

export const POST_STATUSES = [...contract.post_statuses];

export const PLATFORM_RESULT_STATUSES = [...contract.platform_result_statuses];
