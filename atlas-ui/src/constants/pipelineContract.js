import contract from "./pipeline-contract.json";

/** Shared pipeline contract — keep in sync with `backend/pipeline_contract.py`. */
export const PIPELINE_CONTRACT = contract;

export const SOCIAL_PIPELINE_STEPS = contract.steps;

export const SOCIAL_PIPELINE_STEP_KEYS = SOCIAL_PIPELINE_STEPS.map((s) => s.key);

export const PLATFORMS = [...contract.platforms];

export const DEFAULT_PLATFORMS = [...contract.default_platforms];

export const POST_STATUSES = [...contract.post_statuses];

export const PLATFORM_RESULT_STATUSES = [...contract.platform_result_statuses];
