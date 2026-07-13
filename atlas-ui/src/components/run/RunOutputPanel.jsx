import { useState } from "react";
import * as api from "../../services/api";
import { executeRunStep } from "../../utils/runStepAction";
import PublishPlatformControls from "./PublishPlatformControls";
import ArtifactView from "./RunArtifactView";
import GeneratedImagesPanel from "./GeneratedImagesPanel";
import StepOutputSkeleton from "./StepOutputSkeleton";

export default function RunOutputPanel({
  client,
  runId,
  run,
  step,
  manualInputs,
  targetWordCount,
  status,
  running,
  toast,
  headerEditKey,
  pipelineId,
  topic,
  statuses,
  inlineRunning,
  onInlineRunningChange,
  onStepError,
  onRunComplete,
  onShowOutput,
  onGoToNextStep,
}) {
  const [publishActionsLocked, setPublishActionsLocked] = useState(false);
  const showInlineRun = (pipelineId || "social_media") === "social_media";
  const isPublishStep = showInlineRun && step.key === "publish";
  const showPublishControls =
    isPublishStep && !inlineRunning && !running && status !== "running";

  const publishControls = isPublishStep ? (
    <div className={showPublishControls ? undefined : "visually-hidden"} aria-hidden={!showPublishControls}>
      <PublishPlatformControls
        client={client}
        runId={runId}
        run={run}
        stepKey={step.key}
        topic={topic}
        statuses={statuses}
        pipelineId={pipelineId}
        onRunUpdated={onRunComplete}
        toast={toast}
        onPublishActionsLockedChange={setPublishActionsLocked}
      />
    </div>
  ) : null;

  const inlineRunLocked =
    showInlineRun && step.key === "publish" && publishActionsLocked;

  const runLoading = run == null;

  async function handleInlineRun() {
    if (!showInlineRun || inlineRunLocked) return;
    if (inlineRunning) return;
    onStepError?.(null);
    onInlineRunningChange?.(true);
    try {
      await executeRunStep(
        api,
        client,
        runId,
        step.key,
        topic,
        statuses,
        null,
        pipelineId
      );
      await onRunComplete?.();
      onShowOutput?.();
      toast?.(`Ran ${step.label}.`, { variant: "success", duration: 3500 });
    } catch (e) {
      const msg = e?.message || String(e);
      onStepError?.(msg);
      toast?.(msg, { variant: "error", duration: 12000 });
    } finally {
      onInlineRunningChange?.(false);
    }
  }

  if (runLoading) {
    return (
      <>
        {publishControls}
        <StepOutputSkeleton
          stepKey={step.key}
          client={client}
          runId={runId}
          toast={toast}
        />
      </>
    );
  }

  if (inlineRunning || running || status === "running") {
    if (step.key === "image_generation") {
      return (
        <>
          {publishControls}
          <GeneratedImagesPanel
            client={client}
            runId={runId}
            toast={toast}
            generating
          />
        </>
      );
    }
    return (
      <>
        {publishControls}
        <StepOutputSkeleton
          stepKey={step.key}
          client={client}
          runId={runId}
          toast={toast}
          label={`Step ${step.index} · Generating ${step.label.toLowerCase()}…`}
        />
      </>
    );
  }
  if (status !== "done") {
    return (
      <>
        {publishControls}
        <div className="run-artifact-shell">
          <div className="run-artifact-card">
            <div className="run-artifact-body">
              <div className="empty-state empty-state-inline">
                No output yet. Use{" "}
                <strong style={{ color: "var(--text)" }}>Run</strong> or{" "}
                <strong style={{ color: "var(--text)" }}>Re-run</strong> beside this
                step in the sidebar.
                {showInlineRun ? (
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={inlineRunLocked}
                      title={
                        inlineRunLocked
                          ? "Change the schedule to publish immediately"
                          : undefined
                      }
                      onClick={handleInlineRun}
                    >
                      ▶ Run this step
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      {publishControls}
      <ArtifactView
        client={client}
        runId={runId}
        stepName={step.key}
        manualInputs={manualInputs}
        targetWordCount={targetWordCount}
        toast={toast}
        headerEditKey={headerEditKey}
        useHeaderEdit
        onSaveAndContinue={onGoToNextStep}
        pipelineId={pipelineId}
      />
    </>
  );
}
