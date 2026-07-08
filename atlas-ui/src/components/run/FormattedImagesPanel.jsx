import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../services/api";
import {
  pickCanonicalFormatOutput,
  placeholderFormatOutput,
  SHARED_FORMAT_ASPECT,
  SHARED_FORMAT_LABEL,
} from "../../utils/socialFormatOutput";
import "./ImageGenerationStep.css";

export const FORMAT_EXPORT_POLICY = "contain_blur_v4";
export const CROP_EXPORT_POLICY = "center_crop_v1";
export const TEMPLATE_EXPORT_POLICY = "template_figma_overlay_v1";

export const FORMAT_ASPECT = {
  instagram: SHARED_FORMAT_ASPECT,
  facebook: SHARED_FORMAT_ASPECT,
  linkedin: SHARED_FORMAT_ASPECT,
};

export default function FormattedImagesPanel({ client, runId, toast }) {
  const [cacheKey, setCacheKey] = useState("");
  const [displayOutput, setDisplayOutput] = useState(null);
  const [hasOutputs, setHasOutputs] = useState(false);
  const [resizePolicy, setResizePolicy] = useState("");
  const [templateApplied, setTemplateApplied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const autoRegenAttemptedRef = useRef(false);

  const isKnownFormatPolicy =
    resizePolicy === FORMAT_EXPORT_POLICY || resizePolicy === CROP_EXPORT_POLICY;

  const syncOutputs = useCallback((idx) => {
    const generatedAt = idx?.generated_at || "";
    const policy = idx?.resize_policy || "";
    const branded = Boolean(idx?.template_applied);
    setTemplateApplied(branded);
    setResizePolicy(policy);
    const key = [generatedAt, policy, branded ? "base" : "fmt"].filter(Boolean).join("|");
    if (key) {
      setCacheKey((prev) => (prev === key ? prev : key));
    }
    const raw = idx?.outputs || {};
    const list = Object.entries(raw)
      .map(([platformKey, info]) => ({
        key: platformKey,
        label: info?.label
          ? `${info.label} (${info.width}×${info.height})`
          : platformKey,
        filename:
          branded && info?.base_filename ? info.base_filename : info?.filename || "",
        width: Number(info?.width || 0),
        height: Number(info?.height || 0),
      }))
      .filter((o) => o.filename);
    setHasOutputs(list.length > 0);
    const canonical = pickCanonicalFormatOutput(list);
    setDisplayOutput(
      canonical
        ? { ...canonical, label: SHARED_FORMAT_LABEL }
        : placeholderFormatOutput({ branded })
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const idx = await api.getFormatsIndex(client, runId);
        if (cancelled) return;
        syncOutputs(idx);
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
  }, [client, runId, syncOutputs]);

  const handleRegenerate = useCallback(async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const idx = await api.regenerateFormats(client, runId, { baseOnly: true });
      syncOutputs(idx);
    } catch (err) {
      toast?.(err?.message || String(err), { variant: "error", duration: 9000 });
    } finally {
      setRegenerating(false);
    }
  }, [client, runId, regenerating, syncOutputs, toast]);

  useEffect(() => {
    autoRegenAttemptedRef.current = false;
  }, [client, runId]);

  useEffect(() => {
    if (autoRegenAttemptedRef.current || regenerating || !hasOutputs) return;
    if (resizePolicy === FORMAT_EXPORT_POLICY) return;
    const needsRegenerate = Boolean(hasOutputs && !templateApplied && !isKnownFormatPolicy);
    if (!needsRegenerate) return;
    autoRegenAttemptedRef.current = true;
    handleRegenerate();
  }, [
    client,
    runId,
    hasOutputs,
    resizePolicy,
    regenerating,
    templateApplied,
    isKnownFormatPolicy,
    handleRegenerate,
  ]);

  async function handleDownload(filename) {
    if (downloading || !filename) return;
    setDownloading(true);
    try {
      await api.downloadFormattedImage(client, runId, filename, cacheKey);
    } catch (err) {
      toast?.(err?.message || String(err), { variant: "error", duration: 9000 });
    } finally {
      setDownloading(false);
    }
  }

  if (!displayOutput) return null;

  const url = api.formattedImageUrl(client, runId, displayOutput.filename, cacheKey);

  return (
    <div className="formatted-images-panel channel-format-preview">
      <h3 className="formatted-images-title channel-format-preview__title">Formatted image</h3>

      <article className="formatted-images-card channel-format-preview__card">
          <div className="formatted-images-card-label">{displayOutput.label}</div>
          <div
            className="formatted-images-frame"
            style={{ aspectRatio: SHARED_FORMAT_ASPECT }}
          >
            <img
              src={url}
              alt={displayOutput.filename}
              onError={() => {
                toast?.(
                  `Formatted image not found yet (${displayOutput.filename}). Run Export channel sizes first.`,
                  { variant: "error", duration: 9000 }
                );
              }}
              loading="lazy"
            />
          </div>
          <div className="formatted-images-card-foot">
            <button
              type="button"
              className="btn btn-sm btn-edit-artifact"
              onClick={() => handleDownload(displayOutput.filename)}
              disabled={downloading}
            >
              {downloading ? "Downloading…" : "Download"}
            </button>
            <span className="formatted-images-filename">{displayOutput.filename}</span>
          </div>
        </article>
    </div>
  );
}
