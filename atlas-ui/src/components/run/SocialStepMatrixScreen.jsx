import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { useLocale } from "../../context/LocaleContext";
import { parseRunDate } from "../../utils/formatRelativeAge";
import {
  socialAdditionalDetails,
  socialPostParagraph,
  socialRunTitle,
} from "../../utils/socialRunTopic";
import SocialStepMatrix from "./SocialStepMatrix";
import DeleteWorkspaceButton from "../shared/DeleteWorkspaceButton";
import MatrixRunActions from "./MatrixRunActions";
import PageHeader from "../shared/PageHeader";
import "./StepMatrixScreen.css";

function IconSort() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M5 3.5 8 1l3 2.5M5 12.5 8 15l3-2.5M8 1v14" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
    </svg>
  );
}

export default function SocialStepMatrixScreen({
  client,
  onOpenRun,
  onBackToBoard,
  onClientDeleted,
}) {
  const { toast } = useToast();
  const { t } = useLocale();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [view, setView] = useState("active");
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const editMenuRef = useRef(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getRuns(client);
      setRuns((list || []).filter((r) => (r.pipeline_id || "article") === "social_media"));
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadRuns();
    const id = setInterval(loadRuns, 3500);
    return () => clearInterval(id);
  }, [loadRuns]);

  useEffect(() => {
    if (!editMenuOpen) return undefined;
    function onDoc(e) {
      if (editMenuRef.current && !editMenuRef.current.contains(e.target)) {
        setEditMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [editMenuOpen]);

  const filteredRuns = useMemo(() => {
    let list = [...runs];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const title = socialRunTitle(r.manual_inputs, r.topic).toLowerCase();
        const idea = [
          socialPostParagraph(r.manual_inputs),
          socialAdditionalDetails(r.manual_inputs),
        ]
          .join("\n")
          .toLowerCase();
        return (
          title.includes(q) ||
          idea.includes(q) ||
          (r.topic || "").toLowerCase().includes(q) ||
          (r.run_id || "").toLowerCase().includes(q)
        );
      });
    }
    if (view === "archived") {
      list = list.filter((r) => r.archived);
    } else {
      list = list.filter((r) => !r.archived);
    }
    list.sort((a, b) => {
      const da = parseRunDate(a.timestamp, a.run_id)?.getTime() ?? 0;
      const db = parseRunDate(b.timestamp, b.run_id)?.getTime() ?? 0;
      if (da !== db) return sortAsc ? da - db : db - da;
      return String(a.run_id).localeCompare(String(b.run_id));
    });
    return list;
  }, [runs, search, sortAsc, view]);

  useEffect(() => {
    if (!editMenuOpen) {
      setSelectedRunId(null);
      return;
    }
    if (filteredRuns.length === 0) return;
    const stillVisible = filteredRuns.some((r) => r.run_id === selectedRunId);
    if (!selectedRunId || !stillVisible) {
      setSelectedRunId(filteredRuns[0].run_id);
    }
  }, [editMenuOpen, filteredRuns, selectedRunId]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.run_id === selectedRunId) ?? null,
    [runs, selectedRunId]
  );

  async function handleArchive(runId) {
    const run = runs.find((r) => r.run_id === runId);
    const title = run?.topic?.trim() || runId;
    try {
      if (view === "archived" || run?.archived) {
        await api.unarchiveRun(client, runId);
        toast(`Restored “${title}” to Active.`, { duration: 4000 });
      } else {
        await api.archiveRun(client, runId);
        toast(`Archived “${title}”.`, { duration: 5000 });
      }
      if (selectedRunId === runId) setSelectedRunId(null);
      setEditMenuOpen(false);
      await loadRuns();
    } catch (e) {
      toast(e?.message || String(e), { variant: "error", duration: 10000 });
    }
  }

  async function handleDelete(runId) {
    const run = runs.find((r) => r.run_id === runId);
    const title = run?.topic?.trim() || runId;
    const ok = window.confirm(
      `Delete “${title}”?\n\nThis permanently removes the run and all step outputs. This cannot be undone.`
    );
    if (!ok) return;
    try {
      await api.deleteRun(client, runId);
      toast(`Deleted “${title}”.`, { duration: 4000 });
      if (selectedRunId === runId) setSelectedRunId(null);
      setEditMenuOpen(false);
      await loadRuns();
    } catch (e) {
      toast(e?.message || String(e), { variant: "error", duration: 10000 });
    }
  }

  const showRestore = view === "archived" || selectedRun?.archived;

  const headerActions = (
    <>
      <div className="tab-bar step-matrix-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`tab${view === "active" ? " active" : ""}`}
          aria-selected={view === "active"}
          onClick={() => setView("active")}
        >
          {t("common.active")}
        </button>
        <button
          type="button"
          role="tab"
          className={`tab${view === "archived" ? " active" : ""}`}
          aria-selected={view === "archived"}
          onClick={() => setView("archived")}
        >
          {t("common.archived")}
        </button>
      </div>
      <div className="step-matrix-edit-wrap" ref={editMenuRef}>
        <button
          type="button"
          className={`btn btn-ghost step-matrix-edit-btn${
            editMenuOpen ? " step-matrix-edit-btn--open" : ""
          }`}
          aria-expanded={editMenuOpen}
          aria-haspopup="menu"
          onClick={() => setEditMenuOpen((v) => !v)}
        >
          {t("common.edit")}
        </button>
        {editMenuOpen ? (
          <div className="step-matrix-edit-menu">
            {filteredRuns.length === 0 ? (
              <p className="step-matrix-edit-hint step-matrix-edit-hint--muted">
                {t("matrix.noRunsInView")}
              </p>
            ) : !selectedRunId ? (
              <p className="step-matrix-edit-hint step-matrix-edit-hint--muted">
                {t("matrix.selectRunHint")}
              </p>
            ) : (
              <MatrixRunActions
                articleTopic={selectedRun?.topic?.trim() || selectedRunId}
                itemNoun="post"
                showTopic
                showRestore={showRestore}
                onArchive={() => handleArchive(selectedRunId)}
                onDelete={() => handleDelete(selectedRunId)}
              />
            )}
          </div>
        ) : null}
      </div>
      {onClientDeleted ? (
        <DeleteWorkspaceButton client={client} onDeleted={onClientDeleted} />
      ) : null}
    </>
  );

  return (
    <div className="page step-matrix-page">
      <div className="step-matrix-header">
        <PageHeader title={t("matrix.title")} actions={headerActions} />

        <div className="step-matrix-toolbar">
          <div className="step-matrix-toolbar-left">
            <button
              type="button"
              className="smx-tool"
              onClick={() => setSortAsc((v) => !v)}
              title={t("matrix.toggleSort")}
            >
              <IconSort />
              <span>{t("matrix.sortDate")}</span>
            </button>
            <button
              type="button"
              className={`smx-tool${searchOpen ? " smx-tool--active" : ""}`}
              onClick={() => setSearchOpen((v) => !v)}
            >
              <IconSearch />
              <span>{t("common.search")}</span>
            </button>
            {searchOpen ? (
              <input
                type="search"
                className="step-matrix-search"
                placeholder={t("matrix.filterTopics")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            ) : null}
            <button
              type="button"
              className="smx-tool"
              onClick={onBackToBoard}
            >
              <IconPlus />
              <span>{t("common.add")}</span>
            </button>
          </div>
        </div>
      </div>

      <section className="step-matrix-panel" aria-label={t("matrix.title")}>
        {loading && runs.length === 0 ? (
          <div className="step-matrix-loading">
            <span className="spinner" /> {t("matrix.loading")}
          </div>
        ) : (
          <SocialStepMatrix
            runs={filteredRuns}
            loading={loading}
            selectedRunId={selectedRunId}
            selectionMode={editMenuOpen}
            onSelectRun={setSelectedRunId}
            onOpenRun={onOpenRun}
            onArchiveRun={handleArchive}
            onDeleteRun={handleDelete}
            showRestore={view === "archived"}
            emptyMessage={
              search.trim()
                ? t("matrix.emptySearch")
                : view === "archived"
                  ? t("matrix.emptyArchived")
                  : t("matrix.empty")
            }
          />
        )}
      </section>
    </div>
  );
}

