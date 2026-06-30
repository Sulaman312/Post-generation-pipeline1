import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { stepsForPipeline } from "../../constants/pipelines";
import { isSocialPipeline, socialRunChromeLabel } from "../../utils/socialRunTopic";
import SocialRunInputPanel from "./SocialRunInputPanel";
import { inputSourceForStep } from "../../utils/pipelineFlow";
import { parseTopicCard } from "../../utils/parseTopicCard";
import { executeRunStep } from "../../utils/runStepAction";
import Markdown from "../shared/Markdown";
import MarkdownArtifactPanel from "../shared/MarkdownArtifactPanel";
import ArtifactFormattedPreview from "./ArtifactFormattedPreview";
import TopicCardStructured from "./TopicCardStructured";
import ContentAngleStructured from "./ContentAngleStructured";
import { isContentAngleFormat } from "../../utils/parseContentAngleIntent";
import FinalOutputDocEditor from "./FinalOutputDocEditor";
import ImageComposer from "./ImageComposer";
import "./ImageGenerationStep.css";
import { copyFormattedMarkdown } from "../../utils/markdownExport";
import { PIPELINE_MARKDOWN_CLASS } from "../../constants/markdownPreview";
import { splitFinalOutput } from "../../utils/parseFinalOutput";
import { isImageFile, readImageFileAsBase64 } from "../../utils/readImageFile";

const AUTOSAVE_MS = 1000;

function statusClass(s) {
  if (s === "done" || s === "running" || s === "error" || s === "skipped")
    return s;
  return "";
}

function statusLabel(s) {
  if (s === "done") return "Done";
  if (s === "running") return "Running";
  if (s === "error") return "Error";
  if (s === "skipped") return "Skipped";
  return "Pending";
}

