import { useCallback, useEffect, useState } from "react";
import * as api from "../../services/api";
import { useLocale } from "../../context/LocaleContext";
import { localizeArtifactSpec } from "../../utils/localizeArtifactSpec";
import MarkdownArtifactPanel from "../shared/MarkdownArtifactPanel";

/** Fallback when API is unavailable (dev offline). */
export const WORKSPACE_ARTIFACT_SPECS = [
  {
    filename: "personas.md",
    title: "Audience personas",
    description: "Roles, goals, and vocabulary for your audience.",
    placeholder:
      "## Primary persona\n- Role:\n- Goals:\n- What they need from this content:\n",
  },
  {
    filename: "context.md",
    title: "Company context",
    description: "Company positioning, offerings, and ground-truth facts.",
    placeholder:
      "## Company overview\n- Company name:\n- What you sell:\n- Key differentiators:\n",
  },
  {
    filename: "brand_voice.md",
    title: "Brand voice",
    description: "Tone and phrasing rules for captions and post copy.",
    placeholder:
      "# Brand voice\n\n## Tone\n- \n\n## Personality\n- \n\n## Words to use\n- \n\n## Words to avoid\n- \n",
  },
  {
    filename: "image_style.md",
    title: "Generalized image prompt template",
    description: "Step 3 brand template for image prompts.",
    placeholder:
      "You are a prompt engineer specializing in AI image generation for [YOUR INDUSTRY] brands. I run [COMPANY NAME] that [WHAT YOU DO].\n\n" +
      "I will give you a CONTENT TOPIC. Your job is to write image-generation prompts in this exact visual style:\n\n" +
      "STYLE REFERENCE:\n" +
      "- (palette, lighting, mood, composition, props, things to avoid)\n\n" +
      "For each topic, output:\n" +
      "1. A short content angle/caption idea (2-3 sentences)\n" +
      "2. A full image generation prompt (150-250 words)\n" +
      "3. One alternate camera angle/variation\n\n" +
      "Wait for me to give you the topic before generating anything.",
  },
];

const SOCIAL_BUILTIN_FILENAMES = new Set(
  WORKSPACE_ARTIFACT_SPECS.map((spec) => spec.filename)
);

function filterSocialWorkspaceArtifacts(rows) {
  return rows.filter(
    (row) =>
      row?.filename &&
      (row.custom || SOCIAL_BUILTIN_FILENAMES.has(row.filename))
  );
}

