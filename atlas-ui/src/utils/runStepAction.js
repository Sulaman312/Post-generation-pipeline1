import { stepsForPipeline } from "../constants/pipelines";
import { inputSourceForStep } from "./pipelineFlow";

/** Load prior input and execute a pipeline step. */
async function flushArtifactSave(api, client, runId, stepName) {
  api.invalidateArtifactCache?.(client, runId, stepName);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("cf:flush-artifact-save", {
      detail: { clientId: client, runId, stepName },
    })
  );
  await new Promise((resolve) => window.setTimeout(resolve, 150));
}

export async function executeRunStep(
  api,
  client,
  runId,
  stepKey,
  topic,
  statuses,
  signal,
  pipelineId = null
) {
  const src = inputSourceForStep(stepKey, statuses, pipelineId);
  let previous = "";
  if (src.kind === "topic") {
    previous = topic || "";
  } else if (src.kind === "artifact") {
    previous = await api.getArtifact(client, runId, src.stepKey);
  } else {
    throw new Error("Complete earlier steps first.");
  }
  // Step 4 reads image_prompt.md on the server; flush any in-progress edits first.
  if (stepKey === "image_generation") {
    await flushArtifactSave(api, client, runId, "image_prompt");
    previous = await api.getArtifact(client, runId, "image_prompt");
  }
  await api.runStep(client, runId, stepKey, previous, signal);
  const steps = stepsForPipeline(pipelineId);
  return steps.find((s) => s.key === stepKey);
}
