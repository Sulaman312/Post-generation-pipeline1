import { useCallback, useEffect, useState } from "react";
import * as api from "../../services/api";
import {
  pickCanonicalFormatOutput,
  SHARED_FORMAT_ASPECT,
  SHARED_FORMAT_LABEL,
} from "../../utils/socialFormatOutput";
import { TEMPLATE_EXPORT_POLICY } from "./FormattedImagesPanel";
import "./ImageGenerationStep.css";

export default function TemplatePlacementPanel({ client, runId, toast }) {
  const [cacheKey, setCacheKey] = useState("");
  const [displayOutput, setDisplayOutput] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const syncFromFormats = useCallback((idx) => {
    setCacheKey(idx?.generated_at || "");
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
    setDisplayOutput(
      canonical ? { ...canonical, label: SHARED_FORMAT_LABEL } : null
    );
  }, []);

  const applyTemplate = useCallback(
    async (templateId) => {
      await api.getImageTemplate(client, runId, templateId);
      const res = await api.applyImageTemplate(client, runId);
      const formats = res?.formats || res;
      syncFromFormats(formats);
      return formats;
    },
    [client, runId, syncFromFormats]
  );

  useEffect(() => {
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
          syncFromFormats(idx);
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
  }, [client, runId, toast, applyTemplate, syncFromFormats]);

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

  if (loading) {
    return (
      <div className="step4-shell">
        <div className="step4-empty-hint">Applying client template…</div>
      </div>
    );
  }

  if (!displayOutput) {
    return (
      <div className="step4-shell">
        <div className="step4-empty-hint">
          Run <strong>Step 4 — Export channel sizes</strong> first.
        </div>
      </div>
    );
  }

  const url = api.formattedImageUrl(client, runId, displayOutput.filename, cacheKey);

  return (
    <div className="template-panel channel-format-preview">
      <div className="template-card channel-format-preview__card">
        <div className="template-card-title">{displayOutput.label}</div>
          <div
            className="template-frame"
            data-template-frame
            style={{ aspectRatio: SHARED_FORMAT_ASPECT }}
          >
            <img src={url} alt={displayOutput.filename} loading="lazy" />
          </div>
          <div className="template-card-foot">
            <button
              type="button"
              className="btn btn-sm btn-edit-artifact"
              onClick={() => handleDownload(displayOutput.filename)}
              disabled={downloading}
            >
              {downloading ? "Downloading…" : "Download"}
            </button>
            <span className="template-card-filename">{displayOutput.filename}</span>
          </div>
        </div>
    </div>
  );
}