function ContextArtifactEditor({ client, spec, toast, variant = "card" }) {
  const { t } = useLocale();
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [editing, setEditing] = useState(false);

  const dirty = draft !== baseline;
  const localized = localizeArtifactSpec(spec, t);
  const { filename, title, description, placeholder } = localized;
  const isPage = variant === "page";
  const isCustom = Boolean(spec.custom);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getContextFile(client, filename);
      const text = data?.content ?? "";
      setDraft(text);
      setBaseline(text);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client, filename]);

  useEffect(() => {
    setEditing(false);
    load();
  }, [load]);

  function handleCancelEdit() {
    setDraft(baseline);
    setEditing(false);
  }

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveContextFile(client, filename, draft);
      setBaseline(draft);
      setEditing(false);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2200);
      toast?.(t("common.saved"), { variant: "success", duration: 2500 });
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      toast?.(msg, { variant: "error", duration: 10000 });
    } finally {
      setSaving(false);
    }
  }

  const taId = `ctx-${filename.replace(/\W/g, "")}`;

  const wrapClass = isPage
    ? "client-context-card client-context-card--page"
    : "client-context-card";

  return (
    <div className={wrapClass}>
      <div className="client-context-card-head">
        <div>
          <h3 className="client-context-card-title">{title}</h3>
          <p className="client-context-card-desc">{description}</p>
        </div>
        <div className="client-context-card-actions">
          {savedFlash ? (
            <span className="client-context-saved">{t("common.saved")}</span>
          ) : null}
          {editing ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={saving || loading}
              onClick={handleCancelEdit}
            >
              {t("common.cancel")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={loading}
              onClick={() => setEditing(true)}
            >
              {t("common.edit")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!dirty || saving || loading || !editing}
            onClick={handleSave}
          >
            {saving ? (
              <>
                <span className="spinner spinner-light" /> {t("common.saving")}
              </>
            ) : (
              t("common.save")
            )}
          </button>
        </div>
      </div>
      {error && !loading ? (
        <div className="client-context-error" role="alert">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="client-context-loading">
          <span className="spinner" /> {t("artifacts.loading")}
        </div>
      ) : (
        <>
          <label className="label visually-hidden" htmlFor={taId}>
            {title} ({t("artifacts.markdown")})
          </label>
          <div className="client-context-artifact-panel">
            <MarkdownArtifactPanel
              content={draft}
              baseline={baseline}
              draft={draft}
              editing={editing}
              onDraftChange={setDraft}
              onEditingChange={setEditing}
              showEditInToolbar={false}
              textareaRows={isPage ? 22 : 14}
              textareaPlaceholder={placeholder || ""}
              previewNode={
                !editing && !draft.trim() ? (
                  <p className="client-context-empty-preview">
                    {t("artifacts.noContent")}
                  </p>
                ) : null
              }
            />
          </div>
          <div className="client-context-meta">
            <code className="client-context-filename">{filename}</code>
            <span>
              {" "}
              · {t("artifacts.markdown")}
              {isCustom
                ? ` · ${t("artifacts.customMeta")}`
                : ` · ${t("artifacts.pipelineMeta")}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function AddArtifactForm({ client, onCreated, onCancel, toast }) {
  const { t } = useLocale();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const slugVal = slug.trim();
    const titleVal = title.trim();
    if (!slugVal || !titleVal) return;
    setSaving(true);
    setError(null);
    try {
      const artifact = await api.createWorkspaceArtifact(client, {
        slug: slugVal,
        title: titleVal,
        description: description.trim(),
      });
      toast?.(t("artifacts.created"), { variant: "success", duration: 2500 });
      onCreated?.(artifact);
    } catch (err) {
      const msg = err?.message || String(err);
      setError(msg);
      toast?.(msg, { variant: "error", duration: 10000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="artifact-add-form" onSubmit={handleSubmit}>
      <h3 className="artifact-add-form-title">{t("artifacts.newTitle")}</h3>
      <p className="artifact-add-form-lede">{t("artifacts.newLede")}</p>
      {error ? (
        <div className="client-context-error" role="alert">
          {error}
        </div>
      ) : null}
      <label className="label" htmlFor="artifact-slug">
        {t("artifacts.fileId")}
      </label>
      <input
        id="artifact-slug"
        className="input"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder={t("artifacts.fileIdPlaceholder")}
        autoComplete="off"
        disabled={saving}
      />
      <label className="label" htmlFor="artifact-title">
        {t("artifacts.displayTitle")}
      </label>
      <input
        id="artifact-title"
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("artifacts.displayTitlePlaceholder")}
        disabled={saving}
      />
      <label className="label" htmlFor="artifact-desc">
        {t("artifacts.description")}{" "}
        <span className="label-optional">{t("common.optional")}</span>
      </label>
      <input
        id="artifact-desc"
        className="input"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("artifacts.descriptionPlaceholder")}
        disabled={saving}
      />
      <div className="artifact-add-form-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={saving}
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || !slug.trim() || !title.trim()}
        >
          {saving ? (
            <>
              <span className="spinner spinner-light" /> {t("artifacts.creating")}
            </>
          ) : (
            t("artifacts.create")
          )}
        </button>
      </div>
    </form>
  );
}

/** Cards for all workspace artifacts; choosing one opens the editor in the parent. */
export function WorkspaceArtifactPicker({
  client,
  onSelect,
  onSpecsChange,
}) {
  const { t } = useLocale();
  const [specs, setSpecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deletingFn, setDeletingFn] = useState(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listWorkspaceArtifacts(client);
      const ok = filterSocialWorkspaceArtifacts(rows);
      const next = ok.length ? ok : WORKSPACE_ARTIFACT_SPECS;
      setSpecs(next);
      onSpecsChange?.(next);
    } catch (e) {
      setError(e?.message || String(e));
      setSpecs(WORKSPACE_ARTIFACT_SPECS);
      onSpecsChange?.(WORKSPACE_ARTIFACT_SPECS);
    } finally {
      setLoading(false);
    }
  }, [client, onSpecsChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(e, spec) {
    e.stopPropagation();
    e.preventDefault();
    if (!spec.removable || !spec.custom) return;
    const ok = window.confirm(
      t("artifacts.deleteConfirm", {
        title: localizeArtifactSpec(spec, t).title,
        filename: spec.filename,
      })
    );
    if (!ok) return;
    setDeletingFn(spec.filename);
    try {
      await api.deleteWorkspaceArtifact(client, spec.filename);
      await load();
    } catch (err) {
      window.alert(err?.message || String(err));
    } finally {
      setDeletingFn(null);
    }
  }

  function handleCreated(artifact) {
    setAdding(false);
    load().then(() => {
      if (artifact?.filename) onSelect?.(artifact.filename);
    });
  }

  return (
    <div className="artifact-picker-wrap">
      <div className="artifact-picker-toolbar">
        <p className="artifacts-page-lede">{t("artifacts.lede")}</p>
        {!adding ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setAdding(true)}
          >
            {t("artifacts.add")}
          </button>
        ) : null}
      </div>

      {adding ? (
        <AddArtifactForm
          client={client}
          onCreated={handleCreated}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {error && !loading ? (
        <div className="client-context-error" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="client-context-loading" style={{ marginTop: 24 }}>
          <span className="spinner" /> {t("artifacts.loading")}
        </div>
      ) : (
        <div className="artifact-picker-grid" role="list">
          {specs.map((spec) => {
            const localized = localizeArtifactSpec(spec, t);
            return (
            <div key={spec.filename} className="artifact-picker-card-wrap">
              <button
                type="button"
                className="artifact-picker-card"
                onClick={() => onSelect(spec.filename)}
                aria-label={t("artifacts.openEditor", { title: localized.title })}
              >
                <span className="artifact-picker-card-kicker">
                  {spec.custom
                    ? t("artifacts.customFile")
                    : t("artifacts.workspaceFile")}
                </span>
                <span className="artifact-picker-card-title">{localized.title}</span>
                <span className="artifact-picker-card-desc" title={localized.description}>
                  {localized.description}
                </span>
                {spec.exists === false ? (
                  <span className="artifact-picker-card-empty">{t("artifacts.empty")}</span>
                ) : null}
              </button>
              {spec.removable ? (
                <button
                  type="button"
                  className="artifact-picker-delete"
                  title={t("artifacts.delete")}
                  disabled={deletingFn === spec.filename}
                  onClick={(e) => handleDelete(e, spec)}
                >
                  {deletingFn === spec.filename ? "…" : t("artifacts.delete")}
                </button>
              ) : null}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Full-width editor with back control (parent supplies breadcrumb / header). */
export function WorkspaceArtifactEditorPage({
  client,
  filename,
  spec: specProp,
  toast,
  onBack,
}) {
  const { t } = useLocale();
  const [spec, setSpec] = useState(specProp ?? null);
  const [loading, setLoading] = useState(!specProp);

  useEffect(() => {
    if (specProp) {
      setSpec(specProp);
      setLoading(false);
      return;
    }
    if (!client || !filename) return;
    let cancelled = false;
    setLoading(true);
    api
      .listWorkspaceArtifacts(client)
      .then((rows) => {
        if (cancelled) return;
        const found =
          rows.find((r) => r.filename === filename) ||
          WORKSPACE_ARTIFACT_SPECS.find((s) => s.filename === filename);
        setSpec(found ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setSpec(
            WORKSPACE_ARTIFACT_SPECS.find((s) => s.filename === filename) ?? null
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, filename, specProp]);

  if (loading) {
    return (
      <div className="client-context-loading" style={{ marginTop: 32 }}>
        <span className="spinner" /> {t("artifacts.loading")}
      </div>
    );
  }

  if (!spec) return null;

  return (
    <div className="artifact-editor-page">
      <button
        type="button"
        className="btn btn-ghost artifact-back-btn"
        onClick={onBack}
      >
        <span className="artifact-back-chev" aria-hidden>
          ‹
        </span>
        {t("artifacts.all")}
      </button>
      <ContextArtifactEditor
        client={client}
        spec={spec}
        toast={toast}
        variant="page"
      />
    </div>
  );
}
