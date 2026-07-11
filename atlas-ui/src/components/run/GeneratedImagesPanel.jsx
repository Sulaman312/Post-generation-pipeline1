import { useEffect, useRef, useState } from "react";
import * as api from "../../services/api";
import { SOCIAL_PIPELINE_STEPS } from "../../constants/pipelineContract";
import { isImageFile, readImageFileAsBase64 } from "../../utils/readImageFile";
import AuthImage from "../shared/AuthImage";
import { IconCheck, IconImages, IconTrash, IconUpload } from "./runViewIcons";
import "./ImageGenerationStep.css";

export const MAX_PRIMARY_UPLOAD_BYTES = 8 * 1024 * 1024;

const NEXT_STEP_LABEL =
  SOCIAL_PIPELINE_STEPS.find((step) => step.key === "image_template")?.label ??
  "Brand template";

export default function GeneratedImagesPanel({ client, runId, toast }) {
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState([]);
  const [imageMeta, setImageMeta] = useState({});
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
  const panelBusy = busy || uploading || Boolean(deleting);

  function imageSrc(fn) {
    return `${api.generatedImageUrl(client, runId, fn)}?v=${imageVersions[fn] || 0}`;
  }

  function openPreview(fn, styleLabel) {
    setPreview({ fn, styleLabel });
  }

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
                Pick a generated style or upload your own image — then continue to{" "}
                <strong>{NEXT_STEP_LABEL}</strong>.
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
                    className="step4-image-preview"
                    onClick={() => openPreview(fn, styleLabel)}
                    disabled={panelBusy}
                    aria-label={`Preview ${styleLabel}`}
                    title="View larger preview"
                  >
                    <div className="step4-image-frame">
                      <AuthImage src={imageSrc(fn)} alt={styleLabel} loading="lazy" />
                      <span className="step4-image-check" aria-hidden>
                        <IconCheck />
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="step4-image-select"
                    onClick={() => choose(fn)}
                    disabled={panelBusy}
                    aria-pressed={isSel}
                    title={isSel ? "Primary image" : "Select as primary"}
                  >
                    <div className="step4-image-footer">
                      <span className="step4-style-chip">{styleLabel}</span>
                      <span className="step4-image-select-hint">
                        {busy ? "Saving…" : isSel ? "Primary" : "Select"}
                      </span>
                    </div>
                  </button>
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
            <header className="step4-preview-header">
              <h4 className="step4-preview-title">{preview.styleLabel}</h4>
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
              />
            </div>
            <footer className="step4-preview-footer">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setPreview(null)}
              >
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