export default function RunView({
  client,
  runId,
  activeStepKey,
  statusOverrides = {},
  onSelectStep,
  onBack,
}) {
  const { toast } = useToast();
  const [run, setRun] = useState(null);
  const [tab, setTab] = useState("output");
  const [error, setError] = useState(null);
  const [outputEditKey, setOutputEditKey] = useState(0);

  const refreshRun = useCallback(async () => {
    try {
      const r = await api.getRun(client, runId);
      setRun(r);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [client, runId]);

  useEffect(() => {
    refreshRun();
    const id = setInterval(refreshRun, 2000);
    return () => clearInterval(id);
  }, [refreshRun]);

  useEffect(() => {
    function onStepComplete(e) {
      const d = e.detail;
      if (d?.clientId !== client || d?.runId !== runId) return;
      refreshRun();
      setTab("output");
    }
    window.addEventListener("cf:run-step-complete", onStepComplete);
    return () => window.removeEventListener("cf:run-step-complete", onStepComplete);
  }, [client, runId, refreshRun]);

  useEffect(() => {
    setOutputEditKey(0);
  }, [activeStepKey]);

  useEffect(() => {
    refreshRun();
  }, [activeStepKey, refreshRun]);

  const serverStatuses = run?.statuses || {};
  const statuses = { ...serverStatuses, ...statusOverrides };
  const topic = run?.topic || "";
  const pipelineId = run?.pipeline_id || "article";
  const manualInputs = run?.manual_inputs;
  const isSocial = isSocialPipeline(pipelineId);
  const runChromeLabel = isSocial
    ? socialRunChromeLabel(manualInputs, topic)
    : topic?.trim() || "";
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
  const [stepError, setStepError] = useState(null);
  const [inlineRunning, setInlineRunning] = useState(false);

  const prevStatusRef = useRef(null);
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === "running" && status === "done") {
      setTab("output");
    }
    prevStatusRef.current = status;
  }, [status]);

  const inputTabTitle = previousStep
    ? `Input: ${previousStep.label}`
    : "Input: topic";
  const outputTabTitle = `Output: ${activeStep.label}`;

  return (
    <div className="run-shell">
      <header className="run-chrome-header run-chrome-header--minimal">
        <div className="run-chrome-minimal-row">
          <div className="run-chrome-step-meta">
            <h1 className="run-page-title run-page-title--inline">
              {activeStep.label}
            </h1>
            <span className={`status-pill status-pill--sm ${statusClass(status)}`}>
              <span className={`status-pip ${statusClass(status)}`} />
              {statusLabel(status)}
            </span>
            <span className="run-chrome-step-tag">
              {activeStep.index}/{STEPS.length}
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
        {runChromeLabel ? (
          <p
            className="run-chrome-topic run-chrome-topic--minimal"
            title={runChromeLabel}
          >
            {runChromeLabel}
          </p>
        ) : null}
      </header>

      {stepError || error ? (
        <div className="run-alert" role="alert">
          {stepError || error}
        </div>
      ) : null}

      <div className="run-content-wrap run-content-wrap--compact">
        {tab === "input" ? (
          <InputPanel
            client={client}
            runId={runId}
            isFirstStep={isFirstStep}
            topic={topic}
            isSocial={isSocial}
            manualInputs={manualInputs}
            onRefreshRun={refreshRun}
            previousStep={previousStep}
            previousStatus={previousStep ? statuses[previousStep.key] : "done"}
            activeStepKey={activeStep.key}
            statuses={statuses}
            toast={toast}
            pipelineId={pipelineId}
          />
        ) : (
          <OutputPanel
            client={client}
            runId={runId}
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
            inlineRunning={inlineRunning}
            onInlineRunningChange={setInlineRunning}
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

function copyMarkdownForStep(markdown, stepName) {
  if (stepName === "final_output") {
    const split = splitFinalOutput(markdown);
    return split.displayMarkdown || markdown;
  }
  return markdown;
}

function CopyOutputButton({ text, stepName, toast }) {
  const [copying, setCopying] = useState(false);
  async function handleCopy() {
    const source = copyMarkdownForStep(text, stepName);
    if (!String(source || "").trim()) return;
    setCopying(true);
    try {
      const ok = await copyFormattedMarkdown(source);
      if (ok) {
        toast?.("Copied formatted article — paste into Word or your CMS", {
          variant: "success",
          duration: 3500,
        });
      } else {
        toast?.("Could not copy", { variant: "error", duration: 4000 });
      }
    } finally {
      setCopying(false);
    }
  }
  return (
    <button
      type="button"
      className="btn btn-sm btn-edit-artifact"
      onClick={handleCopy}
      disabled={copying}
      title="Copy formatted article (not markdown source)"
    >
      {copying ? "Copying…" : "Copy"}
    </button>
  );
}

function InputPanel({
  client,
  runId,
  isFirstStep,
  topic,
  isSocial,
  manualInputs,
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
    />
  );
}

function OutputPanel({
  client,
  runId,
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
  const showInlineRun = (pipelineId || "article") === "social_media";

  async function handleInlineRun() {
    if (!showInlineRun) return;
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

  if (inlineRunning || running || status === "running") {
    return (
      <div className="run-artifact-shell">
        <div className="run-artifact-card">
          <div className="run-artifact-body">
            <div className="empty-state empty-state-inline">
              <span className="spinner" /> Generating{" "}
              {step.label.toLowerCase()}…
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (status !== "done") {
    return (
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
    );
  }
  return (
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
    />
  );
}

function ArtifactView({
  client,
  runId,
  stepName,
  readOnly,
  toast,
  manualInputs = null,
  targetWordCount = null,
  headerEditKey = 0,
  useHeaderEdit = false,
  allowStructuredTopicCard = false,
  onSaveAndContinue,
}) {
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const lastKey = useRef("");
  const autosaveTimer = useRef(null);
  const lastHeaderEditKey = useRef(-1);
  const isFinalDoc = stepName === "final_output";
  const showCopyOutput = ["draft", "fact_check", "final_output", "captions"].includes(
    stepName
  );

  function clearAutosaveTimer() {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
  }

  useEffect(() => {
    lastHeaderEditKey.current = -1;
    if (stepName === "final_output" && !readOnly) setEditing(true);
    else setEditing(false);
  }, [stepName, readOnly]);

  useEffect(() => {
    if (readOnly || !useHeaderEdit) return;
    if (headerEditKey <= 0 || headerEditKey === lastHeaderEditKey.current)
      return;
    lastHeaderEditKey.current = headerEditKey;
    setEditing(true);
  }, [headerEditKey, readOnly, useHeaderEdit]);

  useEffect(() => {
    const key = `${client}|${runId}|${stepName}`;
    lastKey.current = key;
    let cancelled = false;
    setLoading(true);
    api
      .getArtifact(client, runId, stepName)
      .then((c) => {
        if (cancelled || lastKey.current !== key) return;
        setContent(c);
        setDraft(c);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearAutosaveTimer();
    };
  }, [client, runId, stepName]);

  useEffect(() => {
    if (!editing || readOnly || loading) return;
    if (!content) return;
    if (draft === content) return;
    clearAutosaveTimer();
    autosaveTimer.current = window.setTimeout(async () => {
      autosaveTimer.current = null;
      try {
        await api.saveArtifact(client, runId, stepName, draft);
        setContent(draft);
        setSavedAt(Date.now());
      } catch (e) {
        const msg = e?.message || String(e);
        toast?.(msg, { variant: "error", duration: 11000 });
      }
    }, AUTOSAVE_MS);
    return clearAutosaveTimer;
  }, [draft, editing, readOnly, loading, content, client, runId, stepName, toast]);

  async function handleSave() {
    clearAutosaveTimer();
    try {
      await api.saveArtifact(client, runId, stepName, draft);
      setContent(draft);
      if (stepName !== "final_output") setEditing(false);
      setSavedAt(Date.now());
      toast?.("Saved", { variant: "success", duration: 3000 });
    } catch (e) {
      const msg = e?.message || String(e);
      toast?.(msg, { variant: "error", duration: 11000 });
    }
  }

  async function handleSaveAndContinue() {
    clearAutosaveTimer();
    try {
      await api.saveArtifact(client, runId, stepName, draft);
      setContent(draft);
      setEditing(false);
      setSavedAt(Date.now());
      onSaveAndContinue?.();
    } catch (e) {
      const msg = e?.message || String(e);
      toast?.(msg, { variant: "error", duration: 11000 });
    }
  }

  const showEditorDock =
    !readOnly && editing && typeof onSaveAndContinue === "function";

  const topicCardPreview =
    stepName === "topic_card" &&
    Boolean(parseTopicCard(content)) &&
    (!readOnly || allowStructuredTopicCard) ? (
      <TopicCardStructured text={content} manualInputs={manualInputs} />
    ) : null;

  const contentAnglePreview =
    stepName === "content_angle_intent" && isContentAngleFormat(content) ? (
      <ContentAngleStructured text={content} />
    ) : null;

  const imageGenerationPreview =
    stepName === "image_generation" ? (
      <GeneratedImagesPanel client={client} runId={runId} toast={toast} />
    ) : null;

  const imageComposePreview =
    stepName === "image_compose" ? (
      <ImageComposePanel client={client} runId={runId} toast={toast} />
    ) : null;

  const imageFormatsPreview =
    stepName === "image_formats" ? (
      <FormattedImagesPanel client={client} runId={runId} toast={toast} />
    ) : null;

  const imageTemplatePreview =
    stepName === "image_template" ? (
      <TemplatePlacementPanel client={client} runId={runId} toast={toast} />
    ) : null;

  const socialReviewPreview =
    stepName === "review_checklist" ? (
      <SocialPostReviewPreview
        client={client}
        runId={runId}
        reviewContent={content}
        toast={toast}
      />
    ) : null;

  const interactivePreview =
    imageComposePreview ||
    imageGenerationPreview ||
    imageFormatsPreview ||
    imageTemplatePreview;

  const structuredOnly =
    topicCardPreview || contentAnglePreview || null;

  const formattedPreview = interactivePreview
    ? interactivePreview
    : socialReviewPreview
      ? socialReviewPreview
    : structuredOnly
      ? (
          <ArtifactFormattedPreview
            structured={structuredOnly}
            content={content}
            showFullSource={stepName === "content_angle_intent"}
          />
        )
      : null;

  const artifactShellClass = [
    "run-artifact-shell",
    interactivePreview ? "run-artifact-shell--fit" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (loading) {
    return (
      <div className="run-artifact-shell">
        <div className="empty-state">
          <span className="spinner" /> loading…
        </div>
      </div>
    );
  }
  if (!content) {
    return (
      <div className="run-artifact-shell">
        <div className="run-artifact-card">
          <div className="run-artifact-body">
            <div className="empty-state">empty artifact</div>
          </div>
        </div>
      </div>
    );
  }

  const savedHint =
    !readOnly && savedAt && Date.now() - savedAt < 2500 ? (
      <span className="run-save-hint">Saved</span>
    ) : null;

  const editorDock = showEditorDock ? (
    <div className="run-editor-dock">
      <button
        type="button"
        className="btn btn-dock-secondary"
        onClick={handleSave}
      >
        Save
      </button>
      <button
        type="button"
        className="btn btn-primary btn-dock-primary"
        onClick={handleSaveAndContinue}
      >
        Save &amp; continue
        <span className="btn-play-ico" aria-hidden>
          ▶
        </span>
      </button>
    </div>
  ) : null;

  return (
    <div className={artifactShellClass}>
      <div className="run-artifact-card">
        {isFinalDoc ? (
          <>
            <div
              className={`run-artifact-body run-artifact-body--flush`}
            >
              <FinalOutputDocEditor
                value={editing ? draft : content}
                onChange={setDraft}
                readOnly={!editing || readOnly}
                targetWordCount={targetWordCount}
                onRequestEdit={() => setEditing(true)}
                toolbarExtra={
                  !readOnly ? (
                    <>
                      {savedHint}
                      {showCopyOutput ? (
                        <CopyOutputButton
                          text={editing ? draft : content}
                          stepName={stepName}
                          toast={toast}
                        />
                      ) : null}
                    </>
                  ) : null
                }
              />
            </div>
            {editorDock}
          </>
        ) : (
          <MarkdownArtifactPanel
            content={content}
            draft={draft}
            editing={editing && !readOnly}
            onDraftChange={setDraft}
            onEditingChange={(v) => {
              if (!v) clearAutosaveTimer();
              setEditing(v);
            }}
            readOnly={readOnly}
            canEdit={!readOnly && !interactivePreview}
            bodyClassName={interactivePreview ? "run-artifact-body--flush" : ""}
            previewNode={formattedPreview}
            savedHint={interactivePreview ? null : savedHint}
            footer={editorDock}
            textareaRows={22}
            showCopy={Boolean(content) && !interactivePreview}
            copySource={
              stepName === "final_output"
                ? copyMarkdownForStep(content, stepName)
                : content
            }
            onCopySuccess={() =>
              toast?.("Copied formatted article — paste into Word or your CMS", {
                variant: "success",
                duration: 3500,
              })
            }
            onCopyError={() =>
              toast?.("Could not copy", { variant: "error", duration: 4000 })
            }
          />
        )}
      </div>
    </div>
  );
}

function IconImages() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="m3 16 5-5 4 4 3-3 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 16V4m0 0 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h16" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2.5 4h11M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M4 4l.5 8.5a1 1 0 0 0 1 .9h5a1 1 0 0 0 1-.9L12 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 7v4M9.5 7v4" strokeLinecap="round" />
    </svg>
  );
}

const MAX_PRIMARY_UPLOAD_BYTES = 8 * 1024 * 1024;

function GeneratedImagesPanel({ client, runId, toast }) {
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState([]);
  const [imageMeta, setImageMeta] = useState({});
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [imageVersions, setImageVersions] = useState({});
  const uploadInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listRunImages(client, runId)
      .then((data) => {
        if (cancelled) return;
        setImages(data.images || []);
        setImageMeta(data.image_meta || {});
        setSelected(data.selected_primary || null);
      })
      .catch(() => {
        if (cancelled) return;
        setImages([]);
        setImageMeta({});
        setSelected(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, runId]);

  async function choose(fn) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.selectRunImage(client, runId, fn);
      setSelected(res.selected_primary || fn);
      setImageMeta(res.image_meta || imageMeta);
      toast?.("Selected primary image.", { variant: "success", duration: 2500 });
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(styleKey) {
    if (!styleKey || regenerating) return;
    setRegenerating(styleKey);
    try {
      const res = await api.regenerateStyleImage(client, runId, styleKey);
      setImages(res.images || []);
      setImageMeta(res.image_meta || {});
      setSelected(res.selected_primary || selected);
      const regenFn = Object.entries(res.image_meta || {}).find(
        ([, info]) => info?.style_key === styleKey
      )?.[0];
      if (regenFn) {
        setImageVersions((prev) => ({ ...prev, [regenFn]: Date.now() }));
      }
      toast?.("Regenerated this style.", { variant: "success", duration: 2500 });
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    } finally {
      setRegenerating(null);
    }
  }

  function applyImageIndex(res) {
    setImages(res.images || []);
    setImageMeta(res.image_meta || {});
    setSelected(res.selected_primary || null);
  }

  async function handleUploadFile(file) {
    if (!file || uploading || busy) return;
    if (!isImageFile(file) || /\.svg$/i.test(file.name || "")) {
      toast?.("Image must be PNG, JPG, WebP, or GIF.", { variant: "error", duration: 6000 });
      return;
    }
    if (file.size > MAX_PRIMARY_UPLOAD_BYTES) {
      toast?.("Image must be 8 MB or smaller.", { variant: "error", duration: 6000 });
      return;
    }
    setUploading(true);
    try {
      const b64 = await readImageFileAsBase64(file);
      const res = await api.uploadRunImage(client, runId, b64, { setPrimary: true });
      applyImageIndex(res);
      const uploadedFn = res.selected_primary;
      if (uploadedFn) {
        setImageVersions((prev) => ({ ...prev, [uploadedFn]: Date.now() }));
      }
      toast?.("Uploaded image set as primary.", { variant: "success", duration: 2500 });
    } catch (e) {
      const msg = e?.message || String(e);
      const hint = msg.includes("Could not reach API")
        ? `${msg} If Flask was already running, stop it (Ctrl+C) and run python main.py again from the repo root.`
        : msg;
      toast?.(hint, { variant: "error", duration: 12000 });
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  async function onUploadInputChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUploadFile(file);
  }

  async function removeImage(fn, styleLabel) {
    if (!fn || deleting) return;
    const label = styleLabel || fn;
    const ok = window.confirm(`Delete “${label}”?\n\nThis removes the image from this run.`);
    if (!ok) return;
    setDeleting(fn);
    try {
      const res = await api.deleteRunImage(client, runId, fn);
      applyImageIndex(res);
      setImageVersions((prev) => {
        const next = { ...prev };
        delete next[fn];
        return next;
      });
      toast?.("Image deleted.", { variant: "success", duration: 2500 });
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <div className="empty-state empty-state-inline">
        <span className="spinner" /> loading images…
      </div>
    );
  }
  const panelBusy = busy || uploading || Boolean(regenerating) || Boolean(deleting);

  return (
    <div className="step4-shell">
      <section className="step4-section" aria-labelledby="step4-select-heading">
        <header className="step4-section-header">
          <div className="step4-section-heading">
            <div className="step4-section-icon" aria-hidden>
              <IconImages />
            </div>
            <div>
              <h3 className="step4-section-title" id="step4-select-heading">
                Choose primary image
              </h3>
              <p className="step4-section-desc">
                Pick a generated style or upload your own image — then continue to Step 5 for
                platform exports.
              </p>
            </div>
          </div>
          {selected ? (
            <span className="step4-primary-badge">
              <IconCheck />
              {selected}
            </span>
          ) : null}
        </header>

        <div className="step4-section-body">
          {!images.length ? (
            <p className="step4-empty-inline">No generated images yet. Upload your own below.</p>
          ) : null}
          <div className="step4-image-grid" role="list">
            {images.map((fn) => {
              const isSel = fn === selected;
              const meta = imageMeta[fn] || {};
              const styleLabel = meta.style_label || fn;
              const styleKey = meta.style_key || "";
              const isUpload = styleKey === "upload";
              const isRegenerating = regenerating === styleKey;
              const isDeleting = deleting === fn;
              return (
                <div
                  key={fn}
                  role="listitem"
                  className={`step4-image-card${isSel ? " step4-image-card--selected" : ""}`}
                >
                  <button
                    type="button"
                    className="step4-image-delete"
                    disabled={panelBusy}
                    aria-label={`Delete ${styleLabel}`}
                    title="Delete image"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(fn, styleLabel);
                    }}
                  >
                    {isDeleting ? <span className="spinner spinner--sm" /> : <IconTrash />}
                  </button>
                  <button
                    type="button"
                    className="step4-image-select"
                    onClick={() => choose(fn)}
                    disabled={panelBusy}
                    aria-pressed={isSel}
                    title={isSel ? "Primary image" : "Select as primary"}
                  >
                    <div className="step4-image-frame">
                      <img
                        src={`${api.generatedImageUrl(client, runId, fn)}?v=${imageVersions[fn] || 0}`}
                        alt={styleLabel}
                        loading="lazy"
                      />
                      <span className="step4-image-check" aria-hidden>
                        <IconCheck />
                      </span>
                    </div>
                    <div className="step4-image-footer">
                      <span className="step4-style-chip">{styleLabel}</span>
                      <span className="step4-image-select-hint">
                        {busy ? "Saving…" : isSel ? "Primary" : "Select"}
                      </span>
                    </div>
                  </button>
                  {styleKey && !isUpload ? (
                    <button
                      type="button"
                      className="step4-regenerate-btn"
                      disabled={panelBusy}
                      onClick={() => regenerate(styleKey)}
                    >
                      {isRegenerating ? "Regenerating…" : "Regenerate style"}
                    </button>
                  ) : null}
                </div>
              );
            })}
            <div className="step4-image-card step4-image-card--upload" role="listitem">
              <input
                ref={uploadInputRef}
                id={`step4-upload-${runId}`}
                type="file"
                className="step4-upload-input"
                accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                onChange={onUploadInputChange}
                disabled={panelBusy}
              />
              <label
                htmlFor={`step4-upload-${runId}`}
                className={`step4-upload-label${panelBusy ? " step4-upload-label--disabled" : ""}`}
              >
                <span className="step4-upload-icon" aria-hidden>
                  {uploading ? <span className="spinner" /> : <IconUpload />}
                </span>
                <span className="step4-upload-title">
                  {uploading ? "Uploading…" : "Upload your image"}
                </span>
                <span className="step4-upload-hint">PNG, JPG, WebP — max 8 MB. Sets as primary.</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {selected ? (
        <div className="step4-empty-hint">
          Primary selected. Continue to <strong>Step 5 — Resize &amp; formats</strong>.
        </div>
      ) : (
        <div className="step4-empty-hint">Select a primary image to continue to Step 5.</div>
      )}
    </div>
  );
}

function ImageComposePanel({ client, runId, toast }) {
  const [loading, setLoading] = useState(true);
  const [primaryImage, setPrimaryImage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listRunImages(client, runId)
      .then((data) => {
        if (cancelled) return;
        setPrimaryImage(data.selected_primary || null);
      })
      .catch(() => {
        if (cancelled) return;
        setPrimaryImage(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, runId]);

  if (loading) {
    return (
      <div className="empty-state empty-state-inline">
        <span className="spinner" /> loading…
      </div>
    );
  }

  if (!primaryImage) {
    return (
      <div className="step4-shell">
        <div className="step4-empty-hint">
          No primary image selected. Go back to <strong>Step 4 — Image generation</strong> and
          choose one first.
        </div>
      </div>
    );
  }

  return (
    <ImageComposer
      key={primaryImage}
      client={client}
      runId={runId}
      primaryImage={primaryImage}
      toast={toast}
    />
  );
}

function FormattedImagesPanel({ client, runId, toast }) {
  const [cacheKey, setCacheKey] = useState("");
  const [outputs, setOutputs] = useState([]);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const idx = await api.getFormatsIndex(client, runId);
        if (cancelled) return;
        const key = idx?.generated_at || "";
        if (key) {
          setCacheKey((prev) => (prev === key ? prev : key));
        }
        const raw = idx?.outputs || {};
        const list = Object.entries(raw).map(([platformKey, info]) => ({
          key: platformKey,
          label: info?.label
            ? `${info.label} (${info.width}×${info.height})`
            : platformKey,
          filename: info?.filename || "",
        }));
        setOutputs(list.filter((o) => o.filename));
      } catch {
        /* keep previous */
      }
    }
    load();
    const id = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, runId]);

  async function handleDownload(filename) {
    if (downloading) return;
    setDownloading(filename);
    try {
      await api.downloadFormattedImage(client, runId, filename, cacheKey);
    } catch (err) {
      toast?.(err?.message || String(err), { variant: "error", duration: 9000 });
    } finally {
      setDownloading(null);
    }
  }

  const displayOutputs =
    outputs.length > 0
      ? outputs
      : [
          { key: "instagram", label: "Instagram (1080×1350)", filename: "ig_1080x1350.png" },
          { key: "linkedin", label: "LinkedIn (1200×628)", filename: "li_1200x628.png" },
          { key: "facebook", label: "Facebook (1200×630)", filename: "fb_1200x630.png" },
        ];

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Formatted images</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Full image preserved — empty space is filled with a blurred extension of the image.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
          marginTop: 14,
        }}
      >
        {displayOutputs.map((o) => {
          const url = api.formattedImageUrl(client, runId, o.filename, cacheKey);
          return (
            <div
              key={o.key}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--canvas)",
                padding: 12,
                overflow: "hidden",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{o.label}</div>
              <img
                src={url}
                alt={o.filename}
                style={{
                  width: "100%",
                  height: 220,
                  objectFit: "contain",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "#f3f4f6",
                }}
                onError={() => {
                  toast?.(
                    `Formatted image not found yet (${o.filename}). Run Step 6 first.`,
                    { variant: "error", duration: 9000 }
                  );
                }}
                loading="lazy"
              />
              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-edit-artifact"
                  onClick={() => handleDownload(o.filename)}
                  disabled={downloading === o.filename}
                >
                  {downloading === o.filename ? "Downloading…" : "Download"}
                </button>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  {o.filename}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PLATFORM_PREVIEW_ORDER = [
  { key: "instagram", title: "Instagram", handlePrefix: "@", tone: "ig" },
  { key: "facebook", title: "Facebook", handlePrefix: "", tone: "fb" },
  { key: "linkedin", title: "LinkedIn", handlePrefix: "", tone: "li" },
];

function parsePlatformCaptions(markdown) {
  const sections = {};
  let current = null;
  for (const rawLine of String(markdown || "").split(/\r?\n/)) {
    const heading = rawLine.match(/^##\s+(Instagram|LinkedIn|Facebook)\s*$/i);
    if (heading) {
      current = heading[1].toLowerCase();
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(rawLine);
  }
  const clean = {};
  for (const [key, lines] of Object.entries(sections)) {
    clean[key] = lines
      .filter((line) => !/^\s*-\s*Suggested\s+(location tag|posting time window):/i.test(line))
      .join("\n")
      .trim();
  }
  return clean;
}

function clientLabelFromId(client) {
  return String(client || "Client")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function SocialPostReviewPreview({ client, runId, reviewContent, toast }) {
  const [captions, setCaptions] = useState({});
  const [formats, setFormats] = useState({});
  const [cacheKey, setCacheKey] = useState("");
  const [loading, setLoading] = useState(true);
  const brand = clientLabelFromId(client);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [captionMd, idx] = await Promise.all([
          api.getArtifact(client, runId, "captions"),
          api.getFormatsIndex(client, runId),
        ]);
        if (cancelled) return;
        setCaptions(parsePlatformCaptions(captionMd));
        setFormats(idx?.outputs || {});
        setCacheKey(idx?.generated_at || "");
      } catch (e) {
        if (!cancelled) {
          toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [client, runId, toast]);

  return (
    <div className="social-review">
      <section className="social-review-checklist">
        <Markdown text={reviewContent} className={PIPELINE_MARKDOWN_CLASS} />
      </section>
      <section className="social-review-platforms" aria-label="Platform feed previews">
        <div className="social-review-head">
          <div>
            <div className="social-review-title">Platform preview</div>
            <div className="social-review-subtitle">
              Feed-style previews using the final exported image and caption.
            </div>
          </div>
        </div>
        {loading ? (
          <div className="empty-state empty-state-inline">
            <span className="spinner" /> loading previews...
          </div>
        ) : (
          <div className="social-preview-grid">
            {PLATFORM_PREVIEW_ORDER.map((platform) => {
              const info = formats[platform.key] || {};
              const imageUrl = info.filename
                ? api.formattedImageUrl(client, runId, info.filename, cacheKey)
                : "";
              return (
                <PlatformPostCard
                  key={platform.key}
                  platform={platform}
                  brand={brand}
                  client={client}
                  caption={captions[platform.key] || ""}
                  imageUrl={imageUrl}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Avatar({ client, brand, className = "" }) {
  const [failed, setFailed] = useState(false);
  const initials = brand
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div className={`social-preview-avatar ${className}`}>
      {!failed ? (
        <img
          src={api.clientLogoUrl(client)}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initials || "CF"}</span>
      )}
    </div>
  );
}

function PlatformPostCard({ platform, brand, client, caption, imageUrl }) {
  if (platform.tone === "ig") {
    return (
      <article className="social-preview-card social-preview-card--instagram">
        <div className="ig-topbar">
          <Avatar client={client} brand={brand} />
          <div className="ig-identity">
            <strong>{brand.toLowerCase().replace(/\s+/g, "")}</strong>
            <span>Sponsored</span>
          </div>
          <span className="social-preview-more">...</span>
        </div>
        <PreviewImage imageUrl={imageUrl} alt={`${platform.title} post`} />
        <div className="ig-actions" aria-hidden>
          <span>♡</span><span>💬</span><span>↗</span><span className="ig-save">▱</span>
        </div>
        <div className="ig-likes">Liked by local businesses and others</div>
        <div className="ig-caption">
          <strong>{brand.toLowerCase().replace(/\s+/g, "")}</strong>{" "}
          <CaptionText text={caption} />
        </div>
        <div className="ig-meta">View all comments</div>
        <div className="ig-time">JUST NOW</div>
      </article>
    );
  }

  if (platform.tone === "fb") {
    return (
      <article className="social-preview-card social-preview-card--facebook">
        <div className="fb-header">
          <Avatar client={client} brand={brand} />
          <div>
            <strong>{brand}</strong>
            <span>Just now · 🌐</span>
          </div>
          <span className="social-preview-more">...</span>
        </div>
        <div className="fb-caption"><CaptionText text={caption} /></div>
        <PreviewImage imageUrl={imageUrl} alt={`${platform.title} post`} />
        <div className="fb-social-row"><span>👍 ❤️ 24</span><span>3 comments · 2 shares</span></div>
        <div className="fb-actions"><span>Like</span><span>Comment</span><span>Share</span></div>
      </article>
    );
  }

  return (
    <article className="social-preview-card social-preview-card--linkedin">
      <div className="li-header">
        <Avatar client={client} brand={brand} />
        <div>
          <strong>{brand}</strong>
          <span>Company page · Just now</span>
        </div>
        <button type="button">+ Follow</button>
      </div>
      <div className="li-caption"><CaptionText text={caption} /></div>
      <PreviewImage imageUrl={imageUrl} alt={`${platform.title} post`} />
      <div className="li-social-row"><span>👍 💡 18</span><span>4 comments · 1 repost</span></div>
      <div className="li-actions"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>
    </article>
  );
}

function CaptionText({ text }) {
  if (!String(text || "").trim()) {
    return <span className="social-preview-empty">No caption generated yet.</span>;
  }
  return String(text)
    .split(/\n{2,}/)
    .map((block, index) => (
      <span className="social-preview-caption-block" key={index}>
        {block.split(/\n/).map((line, lineIndex) => (
          <span key={lineIndex}>
            {line}
            {lineIndex < block.split(/\n/).length - 1 ? <br /> : null}
          </span>
        ))}
      </span>
    ));
}

function PreviewImage({ imageUrl, alt }) {
  if (!imageUrl) {
    return <div className="social-preview-image social-preview-image--empty">Run template export first</div>;
  }
  return (
    <div className="social-preview-image">
      <img src={imageUrl} alt={alt} loading="lazy" />
    </div>
  );
}

function TemplatePlacementPanel({ client, runId, toast }) {
  const [cacheKey, setCacheKey] = useState("");
  const [outputs, setOutputs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [template, setTemplate] = useState(null);
  const [drag, setDrag] = useState(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [idx, list] = await Promise.all([
          api.getFormatsIndex(client, runId),
          api.listImageTemplates(client),
        ]);
        if (cancelled) return;
        setCacheKey(idx?.generated_at || "");
        const available = Array.isArray(list) ? list : [];
        setTemplates(available);
        const firstTemplateId = available[0]?.id || "social_post";
        setSelectedTemplateId(firstTemplateId);
        const tpl = await api.getImageTemplate(client, runId, firstTemplateId);
        if (cancelled) return;
        const raw = idx?.outputs || {};
        setOutputs(
          Object.entries(raw)
            .map(([platformKey, info]) => ({
              key: platformKey,
              label: info?.label
                ? `${info.label} (${info.width}×${info.height})`
                : platformKey,
              filename: info?.filename || "",
              baseFilename: info?.base_filename || info?.filename || "",
              width: Number(info?.width || 1),
              height: Number(info?.height || 1),
            }))
            .filter((o) => o.filename)
        );
        setTemplate(tpl);
      } catch (e) {
        toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [client, runId, toast]);

  async function changeTemplate(templateId) {
    if (!templateId || templateId === selectedTemplateId || saving || downloading) return;
    setSelectedTemplateId(templateId);
    try {
      const tpl = await api.getImageTemplate(client, runId, templateId);
      setTemplate(tpl);
      toast?.("Template loaded.", { variant: "success", duration: 2500 });
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    }
  }

  function updateLayer(platformKey, layer, x, y) {
    setTemplate((prev) => {
      if (!prev) return prev;
      const formats = { ...(prev.formats || {}) };
      const fmt = { ...(formats[platformKey] || {}) };
      fmt[layer] = {
        ...(fmt[layer] || {}),
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
      };
      if (layer === "card" && fmt.text) {
        const dx = Math.round(x) - Number((formats[platformKey]?.card || {}).x || 0);
        const dy = Math.round(y) - Number((formats[platformKey]?.card || {}).y || 0);
        fmt.text = {
          ...fmt.text,
          x: Math.max(0, Math.round(Number(fmt.text.x || 0) + dx)),
          y: Math.max(0, Math.round(Number(fmt.text.y || 0) + dy)),
        };
      }
      formats[platformKey] = fmt;
      return { ...prev, formats };
    });
  }

  function startDrag(e, platform, layer, output) {
    const frame = e.currentTarget.closest("[data-template-frame]");
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const fmt = template?.formats?.[platform] || {};
    const cfg = fmt[layer] || {};
    setDrag({
      platform,
      layer,
      width: output.width,
      height: output.height,
      rect,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: Number(cfg.x || 0),
      startY: Number(cfg.y || 0),
    });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  useEffect(() => {
    if (!drag) return undefined;
    function onMove(e) {
      const sx = drag.width / Math.max(1, drag.rect.width);
      const sy = drag.height / Math.max(1, drag.rect.height);
      const x = drag.startX + (e.clientX - drag.startClientX) * sx;
      const y = drag.startY + (e.clientY - drag.startClientY) * sy;
      updateLayer(drag.platform, drag.layer, x, y);
    }
    function onUp() {
      setDrag(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag]);

  async function saveAndApply() {
    if (!template || saving) return;
    setSaving(true);
    try {
      await api.saveImageTemplate(client, runId, template);
      const res = await api.applyImageTemplate(client, runId);
      const key = res?.formats?.generated_at || Date.now();
      setCacheKey(String(key));
      toast?.("Template applied to exports.", { variant: "success", duration: 3500 });
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    } finally {
      setSaving(false);
    }
  }

  async function downloadImages() {
    if (downloading || saving || !template || !outputs.length) return;
    setDownloading(true);
    try {
      await api.saveImageTemplate(client, runId, template);
      const res = await api.applyImageTemplate(client, runId);
      const key = String(res?.formats?.generated_at || Date.now());
      const freshOutputs = Object.entries(res?.formats?.outputs || {})
        .map(([platformKey, info]) => ({
          key: platformKey,
          filename: info?.filename || "",
        }))
        .filter((o) => o.filename);
      const downloadOutputs = freshOutputs.length ? freshOutputs : outputs;
      setCacheKey(key);
      for (const output of downloadOutputs) {
        if (output.filename) {
          await api.downloadFormattedImage(client, runId, output.filename, key);
        }
      }
      toast?.("Template applied and images downloaded.", {
        variant: "success",
        duration: 3500,
      });
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    } finally {
      setDownloading(false);
    }
  }

  if (!template || !outputs.length) {
    return (
      <div className="step4-shell">
        <div className="step4-empty-hint">
          Run <strong>Step 5 — Resize &amp; formats</strong> first.
        </div>
      </div>
    );
  }

  const lines = template?.headline?.lines || [];

  return (
    <div className="template-panel">
      <div className="template-panel-head">
        <div>
          <div className="template-panel-title">Place client template</div>
          <div className="template-panel-subtitle">
            Drag the logo or text card on each platform image.
          </div>
        </div>
        <div className="template-panel-actions">
          <label className="template-select-label">
            <span>Template</span>
            <select
              className="template-select"
              value={selectedTemplateId}
              onChange={(e) => changeTemplate(e.target.value)}
              disabled={saving || downloading || templates.length <= 1}
            >
              {templates.length ? (
                templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name || tpl.id}
                  </option>
                ))
              ) : (
                <option value="social_post">social_post</option>
              )}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={downloadImages}
            disabled={downloading || saving}
          >
            {downloading ? "Downloading..." : "Download images"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={saveAndApply}
            disabled={saving}
          >
            {saving ? "Applying..." : "Save & apply"}
          </button>
        </div>
      </div>

      <div className="template-grid">
        {outputs.map((o) => {
          const fmt = template.formats?.[o.key] || {};
          const importedLayers = Array.isArray(fmt.layers) ? fmt.layers : null;
          const logo = fmt.logo || {};
          const card = fmt.card || {};
          const text = fmt.text || {};
          const url = api.formattedImageUrl(
            client,
            runId,
            importedLayers ? o.filename : o.baseFilename || o.filename,
            cacheKey
          );
          return (
            <div className="template-card" key={o.key}>
              <div className="template-card-title">{o.label}</div>
              <div
                className="template-frame"
                data-template-frame
                style={{ aspectRatio: `${o.width} / ${o.height}` }}
              >
                <img src={url} alt={o.filename} />
                {!importedLayers ? (
                  <>
                    <button
                      type="button"
                      className="template-logo-layer"
                      style={{
                        left: `${(Number(logo.x || 0) / o.width) * 100}%`,
                        top: `${(Number(logo.y || 0) / o.height) * 100}%`,
                        width: `${(Number(logo.width || 1) / o.width) * 100}%`,
                      }}
                      onPointerDown={(e) => startDrag(e, o.key, "logo", o)}
                      title="Drag logo"
                    >
                      <img src={api.clientLogoUrl(client)} alt="" />
                    </button>
                    <button
                      type="button"
                      className="template-text-card-layer"
                      style={{
                        left: `${(Number(card.x || 0) / o.width) * 100}%`,
                        top: `${(Number(card.y || 0) / o.height) * 100}%`,
                        width: `${(Number(card.width || 1) / o.width) * 100}%`,
                        height: `${(Number(card.height || 1) / o.height) * 100}%`,
                        borderRadius: `${Math.max(4, Number(card.radius || 16) / 3)}px`,
                        background: card.fill || "#111827",
                        opacity: card.opacity ?? 0.88,
                      }}
                      onPointerDown={(e) => startDrag(e, o.key, "card", o)}
                      title="Drag text card"
                    >
                      <span
                        style={{
                          fontSize: `${Math.max(10, (Number(text.fontSize || 36) / o.width) * 620)}px`,
                        }}
                      >
                        <strong>{lines[0]?.text || "Build with AI"}</strong>
                        <em>{lines[1]?.text || "Fast and efficient"}</em>
                      </span>
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
