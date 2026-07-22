import { useCallback, useEffect, useState } from "react";
import * as api from "../../services/api";
import { useLocale } from "../../context/LocaleContext";
import { localizeArtifactSpec } from "../../utils/localizeArtifactSpec";
import { useToast } from "../../context/ToastContext";
import ContextDrawer from "./ContextDrawer";
import ContextEditorDrawer from "./ContextEditorDrawer";
import {
  WorkspaceArtifactEditorPage,
  WorkspaceArtifactPicker,
} from "./WorkspaceArtifacts";
import DeleteWorkspaceButton from "../shared/DeleteWorkspaceButton";
import ManualSocialForm from "./ManualSocialForm";
import PageHeader from "../shared/PageHeader";

export default function ClientHome({
  client,
  onOpenRun,
  onClientDeleted,
  workspaceView = "overview",
  artifactFilename = null,
  onArtifactFilenameChange,
}) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [runs, setRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [contextOpen, setContextOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [artifactSpecs, setArtifactSpecs] = useState([]);

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const list = await api.getRuns(client);
      setRuns(list);
    } catch (e) {
      toast(e?.message || String(e), { variant: "error" });
    } finally {
      setLoadingRuns(false);
    }
  }, [client, toast]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const isOverview = workspaceView === "overview";
  const isArtifacts = workspaceView === "artifacts";
  const artifactSpec = artifactFilename
    ? artifactSpecs.find((s) => s.filename === artifactFilename)
    : null;

  return (
    <div className="page">
      <PageHeader
        title={
          isOverview
            ? client
            : artifactSpec
              ? localizeArtifactSpec(artifactSpec, t).title
              : t("workspace.artifacts")
        }
        actions={
          <>
            {onClientDeleted ? (
              <DeleteWorkspaceButton
                client={client}
                onDeleted={onClientDeleted}
              />
            ) : null}
            {isOverview ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setContextOpen(true)}
              >
                {t("workspace.context")}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditorOpen(true)}
              >
                {t("workspace.editFiles")}
              </button>
            </>
            ) : null}
          </>
        }
      />

      {isArtifacts && artifactSpec ? (
        <WorkspaceArtifactEditorPage
          client={client}
          filename={artifactFilename}
          spec={artifactSpec}
          toast={toast}
          onBack={() => onArtifactFilenameChange?.(null)}
        />
      ) : null}

      {isArtifacts && !artifactSpec ? (
        <section
          className="artifacts-picker-section"
          aria-label="Workspace artifacts"
        >
          <WorkspaceArtifactPicker
            client={client}
            onSelect={(fn) => onArtifactFilenameChange?.(fn)}
            onSpecsChange={setArtifactSpecs}
          />
        </section>
      ) : null}

      {isOverview ? (
        <section style={{ marginBottom: 32 }} aria-label="New post">
          <ManualSocialForm
            client={client}
            onOpenRun={onOpenRun}
            onCreated={loadRuns}
          />
        </section>
      ) : null}

      {isOverview ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <h2 className="h2">{t("workspace.recentRuns")}</h2>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {t("workspace.totalRuns", { n: runs.length })}
            </span>
          </div>

          {loadingRuns ? (
            <div className="empty-state">
              <span className="spinner" /> &nbsp; {t("workspaces.loading")}
            </div>
          ) : runs.length === 0 ? (
            <div
              className="empty-state"
              style={{
                background: "var(--panel)",
                borderRadius: 12,
                border: "1px dashed var(--border-strong)",
              }}
            >
              {t("workspace.noRuns")}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 14,
              }}
            >
              {runs.map((r) => (
                <RunCard
                  key={r.run_id}
                  run={r}
                  onOpen={() => onOpenRun(r.run_id)}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      <ContextDrawer
        client={client}
        open={contextOpen}
        onClose={() => setContextOpen(false)}
      />
      <ContextEditorDrawer
        client={client}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}

function RunCard({ run, onOpen }) {
  return (
    <div className="card run-card" onClick={onOpen}>
      <div className="run-card-title">{run.topic || "(untitled)"}</div>
    </div>
  );
}
