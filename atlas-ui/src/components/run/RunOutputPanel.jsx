import { useState } from "react";
import * as api from "../../services/api";
import { useLocale } from "../../context/LocaleContext";
import { executeRunStep } from "../../utils/runStepAction";
import PublishPlatformControls from "./PublishPlatformControls";
import ArtifactView from "./RunArtifactView";
import GeneratedImagesPanel from "./GeneratedImagesPanel";
import StepOutputSkeleton from "./StepOutputSkeleton";

function ImageGenerationOutput({ client, runId, toast, generating = false }) {
  return (
    <div className="run-artifact-shell run-artifact-shell--fit">
      <div className="run-artifact-card">
        <div className="run-artifact-body run-artifact-body--flush">
          <GeneratedImagesPanel
            client={client}
            runId={runId}
            toast={toast}
            generating={generating}
          />
        </div>
      </div>
    </div>
  );
}

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
  onPatchStepStatus,
  onRefreshRun,
  onStepError,
  onRunComplete,
  onShowOutput,
  onGoToNextStep,
}) {
  const { t } = useLocale();
  const [publishActionsLocked, setPublishActionsLocked] = useState(false);
  const showInlineRun = (pipelineId || "social_media") === "social_media";
  const isPublishStep = showInlineRun && step.key === "publish";
  const showPublishControls =
    isPublishStep && !running && status !== "running";

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

  const runLoading = run == null && !running && status !== "running";

  async function handleInlineRun() {
    if (!showInlineRun || inlineRunLocked) return;
    if (running || status === "running") return;
    onStepError?.(null);
    onPatchStepStatus?.(step.key, "running");
    onRefreshRun?.();
    window.dispatchEvent(
      new CustomEvent("cf:run-step-started", {
        detail: { clientId: client, runId, stepKey: step.key },
      })
    );
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
      toast?.(t("run.toastRan", { label: step.label }), {
        variant: "success",
        duration: 3500,
      });
    } catch (e) {
      const msg = e?.message || String(e);
      onStepError?.(msg);
      onPatchStepStatus?.(step.key, null);
      toast?.(msg, { variant: "error", duration: 12000 });
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

  if (step.key === "image_generation") {
    const isGenerating = running || status === "running";
    if (isGenerating || status === "done") {
      return (
        <>
          {publishControls}
          <ImageGenerationOutput
            client={client}
            runId={runId}
            toast={toast}
            generating={isGenerating}
          />
        </>
      );
    }
  }

  if (running || status === "running") {
    return (
      <>
        {publishControls}
        <StepOutputSkeleton
          stepKey={step.key}
          client={client}
          runId={runId}
          toast={toast}
          label={t("run.generatingStep", {
            index: step.index,
            label: step.label.toLowerCase(),
          })}
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
                {t("run.noOutputYet")}
                {showInlineRun ? (
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={inlineRunLocked}
                      title={
                        inlineRunLocked
                          ? t("publish.lockImmediate")
                          : undefined
                      }
                      onClick={handleInlineRun}
                    >
                      ▶ {t("run.runThisStep")}
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
