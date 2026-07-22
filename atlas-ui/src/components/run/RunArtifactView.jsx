import { useEffect, useRef, useState } from "react";
import * as api from "../../services/api";
import MarkdownArtifactPanel from "../shared/MarkdownArtifactPanel";
import TextSkeleton from "../shared/TextSkeleton";
import { useLocale } from "../../context/LocaleContext";
import { isInteractiveOutputStep } from "../../utils/stepOutputKind";
import { copyFormattedMarkdown } from "../../utils/markdownExport";
import { localizePublishResultsMarkdown } from "../../utils/localizePublishResults";
import { splitFinalOutput } from "../../utils/parseFinalOutput";
import { parseTopicCard } from "../../utils/parseTopicCard";
import { isContentAngleFormat, extractAngleSectionFromBrief } from "../../utils/parseContentAngleIntent";
import { isSocialPipeline } from "../../utils/socialRunTopic";
import ArtifactFormattedPreview from "./ArtifactFormattedPreview";
import TopicCardStructured from "./TopicCardStructured";
import ContentAngleStructured from "./ContentAngleStructured";
import FinalOutputDocEditor from "./FinalOutputDocEditor";
import GeneratedImagesPanel from "./GeneratedImagesPanel";
import ImageComposePanel from "./ImageComposePanel";
import TemplatePlacementPanel from "./TemplatePlacementPanel";
import SocialPostReviewPreview from "./SocialPostReviewPreview";
import "./ImageGenerationStep.css";

export const AUTOSAVE_MS = 1000;

function copyMarkdownForStep(markdown, stepName) {
  if (stepName === "final_output") {
    const split = splitFinalOutput(markdown);
    return split.displayMarkdown || markdown;
  }
  return markdown;
}

function formattedCopyKind(pipelineId, stepName) {
  if (isSocialPipeline(pipelineId) || stepName === "captions") return "post";
  return "article";
}

export function CopyOutputButton({ text, stepName, toast, pipelineId = null }) {
  const { t } = useLocale();
  const [copying, setCopying] = useState(false);
  const copyKind = formattedCopyKind(pipelineId, stepName);
  async function handleCopy() {
    const source = copyMarkdownForStep(text, stepName);
    if (!String(source || "").trim()) return;
    setCopying(true);
    try {
      const ok = await copyFormattedMarkdown(source);
      if (ok) {
        toast?.(t("common.copiedFormatted", { kind: copyKind }), {
          variant: "success",
          duration: 3500,
        });
      } else {
        toast?.(t("common.couldNotCopy"), { variant: "error", duration: 4000 });
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
      title={t("common.copyFormattedKindTitle", { kind: copyKind })}
    >
      {copying ? t("common.copying") : t("common.copy")}
    </button>
  );
}

export default function ArtifactView({
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
  pipelineId = null,
}) {
  const { t } = useLocale();
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
    if (isInteractiveOutputStep(stepName)) {
      setLoading(false);
      return undefined;
    }
    const key = `${client}|${runId}|${stepName}`;
    lastKey.current = key;
    const cached = api.readCachedArtifact(client, runId, stepName);
    if (cached != null) {
      setContent(cached);
      setDraft(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
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
    async function onFlushSave(event) {
      const detail = event.detail || {};
      if (detail.clientId !== client || detail.runId !== runId || detail.stepName !== stepName) {
        return;
      }
      if (readOnly || draft === content) return;
      clearAutosaveTimer();
      try {
        await api.saveArtifact(client, runId, stepName, draft);
        setContent(draft);
        setSavedAt(Date.now());
      } catch {
        /* generation will use last saved version */
      }
    }
    window.addEventListener("cf:flush-artifact-save", onFlushSave);
    return () => window.removeEventListener("cf:flush-artifact-save", onFlushSave);
  }, [client, runId, stepName, draft, content, readOnly]);

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
    (stepName === "content_angle_intent" ||
      stepName === "client_profile_topic") &&
    isContentAngleFormat(
      stepName === "client_profile_topic"
        ? extractAngleSectionFromBrief(content)
        : content
    ) ? (
      <ContentAngleStructured
        text={
          stepName === "client_profile_topic"
            ? extractAngleSectionFromBrief(content)
            : content
        }
      />
    ) : null;

  const imageGenerationPreview =
    stepName === "image_generation" ? (
      <GeneratedImagesPanel client={client} runId={runId} toast={toast} />
    ) : null;

  const imageComposePreview =
    stepName === "image_compose" ? (
      <ImageComposePanel client={client} runId={runId} toast={toast} />
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
        toast={toast}
      />
    ) : null;

  const interactivePreview =
    imageComposePreview ||
    imageGenerationPreview ||
    imageTemplatePreview ||
    socialReviewPreview;

  const structuredOnly =
    topicCardPreview || contentAnglePreview || null;

  const formattedPreview = interactivePreview
    ? interactivePreview
    : structuredOnly
      ? (
          <ArtifactFormattedPreview
            structured={structuredOnly}
            content={content}
          />
        )
      : null;

  const artifactShellClass = [
    "run-artifact-shell",
    interactivePreview ? "run-artifact-shell--fit" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isInteractiveOutputStep(stepName)) {
    return (
      <div className={artifactShellClass}>
        <div className="run-artifact-card">
          <div className="run-artifact-body run-artifact-body--flush">{interactivePreview}</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="run-artifact-shell">
        <div className="run-artifact-card">
          <div className="run-artifact-body run-artifact-body--skeleton">
            <TextSkeleton lines={8} variant="body" />
          </div>
        </div>
      </div>
    );
  }
  if (!content) {
    return (
      <div className="run-artifact-shell">
        <div className="run-artifact-card">
          <div className="run-artifact-body">
            <div className="empty-state">{t("common.emptyArtifact")}</div>
          </div>
        </div>
      </div>
    );
  }

  const savedHint =
    !readOnly && savedAt && Date.now() - savedAt < 2500 ? (
      <span className="run-save-hint">{t("common.saved")}</span>
    ) : null;

  const editorDock = showEditorDock ? (
    <div className="run-editor-dock">
      <button
        type="button"
        className="btn btn-dock-secondary"
        onClick={handleSave}
      >
        {t("common.save")}
      </button>
      <button
        type="button"
        className="btn btn-primary btn-dock-primary"
        onClick={handleSaveAndContinue}
      >
        {t("common.saveAndContinue")}
        <span className="btn-play-ico" aria-hidden>
          ▶
        </span>
      </button>
    </div>
  ) : null;

  const publishPreviewContent =
    stepName === "publish"
      ? localizePublishResultsMarkdown(content, t)
      : null;

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
                          pipelineId={pipelineId}
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
            previewContent={publishPreviewContent}
            savedHint={interactivePreview ? null : savedHint}
            footer={editorDock}
            textareaRows={22}
            showCopy={Boolean(content) && !interactivePreview}
            copySource={
              stepName === "publish"
                ? publishPreviewContent
                : stepName === "final_output"
                  ? copyMarkdownForStep(content, stepName)
                  : content
            }
            onCopySuccess={() =>
              toast?.(
                t("common.copiedFormatted", {
                  kind: formattedCopyKind(pipelineId, stepName),
                }),
                {
                  variant: "success",
                  duration: 3500,
                }
              )
            }
            onCopyError={() =>
              toast?.(t("common.couldNotCopy"), {
                variant: "error",
                duration: 4000,
              })
            }
          />
        )}
      </div>
    </div>
  );
}
