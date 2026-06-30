import { SOCIAL_PIPELINE_STEPS } from "./socialPipeline";

export const PIPELINE_IDS = {
  SOCIAL: "social_media",
};

export function stepsForPipeline() {
  return SOCIAL_PIPELINE_STEPS;
}

export function stepKeysForPipeline() {
  return SOCIAL_PIPELINE_STEPS.map((s) => s.key);
}
