import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import { warmAuthenticatedBlobCache } from "../../services/api/http";
import { useMediaReady } from "../../hooks/useMediaReady";
import AuthImage from "../shared/AuthImage";
import ImageSkeleton from "../shared/ImageSkeleton";
import TextSkeleton from "../shared/TextSkeleton";
import {
  formatDimensionsLabel,
  pickCanonicalFormatOutput,
  SHARED_FORMAT_ASPECT,
  TEMPLATE_EXPORT_POLICY,
} from "../../utils/socialFormatOutput";
import {
  applyEditableFieldsToTemplate,
  extractCanvasTextOverlays,
  extractEditableTemplateFields,
} from "../../utils/templateTextEdit";
import "./ImageGenerationStep.css";

export default function TemplatePlacementPanel({ client, runId, toast, skeletonOnly = false }) {
  const [cacheKey, setCacheKey] = useState("");
  const [canvasKey, setCanvasKey] = useState("");
  const [displayOutput, setDisplayOutput] = useState(null);
  const [loading, setLoading] = useState(!skeletonOnly);
  const [downloading, setDownloading] = useState(false);
  const [template, setTemplate] = useState(null);
  const [textFields, setTextFields] = useState([]);
  const [appliedFields, setAppliedFields] = useState([]);
  const [savingText, setSavingText] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState(null);

  const syncFromFormats = useCallback((idx) => {
    const generatedAt = idx?.generated_at || "";
    setCacheKey(generatedAt);
    setCanvasKey(generatedAt || String(Date.now()));
    const raw = idx?.outputs || {};
    const list = Object.entries(raw)
      .map(([platformKey, info]) => ({
        key: platformKey,
        label: info?.label
          ? `${info.label} (${info.width}×${info.height})`
          : platformKey,
        filename: info?.filename || "",
        width: Number(info?.width || 1),
        height: Number(info?.height || 1),
      }))
      .filter((o) => o.filename);
    const canonical = pickCanonicalFormatOutput(list);
    setDisplayOutput(canonical || null);
    if (canonical?.filename) {
      void warmAuthenticatedBlobCache(
        api.formattedImageUrl(client, runId, canonical.filename, generatedAt)
      );
    }
    if (canonical?.key) {
      void warmAuthenticatedBlobCache(
        api.templateCanvasPreviewUrl(client, runId, {
          platform: canonical.key,
          cacheKey: generatedAt || String(Date.now()),
        })
      );
    }
    return canonical;
  }, [client, runId]);

  const loadTemplateFields = useCallback(async (templateId, platformKey) => {
    const tpl = await api.getImageTemplate(client, runId, templateId);
    const fields = extractEditableTemplateFields(tpl, platformKey);
    setTemplate(tpl);
    setTextFields(fields);
    setAppliedFields(fields);
    return tpl;
  }, [client, runId]);

  const applyTemplate = useCallback(
    async (templateId) => {
      await api.getImageTemplate(client, runId, templateId);
      const res = await api.applyImageTemplate(client, runId);
      const formats = res?.formats || res;
      const canonical = syncFromFormats(formats);
      await loadTemplateFields(templateId, canonical?.key);
      return formats;
    },
    [client, runId, syncFromFormats, loadTemplateFields]
  );

  useEffect(() => {
    if (skeletonOnly) return undefined;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [idx, list] = await Promise.all([
          api.getFormatsIndex(client, runId),
          api.listImageTemplates(client),
        ]);
        if (cancelled) return;
        const available = Array.isArray(list) ? list : [];
        const templateId =
          idx?.template?.template_id || available[0]?.id || "social_post";
        if (!idx?.template_applied) {
          await applyTemplate(templateId);
        } else if (idx?.resize_policy !== TEMPLATE_EXPORT_POLICY) {
          await applyTemplate(templateId);
        } else {
          const canonical = syncFromFormats(idx);
          await loadTemplateFields(templateId, canonical?.key);
        }
      } catch (e) {
        toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [client, runId, toast, applyTemplate, syncFromFormats, loadTemplateFields, skeletonOnly]);

  async function handleDownload(filename) {
    if (downloading || !filename) return;
    setDownloading(true);
    try {
      await api.downloadFormattedImage(client, runId, filename, cacheKey);
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    } finally {
      setDownloading(false);
    }
  }

  const platformKey = displayOutput?.key;
  const overlays = useMemo(() => {
    const base = extractCanvasTextOverlays(template, platformKey);
    const byId = Object.fromEntries(textFields.map((f) => [f.id, f]));
    return base
      .map((o) => {
        const field = byId[o.id];
        return {
          ...o,
          text: field && Object.prototype.hasOwnProperty.call(field, "text") ? field.text : o.text,
          removable: Boolean(field?.removable ?? o.removable),
          removed: Boolean(field?.removed),
        };
      })
      .filter((o) => !o.removed);
  }, [template, platformKey, textFields]);

  const removedBadges = useMemo(
    () => textFields.filter((f) => f.removable && f.removed),
    [textFields]
  );

  const activeOverlay = overlays.find((o) => o.id === activeFieldId) || null;

  const textDirty = useMemo(() => {
    if (textFields.length !== appliedFields.length) return true;
    return textFields.some((field) => {
      const match = appliedFields.find((o) => o.id === field.id);
      if (!match) return true;
      return field.text !== match.text || Boolean(field.removed) !== Boolean(match.removed);
    });
  }, [textFields, appliedFields]);

  const editMode = Boolean(activeFieldId) || textDirty || savingText;

  const onFieldChange = useCallback((id, value) => {
    setTextFields((prev) => {
      if (prev.some((field) => field.id === id)) {
        return prev.map((field) => (field.id === id ? { ...field, text: value } : field));
      }
      return [...prev, { id, label: id, text: value, removable: id.startsWith("label:") }];
    });
  }, []);

  const persistDraftTemplate = useCallback(
    async (fields) => {
      if (!template) return template;
      const updated = applyEditableFieldsToTemplate(template, fields);
      const saved = await api.saveImageTemplate(client, runId, {
        template_id: updated.template_id,
        formats: updated.formats,
      });
      const next = saved || updated;
      setTemplate(next);
      setCanvasKey(String(Date.now()));
      return next;
    },
    [template, client, runId]
  );

  const onRemoveBadge = useCallback(
    async (id) => {
      if (savingText) return;
      const nextFields = textFields.map((field) =>
        field.id === id ? { ...field, removed: true } : field
      );
      setTextFields(nextFields);
      setActiveFieldId(null);
      setSavingText(true);
      try {
        await persistDraftTemplate(nextFields);
        toast?.("Badge removed from the design. Save to update all platforms.", {
          variant: "success",
          duration: 3500,
        });
      } catch (e) {
        toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
      } finally {
        setSavingText(false);
      }
    },
    [savingText, textFields, persistDraftTemplate, toast]
  );

  const onRestoreBadge = useCallback(
    async (id) => {
      if (savingText) return;
      const nextFields = textFields.map((field) =>
        field.id === id ? { ...field, removed: false } : field
      );
      setTextFields(nextFields);
      setSavingText(true);
      try {
        await persistDraftTemplate(nextFields);
        toast?.("Badge restored. Save to update all platforms.", {
          variant: "success",
          duration: 3500,
        });
      } catch (e) {
        toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
      } finally {
        setSavingText(false);
      }
    },
    [savingText, textFields, persistDraftTemplate, toast]
  );

  const onSaveDesignText = useCallback(async () => {
    if (!template || !textFields.length || savingText) return;
    setSavingText(true);
    try {
      const updated = applyEditableFieldsToTemplate(template, textFields);
      const saved = await api.saveImageTemplate(client, runId, {
        template_id: updated.template_id,
        formats: updated.formats,
      });
      const res = await api.applyImageTemplate(client, runId);
      const nextTemplate = saved || updated;
      const canonical = syncFromFormats(res?.formats || res);
      setTemplate(nextTemplate);
      const fields = extractEditableTemplateFields(nextTemplate, canonical?.key);
      setTextFields(fields);
      setAppliedFields(fields);
      setActiveFieldId(null);
      toast?.("Design updated on the branded image.", {
        variant: "success",
        duration: 4000,
      });
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    } finally {
      setSavingText(false);
    }
  }, [template, textFields, savingText, client, runId, syncFromFormats, toast]);

  if (skeletonOnly || loading) {
    return (
      <div className="template-panel channel-format-preview template-panel--brand template-panel--scroll">
        <div className="template-card channel-format-preview__card">
          <div
            className="template-frame"
            data-template-frame
            style={{ aspectRatio: SHARED_FORMAT_ASPECT }}
          >
            <ImageSkeleton variant="thumb" />
          </div>
          <div className="template-card-foot template-card-foot--skeleton">
            <TextSkeleton lines={1} variant="meta" className="template-card-foot-skeleton" />
          </div>
        </div>
      </div>
    );
  }

  if (!displayOutput) {
    return (
      <div className="step4-shell">
        <div className="step4-empty-hint">
          Select a primary image in <strong>Generate &amp; select image</strong> first.
        </div>
      </div>
    );
  }

  const showEditorChrome = overlays.length > 0 || removedBadges.length > 0;
  const useCanvasPreview = showEditorChrome && editMode;
  const url = useCanvasPreview
      ? api.templateCanvasPreviewUrl(client, runId, {
          platform: displayOutput.key || "instagram",
          cacheKey: canvasKey || cacheKey,
        })
      : api.formattedImageUrl(client, runId, displayOutput.filename, cacheKey);

  return (
    <div className="template-panel-with-editor template-panel-with-editor--canvas">
      <TemplatePreviewCard
        url={url}
        filename={displayOutput.filename}
        width={displayOutput.width}
        height={displayOutput.height}
        downloading={downloading}
        onDownload={() => handleDownload(displayOutput.filename)}
        overlays={overlays}
        activeFieldId={activeFieldId}
        saving={savingText}
        textDirty={textDirty}
        editMode={editMode}
        showEditorChrome={showEditorChrome}
        removedBadges={removedBadges}
        activeOverlay={activeOverlay}
        onActivate={setActiveFieldId}
        onEnterEditMode={() => {
          const first = overlays.find((o) => o.id === "headline") || overlays[0];
          if (first) setActiveFieldId(first.id);
        }}
        onFieldChange={onFieldChange}
        onRemoveBadge={onRemoveBadge}
        onRestoreBadge={onRestoreBadge}
        onSave={onSaveDesignText}
        onDeselect={() => setActiveFieldId(null)}
      />
    </div>
  );
}

function TemplatePreviewCard({
  url,
  filename,
  width,
  height,
  downloading,
  onDownload,
  overlays = [],
  activeFieldId,
  saving,
  textDirty = false,
  editMode = false,
  showEditorChrome = false,
  removedBadges = [],
  activeOverlay = null,
  onActivate,
  onEnterEditMode,
  onFieldChange,
  onRemoveBadge,
  onRestoreBadge,
  onSave,
  onDeselect,
}) {
  const { mediaReady, onMediaLoad } = useMediaReady(url);
  const sizeLabel = formatDimensionsLabel(width, height);

  return (
    <div className="template-panel channel-format-preview template-panel--brand">
      <div className="template-card channel-format-preview__card template-card--editor">
        <div
          className={`template-frame template-frame--editable${
            showEditorChrome && !editMode ? " template-frame--edit-ready" : ""
          }`}
          data-template-frame
          style={{ aspectRatio: SHARED_FORMAT_ASPECT }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onDeselect?.();
          }}
        >
          <AuthImage
            src={url}
            alt={filename}
            loading="eager"
            placeholder="thumb"
            keepPrevious
            onLoad={onMediaLoad}
            onMouseDown={() => {
              if (showEditorChrome && !editMode) {
                onEnterEditMode?.();
                return;
              }
              onDeselect?.();
            }}
          />
          {editMode && overlays.length > 0 ? (
            <div className="template-text-overlay-layer" aria-label="Editable design text">
              {overlays.map((overlay) => (
                <CanvasTextBox
                  key={overlay.id}
                  overlay={overlay}
                  active={activeFieldId === overlay.id}
                  disabled={saving}
                  onActivate={() => onActivate?.(overlay.id)}
                  onChange={(value) => onFieldChange?.(overlay.id, value)}
                  onRemove={
                    overlay.removable ? () => onRemoveBadge?.(overlay.id) : undefined
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="template-card-foot">
          {mediaReady ? (
            <>
              <div className="template-card-foot-left">
                <button
                  type="button"
                  className="btn btn-sm btn-primary template-download-btn"
                  onClick={onDownload}
                  disabled={downloading}
                >
                  {downloading ? "Downloading…" : "Download PNG"}
                </button>
                <span className="template-card-specs">{sizeLabel}</span>
              </div>
              {showEditorChrome ? (
                <div className="template-card-foot-actions">
                  {!editMode ? (
                    <button
                      type="button"
                      className="template-canvas-chip"
                      disabled={saving}
                      title="Edit headline and subline on the design"
                      onClick={() => onEnterEditMode?.()}
                    >
                      Edit text
                    </button>
                  ) : null}
                  {removedBadges.map((badge) => (
                    <button
                      key={badge.id}
                      type="button"
                      className="template-canvas-chip"
                      disabled={saving}
                      onClick={() => onRestoreBadge?.(badge.id)}
                    >
                      Restore {badge.label}
                    </button>
                  ))}
                  {activeOverlay?.removable ? (
                    <button
                      type="button"
                      className="template-canvas-chip template-canvas-chip--danger"
                      disabled={saving}
                      onClick={() => onRemoveBadge?.(activeOverlay.id)}
                    >
                      Remove {activeOverlay.label}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={!textDirty || saving}
                    onClick={onSave}
                  >
                    {saving ? "Updating…" : "Save & update"}
                  </button>
                  {editMode ? (
                    <button
                      type="button"
                      className="template-canvas-chip"
                      disabled={saving || textDirty}
                      onClick={() => onDeselect?.()}
                    >
                      Done
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <TextSkeleton lines={1} variant="meta" className="template-card-foot-skeleton" />
          )}
        </div>
      </div>
    </div>
  );
}

function CanvasTextBox({ overlay, active, disabled, onActivate, onChange, onRemove }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || active) return;
    if (ref.current.innerText !== overlay.text) {
      ref.current.innerText = overlay.text || "";
    }
  }, [overlay.text, active]);

  useEffect(() => {
    if (ref.current && !ref.current.innerText && overlay.text) {
      ref.current.innerText = overlay.text;
    }
  }, [overlay.text]);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.focus();
    }
  }, [active]);

  const isBadge = Boolean(overlay.removable);
  return (
    <div
      className={`template-text-box${active ? " template-text-box--active" : ""}${
        isBadge ? " template-text-box--badge" : " template-text-box--headline"
      }`}
      style={{
        left: `${overlay.leftPct}%`,
        top: `${overlay.topPct}%`,
        width: `${overlay.widthPct}%`,
        ...(isBadge
          ? { height: `${overlay.heightPct}%` }
          : { minHeight: `${overlay.heightPct}%`, height: "auto" }),
        color: overlay.fill,
        fontFamily: overlay.fontFamily,
        fontWeight: overlay.fontWeight,
        fontSize: `${overlay.fontSizePct}cqw`,
        textAlign: overlay.textAlign,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!active) onActivate?.();
      }}
    >
      {active ? (
        <span className="template-text-box__tag">{overlay.label}</span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          className="template-text-box__remove"
          title={`Remove ${overlay.label}`}
          aria-label={`Remove ${overlay.label} badge`}
          disabled={disabled}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
      <div
        ref={ref}
        className={`template-text-box__edit${
          overlay.singleLine ? " template-text-box__edit--single-line" : ""
        }`}
        role="textbox"
        tabIndex={disabled ? -1 : 0}
        contentEditable={!disabled}
        suppressContentEditableWarning
        aria-label={overlay.label}
        onFocus={() => onActivate?.()}
        onInput={(e) => onChange?.(e.currentTarget.innerText)}
        onBlur={(e) => onChange?.(e.currentTarget.innerText)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.currentTarget.blur();
          }
          if (onRemove && (e.key === "Delete" || e.key === "Backspace")) {
            const text = e.currentTarget.innerText || "";
            if (!text.trim()) {
              e.preventDefault();
              onRemove();
            }
          }
        }}
      />
    </div>
  );
}
