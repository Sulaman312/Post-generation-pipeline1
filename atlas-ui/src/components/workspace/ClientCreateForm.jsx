import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import { useLocale } from "../../context/LocaleContext";
import LogoFitImage from "./LogoFitImage";
import { isImageFile, readImageFileAsBase64 } from "../../utils/readImageFile";
import {
  CONTEXT_FILE_LABELS,
  PIPELINE_CONTEXT_FILES_ORDERED,
} from "../../constants/contextFiles";
import "./WorkspaceForm.css";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function fallbackCatalogEntries() {
  return PIPELINE_CONTEXT_FILES_ORDERED.map((filename) => ({
    filename,
    label: CONTEXT_FILE_LABELS[filename] || filename,
  }));
}

export default function ClientCreateForm({
  onCancel,
  onError,
  onCreated,
  onClientLogoSaved,
}) {
  const { t } = useLocale();
  const [catalogEntries, setCatalogEntries] = useState(null);
  const [newName, setNewName] = useState("");
  const [seedContext, setSeedContext] = useState(() =>
    Object.fromEntries(
      PIPELINE_CONTEXT_FILES_ORDERED.map((filename) => [filename, ""])
    )
  );
  const [showSeedContext, setShowSeedContext] = useState(false);
  const [creating, setCreating] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const logoInputRef = useRef(null);

  useEffect(() => {
    api
      .getContextFilesCatalog()
      .then((rows) => {
        const ok = rows.filter((r) => r?.filename);
        setCatalogEntries(ok.length ? ok : null);
      })
      .catch(() => setCatalogEntries(null));
  }, []);

  const pipelineEntries = useMemo(
    () =>
      catalogEntries?.length ? catalogEntries : fallbackCatalogEntries(),
    [catalogEntries]
  );

  const emptySeed = useMemo(
    () => () =>
      Object.fromEntries(
        pipelineEntries.map((entry) => [entry.filename, ""])
      ),
    [pipelineEntries]
  );

  function clearLogo() {
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setLogoFile(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) {
      clearLogo();
      return;
    }
    if (!isImageFile(file)) {
      onError(t("workspace.logoErrType"));
      clearLogo();
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      onError(t("workspace.logoErrSize"));
      clearLogo();
      return;
    }
    onError(null);
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function resetForm() {
    setNewName("");
    setSeedContext(emptySeed());
    setShowSeedContext(false);
    clearLogo();
    onCancel();
  }

  async function handleCreate(e) {
    e?.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    onError(null);
    try {
      const createOpts = {};
      if (logoFile) {
        createOpts.logo_base64 = await readImageFileAsBase64(logoFile);
        createOpts.logo_filename = logoFile.name;
      }
      await api.createClient(name, { ...createOpts, display_name: name });
      if (logoFile) {
        onClientLogoSaved?.(name);
      }
      const writes = [];
      for (const entry of pipelineEntries) {
        const fn = entry.filename;
        const body = (seedContext[fn] || "").trim();
        if (body) {
          writes.push(api.saveContextFile(name, fn, body));
        }
      }
      if (writes.length > 0) {
        await Promise.all(writes);
      }
      resetForm();
      await onCreated(name);
    } catch (err) {
      onError(err?.message || String(err));
    } finally {
      setCreating(false);
    }
  }

  function updateSeed(fn, value) {
    setSeedContext((prev) => ({ ...prev, [fn]: value }));
  }

  const hasAnySeedContent = pipelineEntries.some(
    (entry) => (seedContext[entry.filename] || "").trim().length > 0
  );

  return (
    <form
      onSubmit={handleCreate}
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 18,
        marginBottom: 20,
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <label className="label" htmlFor="new-client">
            {t("workspace.name")}
          </label>
          <input
            id="new-client"
            className="input"
            placeholder={t("workspace.namePlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!newName.trim() || creating}
        >
          {creating ? t("workspace.creating") : t("workspace.create")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={creating}
          onClick={() => resetForm()}
        >
          {t("common.cancel")}
        </button>
      </div>

      <div className="workspace-form-logo-row">
        <div className="workspace-form-logo-preview" aria-hidden={!logoPreview}>
          {logoPreview ? (
            <LogoFitImage src={logoPreview} size={48} />
          ) : (
            <span className="workspace-form-logo-placeholder">
              {t("workspace.logoPlaceholder")}
            </span>
          )}
        </div>
        <div className="workspace-form-logo-fields">
          <span className="label">{t("workspace.logo")}</span>
          <span className="workspace-form-logo-hint">
            {t("workspace.logoOptionalHint")}
          </span>
          <div className="workspace-form-logo-actions">
            <input
              ref={logoInputRef}
              id="new-client-logo"
              type="file"
              className="workspace-form-logo-input"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              onChange={handleLogoChange}
              disabled={creating}
            />
            <label htmlFor="new-client-logo" className="btn btn-secondary btn-sm">
              {logoFile ? t("workspace.changeLogo") : t("workspace.uploadLogo")}
            </label>
            {logoFile ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={clearLogo}
                disabled={creating}
              >
                {t("workspace.remove")}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn"
        style={{ alignSelf: "flex-start", fontSize: 13 }}
        onClick={() => setShowSeedContext((v) => !v)}
      >
        {showSeedContext ? "▼" : "►"} {t("workspace.seedContext")}
        {hasAnySeedContent ? ` ${t("workspace.seedHasDrafts")}` : ""}
      </button>

      {showSeedContext ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxHeight: "min(62vh, 520px)",
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            {t("workspace.seedHelp")}
          </p>
          {pipelineEntries.map((entry) => (
            <div key={entry.filename}>
              <label className="label" htmlFor={`seed-${entry.filename}`}>
                {entry.label ?? CONTEXT_FILE_LABELS[entry.filename] ?? entry.filename}{" "}
                <span style={{ fontWeight: 400, opacity: 0.75 }}>
                  ({entry.filename})
                </span>
              </label>
              <textarea
                id={`seed-${entry.filename}`}
                className="input"
                rows={5}
                placeholder={t("workspace.seedPlaceholder", {
                  filename: entry.filename,
                })}
                value={seedContext[entry.filename] ?? ""}
                onChange={(e) => updateSeed(entry.filename, e.target.value)}
                style={{
                  resize: "vertical",
                  fontFamily:
                    'ui-monospace, "Cascadia Code", Menlo, Consolas, monospace',
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              />
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
