import { useCallback, useEffect, useState } from "react";
import * as api from "../../services/api";
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
import "./ImageGenerationStep.css";

export default function TemplatePlacementPanel({ client, runId, toast, skeletonOnly = false }) {
  const [cacheKey, setCacheKey] = useState("");
  const [displayOutput, setDisplayOutput] = useState(null);
  const [loading, setLoading] = useState(!skeletonOnly);
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
    setDisplayOutput(canonical || null);
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
  }, [client, runId, toast, applyTemplate, syncFromFormats, skeletonOnly]);

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

  if (skeletonOnly || loading) {
    return (
      <div className="template-panel channel-format-preview template-panel--brand">
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

  const url = api.formattedImageUrl(client, runId, displayOutput.filename, cacheKey);

  return (
    <TemplatePreviewCard
      url={url}
      filename={displayOutput.filename}
      width={displayOutput.width}
      height={displayOutput.height}
      downloading={downloading}
      onDownload={() => handleDownload(displayOutput.filename)}
    />
  );
}

function TemplatePreviewCard({ url, filename, width, height, downloading, onDownload }) {
  const { mediaReady, onMediaLoad } = useMediaReady(url);
  const sizeLabel = formatDimensionsLabel(width, height);

  return (
    <div className="template-panel channel-format-preview template-panel--brand">
      <div className="template-card channel-format-preview__card">
        <div
          className="template-frame"
          data-template-frame
          style={{ aspectRatio: SHARED_FORMAT_ASPECT }}
        >
          <AuthImage
            src={url}
            alt={filename}
            loading="eager"
            placeholder="thumb"
            onLoad={onMediaLoad}
          />
        </div>
        <div className="template-card-foot">
          {mediaReady ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-primary template-download-btn"
                onClick={onDownload}
                disabled={downloading}
              >
                {downloading ? "Downloading…" : "Download PNG"}
              </button>
              <span className="template-card-specs">{sizeLabel}</span>
            </>
          ) : (
            <TextSkeleton lines={1} variant="meta" className="template-card-foot-skeleton" />
          )}
        </div>
      </div>
    </div>
  );
}
