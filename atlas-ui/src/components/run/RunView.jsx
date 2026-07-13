import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../context/ToastContext";
import { stepsForPipeline } from "../../constants/pipelines";
import { isSocialPipeline, socialRunChromeLabel, socialRunFullText } from "../../utils/socialRunTopic";
import { statusClass, statusLabel } from "../../utils/runViewStatus";
import RunInputPanel from "./RunInputPanel";
import RunOutputPanel from "./RunOutputPanel";
import "./ImageGenerationStep.css";

export default function RunView({
  client,
  runId,
  run,
  runError,
  onRefreshRun,
  activeStepKey,
  statusOverrides = {},
  onPatchStepStatus,
  onSelectStep,
  onBack,
}) {
  const { toast } = useToast();
  const refreshRun = onRefreshRun;
  const error = runError;
  const [tab, setTab] = useState("output");
  const [outputEditKey, setOutputEditKey] = useState(0);
  const [stepError, setStepError] = useState(null);
  const [showFullTopic, setShowFullTopic] = useState(false);

  const prevStatusRef = useRef(null);
  const runChromeCacheRef = useRef({ label: "", full: "" });

  const serverStatuses = run?.statuses || {};
  const statuses = { ...serverStatuses, ...statusOverrides };
  const topic = run?.topic || "";
  const pipelineId = run?.pipeline_id || "social_media";
  const manualInputs = run?.manual_inputs;
  const isSocial = isSocialPipeline(pipelineId);
  const runChromeLabel = isSocial
    ? socialRunChromeLabel(manualInputs, topic)
    : topic?.trim() || "";
  const runChromeFullText = isSocial
    ? socialRunFullText(manualInputs, topic)
    : topic?.trim() || "";
  if (runChromeLabel) {
    runChromeCacheRef.current = {
      label: runChromeLabel,
      full: runChromeFullText,
    };
  }
  const displayChromeLabel = runChromeLabel || runChromeCacheRef.current.label;
  const displayChromeFullText = runChromeLabel
    ? runChromeFullText
    : runChromeCacheRef.current.full;
  const displayChromeNeedsExpand =
    displayChromeFullText.length > displayChromeLabel.length ||
    displayChromeLabel.includes("\n") ||
    displayChromeLabel.length > 48;
  const STEPS = useMemo(() => stepsForPipeline(pipelineId), [pipelineId]);

  const activeStep = useMemo(
    () => STEPS.find((s) => s.key === activeStepKey) || STEPS[0],
    [activeStepKey, STEPS]
  );
  const previousStep = useMemo(() => {
    const idx = STEPS.findIndex((s) => s.key === activeStepKey);
    return idx > 0 ? STEPS[idx - 1] : null;
  }, [activeStepKey, STEPS]);

  const status =
    statusOverrides[activeStep.key] ??
    serverStatuses[activeStep.key] ??
    "pending";
  const isFirstStep = activeStep.index === 1;

  const running = status === "running";

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === "running" && status === "done") {
      setTab("output");
    }
    prevStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    setShowFullTopic(false);
  }, [client, runId, runChromeLabel]);

  useEffect(() => {
    setOutputEditKey(0);
  }, [activeStepKey]);

  const inputTabTitle = previousStep
    ? `Input: ${previousStep.label}`
    : "Input: topic";
  const outputTabTitle = `Output: ${activeStep.label}`;

  const runningStep = useMemo(
    () => STEPS.find((s) => statuses[s.key] === "running") || null,
    [STEPS, statuses]
  );
  const chromeStep = runningStep || activeStep;
  const chromeStatus = statuses[chromeStep.key] ?? "pending";

  return (
    <div className="run-shell">
      <header className="run-chrome-header run-chrome-header--minimal">
        <div className="run-chrome-minimal-row">
          <div className="run-chrome-step-meta">
            <h1 className="run-page-title run-page-title--inline">
              {chromeStep.label}
            </h1>
            <span className={`status-pill status-pill--sm ${statusClass(chromeStatus)}`}>
              <span className={`status-pip ${statusClass(chromeStatus)}`} />
              {statusLabel(chromeStatus)}
            </span>
            <span className="run-chrome-step-tag">
              {chromeStep.index}/{STEPS.length}
            </span>
          </div>
          <div
            className="tab-bar tab-bar--compact run-chrome-tabs"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "input"}
              className={`tab tab--compact ${tab === "input" ? "active" : ""}`}
              onClick={() => setTab("input")}
              title={inputTabTitle}
            >
              Input
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "output"}
              className={`tab tab--compact ${tab === "output" ? "active" : ""}`}
              onClick={() => setTab("output")}
              title={outputTabTitle}
            >
              Output
            </button>
          </div>
        </div>
        {displayChromeLabel ? (
          displayChromeNeedsExpand ? (
            <button
              type="button"
              className={`run-chrome-topic-bar run-chrome-topic-bar--minimal${
                showFullTopic ? " run-chrome-topic-bar--expanded" : ""
              }`}
              onClick={() => setShowFullTopic((v) => !v)}
              aria-expanded={showFullTopic}
              aria-label={showFullTopic ? "Hide full title" : "Show full title"}
            >
              <span className="run-chrome-topic run-chrome-topic--minimal">
                {showFullTopic ? displayChromeFullText : displayChromeLabel}
              </span>
            </button>
          ) : (
            <p className="run-chrome-topic-bar run-chrome-topic-bar--minimal run-chrome-topic-bar--static">
              <span className="run-chrome-topic run-chrome-topic--minimal run-chrome-topic--expanded">
                {displayChromeLabel}
              </span>
            </p>
          )
        ) : null}
      </header>

      {stepError || error ? (
        <div className="run-alert" role="alert">
          {stepError || error}
        </div>
      ) : null}

      <div className="run-content-wrap run-content-wrap--compact">
        {tab === "input" ? (
            <RunInputPanel
            client={client}
            runId={runId}
            isFirstStep={isFirstStep}
            topic={topic}
            isSocial={isSocial}
            manualInputs={manualInputs}
            useLocation={run?.use_location}
            locationValue={run?.location_value}
            onRefreshRun={refreshRun}
            previousStep={previousStep}
            previousStatus={previousStep ? statuses[previousStep.key] : "done"}
            activeStepKey={activeStep.key}
            statuses={statuses}
            toast={toast}
            pipelineId={pipelineId}
          />
        ) : (
          <RunOutputPanel
            client={client}
            runId={runId}
            run={run}
            step={activeStep}
            manualInputs={run?.manual_inputs}
            targetWordCount={run?.target_word_count}
            status={status}
            running={running}
            toast={toast}
            headerEditKey={outputEditKey}
            pipelineId={pipelineId}
            topic={topic}
            statuses={statuses}
            onPatchStepStatus={onPatchStepStatus}
            onRefreshRun={refreshRun}
            onStepError={setStepError}
            onRunComplete={refreshRun}
            onShowOutput={() => setTab("output")}
            onGoToNextStep={() => {
              const i = STEPS.findIndex((s) => s.key === activeStepKey);
              const next = STEPS[i + 1];
              if (next) onSelectStep(next.key);
            }}
          />
        )}
      </div>
    </div>
  );
}
