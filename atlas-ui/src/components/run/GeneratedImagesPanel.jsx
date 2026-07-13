import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import { isImageFile, readImageFileAsBase64 } from "../../utils/readImageFile";
import { useMediaReady } from "../../hooks/useMediaReady";
import AuthImage from "../shared/AuthImage";
import ImageSkeleton from "../shared/ImageSkeleton";
import TextSkeleton from "../shared/TextSkeleton";
import { IconCheck, IconTrash, IconUpload } from "./runViewIcons";
import "./ImageGenerationStep.css";

export const MAX_PRIMARY_UPLOAD_BYTES = 8 * 1024 * 1024;
const LOADING_PLACEHOLDER_COUNT = 4;
const GENERATION_POLL_MS = 1500;

function Step4PendingCard({ generating }) {
  return (
    <div
      className="step4-image-card step4-image-card--skeleton step4-image-card--pending"
      role="listitem"
      aria-busy={generating ? "true" : undefined}
    >
      <div className="step4-image-frame">
        <ImageSkeleton variant="thumb" />
        {generating ? (
          <span className="step4-pending-badge">
            <span className="spinner spinner--sm" aria-hidden />
            Generating…
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Step4ImageCard({
  fn,
  src,
  styleLabel,
  isSel,
  isDeleting,
  panelBusy,
  busy,
  onPreview,
  onDelete,
  onChoose,
}) {
  const { mediaReady, onMediaLoad } = useMediaReady(src);

  return (
    <div
      role="listitem"
      className={`step4-image-card${isSel ? " step4-image-card--selected" : ""}${
        !mediaReady ? " step4-image-card--media-loading" : ""
      }`}
    >
      <button
        type="button"
        className="step4-image-delete"
        disabled={panelBusy || !mediaReady}
        aria-label={`Delete ${styleLabel}`}
        title="Delete image"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(fn, styleLabel);
        }}
      >
        {isDeleting ? <span className="spinner spinner--sm" /> : <IconTrash />}
      </button>
      <button
        type="button"
        className="step4-image-preview"
        onClick={() => onPreview(fn, styleLabel)}
        disabled={panelBusy || !mediaReady}
        aria-label={`Preview ${styleLabel}`}
        title="View larger preview"
      >
        <div className="step4-image-frame">
          <AuthImage
            src={src}
            alt={styleLabel}
            loading="eager"
            placeholder="thumb"
            onLoad={onMediaLoad}
          />
          <span className="step4-image-check" aria-hidden>
            <IconCheck />
          </span>
        </div>
      </button>
      <button
        type="button"
        className="step4-image-select"
        onClick={() => onChoose(fn)}
        disabled={panelBusy || !mediaReady}
        aria-pressed={isSel}
        title={isSel ? "Primary image" : "Select as primary"}
      >
        <div className="step4-image-footer">
          {mediaReady ? (
            <span className="step4-image-select-hint">
              {busy ? "Saving…" : isSel ? "Primary" : "Select"}
            </span>
          ) : (
            <TextSkeleton lines={1} variant="meta" />
          )}
        </div>
      </button>
    </div>
  );
}

export default function GeneratedImagesPanel({
  client,
  runId,
  toast,
  skeletonOnly = false,
  generating = false,
}) {
  const [loading, setLoading] = useState(!skeletonOnly || generating);
  const [images, setImages] = useState([]);
  const [imageMeta, setImageMeta] = useState({});
  const [stylePlan, setStylePlan] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [imageVersions, setImageVersions] = useState({});
  const [preview, setPreview] = useState(null);
  const uploadInputRef = useRef(null);

  useEffect(() => {
    if (!preview) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setPreview(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview]);

  useEffect(() => {
    if (skeletonOnly && !generating) return undefined;
    let cancelled = false;

    async function refreshImages() {
      try {
        const data = await api.listRunImages(client, runId);
        if (cancelled) return;
        const nextImages = data.images || [];
        setImages(nextImages);
        setImageMeta(data.image_meta || {});
        setSelected(data.selected_primary || null);
        setImageVersions((prev) => {
          if (!nextImages.length) return {};
          const next = { ...prev };
          const seen = new Set(nextImages);
          for (const fn of Object.keys(next)) {
            if (!seen.has(fn)) delete next[fn];
          }
          for (const fn of nextImages) {
            if (!(fn in next)) next[fn] = Date.now();
          }
          return next;
        });
      } catch {
        if (cancelled) return;
        setImages([]);
        setImageMeta({});
        setSelected(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    refreshImages();
    if (!generating) return () => {
      cancelled = true;
    };

    const timer = window.setInterval(refreshImages, GENERATION_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, runId, skeletonOnly, generating]);

  useEffect(() => {
    if (skeletonOnly && !generating) return undefined;
    let cancelled = false;
    api
      .getImageStylePlan(client, runId)
      .then((data) => {
        if (cancelled) return;
        setStylePlan(data.styles || []);
      })
      .catch(() => {
        if (cancelled) return;
        setStylePlan([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, runId, skeletonOnly, generating]);

  const completedByStyleKey = useMemo(() => {
    const map = {};
    for (const fn of images) {
      const key = imageMeta[fn]?.style_key;
      if (key) map[key] = fn;
    }
    return map;
  }, [images, imageMeta]);

  const expectedSlotCount = stylePlan.length || LOADING_PLACEHOLDER_COUNT;

  const slots = useMemo(() => {
    if (stylePlan.length) {
      return stylePlan.map((style) => ({
        styleKey: style.style_key,
        styleLabel: style.style_label || style.style_key,
        filename: completedByStyleKey[style.style_key] || null,
      }));
    }

    // Style plan still loading — show each image as soon as the API returns it.
    if (images.length) {
      const completed = images.map((fn) => ({
        styleKey: imageMeta[fn]?.style_key || fn,
        styleLabel: imageMeta[fn]?.style_label || fn,
        filename: fn,
      }));
      const pendingCount = Math.max(0, expectedSlotCount - completed.length);
      const pending = Array.from({ length: pendingCount }, (_, index) => ({
        styleKey: `pending-${index}`,
        styleLabel: null,
        filename: null,
      }));
      return [...completed, ...pending];
    }

    if (generating || (skeletonOnly && !generating)) {
      return Array.from({ length: LOADING_PLACEHOLDER_COUNT }, (_, index) => ({
        styleKey: `placeholder-${index}`,
        styleLabel: null,
        filename: null,
      }));
    }
    return images.map((fn) => ({
      styleKey: imageMeta[fn]?.style_key || fn,
      styleLabel: imageMeta[fn]?.style_label || fn,
      filename: fn,
    }));
  }, [
    stylePlan,
    completedByStyleKey,
    generating,
    skeletonOnly,
    images,
    imageMeta,
    expectedSlotCount,
  ]);

  const showSkeleton = skeletonOnly && !generating;

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

  function imageSrc(fn) {
    return `${api.generatedImageUrl(client, runId, fn)}?v=${imageVersions[fn] || 0}`;
  }

  function openPreview(fn, styleLabel) {
    setPreview({ fn, styleLabel });
  }

  const panelBusy = busy || uploading || Boolean(deleting);

  return (
    <div className={`step4-shell${generating ? " step4-shell--generating" : " step4-shell--compact"}`}>
      <section
        className="step4-section step4-section--generating"
        aria-label="Generated images"
      >
        <div className="step4-section-body">
          {!showSkeleton && !generating && !images.length ? (
            <p className="step4-empty-inline">No generated images yet. Upload your own below.</p>
          ) : null}
          <div className="step4-image-grid" role="list">
            {showSkeleton
              ? Array.from({ length: LOADING_PLACEHOLDER_COUNT }, (_, index) => (
                  <div
                    key={`image-skeleton-${index}`}
                    className="step4-image-card step4-image-card--skeleton"
                    role="listitem"
                    aria-hidden
                  >
                    <div className="step4-image-frame">
                      <ImageSkeleton variant="thumb" />
                    </div>
                    <div className="step4-image-footer step4-image-footer--skeleton">
                      <TextSkeleton lines={1} variant="meta" />
                    </div>
                  </div>
                ))
              : slots.map((slot) => {
                  if (!slot.filename) {
                    return (
                      <Step4PendingCard
                        key={slot.styleKey}
                        generating={generating}
                      />
                    );
                  }
                  const fn = slot.filename;
                  const meta = imageMeta[fn] || {};
                  const styleLabel = slot.styleLabel || meta.style_label || fn;
                  return (
                    <Step4ImageCard
                      key={fn}
                      fn={fn}
                      src={imageSrc(fn)}
                      styleLabel={styleLabel}
                      isSel={fn === selected}
                      isDeleting={deleting === fn}
                      panelBusy={panelBusy || generating}
                      busy={busy}
                      onPreview={openPreview}
                      onDelete={removeImage}
                      onChoose={choose}
                    />
                  );
                })}
            {!generating ? (
              <div className="step4-image-card step4-image-card--upload" role="listitem">
                <input
                  ref={uploadInputRef}
                  id={`step4-upload-${runId}`}
                  type="file"
                  className="step4-upload-input"
                  accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                  onChange={onUploadInputChange}
                  disabled={panelBusy || showSkeleton || loading}
                />
                <label
                  htmlFor={`step4-upload-${runId}`}
                  className={`step4-upload-label${
                    panelBusy || showSkeleton || loading ? " step4-upload-label--disabled" : ""
                  }`}
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
            ) : null}
          </div>
        </div>
      </section>

      {preview ? (
        <div
          className="step4-preview-overlay"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <div
            className="step4-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={preview.styleLabel}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="step4-preview-header step4-preview-header--compact">
              <button
                type="button"
                className="step4-preview-close"
                onClick={() => setPreview(null)}
                aria-label="Close preview"
              >
                ×
              </button>
            </header>
            <div className="step4-preview-body">
              <AuthImage
                src={imageSrc(preview.fn)}
                alt={preview.styleLabel}
                className="step4-preview-image"
                imgClassName="step4-preview-img"
                placeholder="none"
                loading="eager"
              />
            </div>
            <footer className="step4-preview-footer">
              <button type="button" className="btn btn-sm" onClick={() => setPreview(null)}>
                Close
              </button>
              {preview.fn !== selected ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={panelBusy}
                  onClick={async () => {
                    await choose(preview.fn);
                    setPreview(null);
                  }}
                >
                  Select as primary
                </button>
              ) : (
                <span className="step4-preview-primary-note">Primary image</span>
              )}
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
