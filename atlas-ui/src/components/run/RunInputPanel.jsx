import { stepsForPipeline } from "../../constants/pipelines";
import { PIPELINE_MARKDOWN_CLASS } from "../../constants/markdownPreview";
import { inputSourceForStep } from "../../utils/pipelineFlow";
import Markdown from "../shared/Markdown";
import SocialRunInputPanel from "./SocialRunInputPanel";
import ArtifactView from "./RunArtifactView";

export default function RunInputPanel({
  client,
  runId,
  isFirstStep,
  topic,
  isSocial,
  manualInputs,
  useLocation,
  locationValue,
  onRefreshRun,
  previousStep,
  previousStatus,
  activeStepKey,
  statuses,
  toast,
  pipelineId,
}) {
  const src = inputSourceForStep(activeStepKey, statuses, pipelineId);

  if (isSocial && (isFirstStep || src.kind === "topic")) {
    return (
      <SocialRunInputPanel
        client={client}
        runId={runId}
        manualInputs={manualInputs}
        useLocation={useLocation}
        locationValue={locationValue}
        onSaved={onRefreshRun}
        toast={toast}
      />
    );
  }

  if (isFirstStep) {
    return (
      <div className="run-artifact-shell">
        <div className="run-artifact-card">
          <div className="run-artifact-body run-input-topic-body">
            <div className="run-input-topic-eyebrow">Topic · this run</div>
            {topic?.trim() ? (
              <Markdown text={topic} className={`${PIPELINE_MARKDOWN_CLASS} md--topic-input`} />
            ) : (
              <p className="run-input-topic-lead muted">(no topic)</p>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (src.kind === "blocked") {
    return (
      <div className="run-artifact-shell">
        <div className="run-artifact-card">
          <div className="run-artifact-body">
            <div className="empty-state empty-state-inline">
              Complete earlier steps first — then this step can use their output
              as input.
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (src.kind === "topic") {
    return (
      <div className="run-artifact-shell">
        <div className="run-artifact-card">
          <div className="run-artifact-body run-input-topic-body">
            <div className="run-input-topic-eyebrow">Topic · this run</div>
            {topic?.trim() ? (
              <Markdown text={topic} className={`${PIPELINE_MARKDOWN_CLASS} md--topic-input`} />
            ) : (
              <p className="run-input-topic-lead muted">(no topic)</p>
            )}
          </div>
        </div>
      </div>
    );
  }
  const inputStep = stepsForPipeline(pipelineId).find((s) => s.key === src.stepKey);
  return (
    <ArtifactView
      client={client}
      runId={runId}
      stepName={inputStep?.key || previousStep.key}
      readOnly
      toast={toast}
      allowStructuredTopicCard
      manualInputs={manualInputs}
      pipelineId={pipelineId}
    />
  );
}
