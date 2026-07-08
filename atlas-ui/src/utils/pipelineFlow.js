import { PIPELINE_STEP_KEYS as ARTICLE_KEYS } from "../constants/pipeline";
import { stepKeysForPipeline } from "../constants/pipelines";

/** @typedef {{ kind: 'artifact', stepKey: string } | { kind: 'topic' } | { kind: 'blocked' }} InputSource */

/** @param {string} stepKey @param {Record<string, string>} statuses @returns {InputSource} */
export function inputSourceForStep(stepKey, statuses, pipelineId = null) {
  const keys = pipelineId ? stepKeysForPipeline(pipelineId) : ARTICLE_KEYS;
  const idx = keys.indexOf(stepKey);
  if (idx < 0) return { kind: "blocked" };

  // Image generation always uses the saved image_prompt artifact (user may edit it).
  if (stepKey === "image_generation") {
    const promptStatus = statuses.image_prompt || "pending";
    if (promptStatus === "done") {
      return { kind: "artifact", stepKey: "image_prompt" };
    }
    if (promptStatus === "skipped") {
      return { kind: "blocked" };
    }
    return { kind: "blocked" };
  }

  for (let i = idx - 1; i >= 0; i -= 1) {
    const prev = keys[i];
    const st = statuses[prev] || "pending";
    if (st === "done") return { kind: "artifact", stepKey: prev };
    if (st === "skipped") continue;
    return { kind: "blocked" };
  }
  return { kind: "topic" };
}

export function canRunStep(stepKey, statuses, topic, pipelineId = null) {
  const src = inputSourceForStep(stepKey, statuses, pipelineId);
  if (src.kind === "blocked") return false;
  if (src.kind === "topic") return Boolean(String(topic || "").trim());
  return true;
}
