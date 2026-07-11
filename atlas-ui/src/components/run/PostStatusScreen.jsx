import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import AuthImage from "../shared/AuthImage";
import PageHeader from "../shared/PageHeader";
import DeleteWorkspaceButton from "../shared/DeleteWorkspaceButton";
import {
  PLATFORM_ORDER,
  PLATFORM_LABELS,
  comparePostSummariesByDate,
  formatPostDateTime,
  matchesPostStatusFilter,
  overallStatusLabel,
  platformCellDisplay,
  summarizePostPublish,
} from "../../utils/postPublishStatus";
import "./PostStatusScreen.css";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
];

function IconSearch() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  );
}

function IconSort() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M5 3.5 8 1l3 2.5M5 12.5 8 15l3-2.5M8 1v14" strokeLinecap="round" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function platformImageUrl(client, runId, formats, cacheKey, platformKey) {
  const info = formats?.[platformKey];
  if (!info?.filename) return "";
  return api.formattedImageUrl(client, runId, info.filename, cacheKey);
}

function runNeedsPreview(run) {
  return (
    run?.statuses?.image_template === "done" || run?.statuses?.image_formats === "done"
  );
}

const PREVIEW_BATCH_FLUSH_MS = 50;
const PREVIEW_BATCH_MAX = 16;

function previewFromIndex(idx) {
  if (!idx || typeof idx !== "object") return null;
  return {
    formats: idx.outputs || {},
    cacheKey: idx.generated_at || "",
  };
}

function useLazyQueuePreviews(client) {
  const [previews, setPreviews] = useState({});
  const inflightRef = useRef(new Set());
  const pendingRef = useRef(new Set());
  const flushTimerRef = useRef(null);
  const previewsRef = useRef(previews);
  previewsRef.current = previews;

  useEffect(() => {
    setPreviews({});
    inflightRef.current.clear();
    pendingRef.current.clear();
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, [client]);

  const flushBatch = useCallback(async () => {
    flushTimerRef.current = null;
    const pending = [...pendingRef.current].filter(
      (runId) =>
        previewsRef.current[runId] === undefined && !inflightRef.current.has(runId)
    );
    pendingRef.current.clear();
    if (!pending.length) return;

    const chunk = pending.slice(0, PREVIEW_BATCH_MAX);
    const overflow = pending.slice(PREVIEW_BATCH_MAX);
    overflow.forEach((runId) => pendingRef.current.add(runId));

    chunk.forEach((runId) => inflightRef.current.add(runId));
    try {
      const data = await api.getFormatsIndexBatch(client, chunk);
      const runs = data?.runs || {};
      setPreviews((prev) => {
        const next = { ...prev };
        for (const runId of chunk) {
          if (next[runId] !== undefined) continue;
          next[runId] = previewFromIndex(runs[runId]);
        }
        return next;
      });
    } catch {
      setPreviews((prev) => {
        const next = { ...prev };
        for (const runId of chunk) {
          if (next[runId] === undefined) next[runId] = null;
        }
        return next;
      });
    } finally {
      chunk.forEach((runId) => inflightRef.current.delete(runId));
      if (pendingRef.current.size > 0) {
        flushTimerRef.current = setTimeout(flushBatch, PREVIEW_BATCH_FLUSH_MS);
      }
    }
  }, [client]);

  const scheduleBatch = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flushBatch, PREVIEW_BATCH_FLUSH_MS);
  }, [flushBatch]);

  const loadPreview = useCallback(
    (runId) => {
      if (!runId) return;
      if (previewsRef.current[runId] !== undefined) return;
      if (inflightRef.current.has(runId)) return;
      pendingRef.current.add(runId);
      scheduleBatch();
    },
    [scheduleBatch]
  );

  return { previews, loadPreview };
}

function rowIsNearRoot(el, root, marginPx = 240) {
  const rootRect = root
    ? root.getBoundingClientRect()
    : {
        top: 0,
        left: 0,
        bottom: window.innerHeight,
        right: window.innerWidth,
      };
  const elRect = el.getBoundingClientRect();
  return (
    elRect.bottom >= rootRect.top - marginPx && elRect.top <= rootRect.bottom + marginPx
  );
}

function PostQueueRow({
  summary,
  client,
  preview,
  previewPending,
  onLoadPreview,
  onOpenRun,
  scrollRootRef,
}) {
  const rowRef = useRef(null);
  const marginPx = 240;

  useEffect(() => {
    if (!previewPending || preview != null) return undefined;
    const el = rowRef.current;
    if (!el) return undefined;

    const root = scrollRootRef?.current || null;

    if (rowIsNearRoot(el, root, marginPx)) {
      onLoadPreview(summary.runId);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadPreview(summary.runId);
          observer.disconnect();
        }
      },
      { root, rootMargin: `${marginPx}px 0px`, threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [summary.runId, onLoadPreview, previewPending, preview, scrollRootRef]);

  const platformMap = Object.fromEntries(summary.platforms.map((p) => [p.key, p]));
  const scheduleLabel = formatPostDateTime(summary.scheduledAt);

  return (
    <tr
      ref={rowRef}
      className="ps-row"
      tabIndex={0}
      onClick={() => onOpenRun?.(summary.runId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenRun?.(summary.runId);
        }
      }}
    >
      <td className="ps-cell ps-cell--post">
        <div className="ps-post-title">{summary.title}</div>
        <div className="ps-post-meta">
          <span className={`ps-status ps-status--${summary.overallStatus}`}>
            {overallStatusLabel(summary.overallStatus)}
          </span>
          {scheduleLabel && summary.overallStatus === "scheduled" ? (
            <span className="ps-post-schedule">Goes live {scheduleLabel}</span>
          ) : null}
        </div>
      </td>
      {PLATFORM_ORDER.map((key) => (
        <PlatformCell
          key={key}
          platformKey={key}
          platform={platformMap[key]}
          imageUrl={platformImageUrl(
            client,
            summary.runId,
            preview?.formats,
            preview?.cacheKey,
            key
          )}
          thumbLoading={previewPending && preview === undefined}
        />
      ))}
      <td className="ps-cell ps-cell--action">
        <button
          type="button"
          className="ps-open"
          onClick={(e) => {
            e.stopPropagation();
            onOpenRun?.(summary.runId);
          }}
        >
          Open
          <IconChevron />
        </button>
      </td>
    </tr>
  );
}

function PlatformCell({ platformKey, platform, imageUrl, thumbLoading = false }) {
  const label = PLATFORM_LABELS[platformKey] || platformKey;
  const { status, label: statusLabel, detail } = platformCellDisplay(platform);

  return (
    <td className="ps-cell ps-cell--platform" aria-label={`${label}: ${statusLabel}${detail ? `, ${detail}` : ""}`}>
      <div className="ps-platform">
        <div
          className={`ps-platform-thumb${
            thumbLoading ? " ps-platform-thumb--loading" : ""
          }`}
        >
          {imageUrl ? (
            <AuthImage src={imageUrl} alt="" loading="lazy" />
          ) : (
            <span className="ps-platform-thumb-empty" aria-hidden />
          )}
        </div>
        <div className="ps-platform-text">
          <span className={`ps-platform-status ps-platform-status--${status}`}>{statusLabel}</span>
          {detail ? <span className="ps-platform-detail">{detail}</span> : null}
        </div>
      </div>
    </td>
  );
}

export default function PostStatusScreen({ client, onOpenRun, onClientDeleted }) {
  const scrollRootRef = useRef(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateSort, setDateSort] = useState("desc");

  const loadRuns = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const list = await api.getRuns(client);
      setRuns((list || []).filter((r) => (r.pipeline_id || "article") === "social_media" && !r.archived));
    } catch {
      if (!silent) setRuns([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadRuns();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadRuns({ silent: true });
      }
    }, 15000);
    return () => clearInterval(id);
  }, [loadRuns]);

  const { previews, loadPreview } = useLazyQueuePreviews(client);

  const runsById = useMemo(
    () => Object.fromEntries(runs.map((run) => [run.run_id, run])),
    [runs]
  );

  const allSummaries = useMemo(
    () => runs.map((run) => summarizePostPublish(run)),
    [runs]
  );

  const summaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allSummaries
      .filter((summary) => matchesPostStatusFilter(summary, filter))
      .filter((summary) => {
        if (!q) return true;
        const haystack = [
          summary.title,
          summary.runId,
          ...summary.platforms.map((p) => p.label),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => comparePostSummariesByDate(a, b, dateSort));
  }, [allSummaries, filter, search, dateSort]);

  const headerActions = onClientDeleted ? (
    <DeleteWorkspaceButton client={client} onDeleted={onClientDeleted} />
  ) : null;

  return (
    <div className="page post-status-page">
      <header className="ps-hero">
        <PageHeader title="Publishing queue" actions={headerActions} />
        <p className="ps-hero-lede">
          Post names and publish times across Instagram, LinkedIn, and Facebook.
        </p>

        <div className="ps-controls">
          <div className="ps-filters" role="tablist" aria-label="Filter posts">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                className={`ps-filter${filter === item.key ? " ps-filter--active" : ""}`}
                aria-selected={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="ps-controls-right">
            <button
              type="button"
              className="ps-sort-toggle"
              aria-label={`Sort by date: ${dateSort === "desc" ? "Newest" : "Oldest"}`}
              title={dateSort === "desc" ? "Newest first" : "Oldest first"}
              onClick={() => setDateSort((current) => (current === "desc" ? "asc" : "desc"))}
            >
              <IconSort />
              <span>Sort: Date</span>
            </button>
            <label className="ps-search">
              <IconSearch />
              <input
                type="search"
                placeholder="Search posts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
        </div>
      </header>

      <section className="ps-panel" ref={scrollRootRef} aria-label="Publishing queue">
        {loading && summaries.length === 0 ? (
          <div className="ps-empty">
            <span className="spinner" /> Loading queue…
          </div>
        ) : summaries.length === 0 ? (
          <div className="ps-empty">
            {search.trim() || filter !== "all"
              ? "No posts match this filter."
              : "No posts in the queue yet. Create one from the Social board."}
          </div>
        ) : (
          <div className="ps-table-wrap">
            <table className="ps-table">
              <thead>
                <tr>
                  <th scope="col">Post</th>
                  {PLATFORM_ORDER.map((key) => (
                    <th key={key} scope="col">
                      {PLATFORM_LABELS[key]}
                    </th>
                  ))}
                  <th scope="col" className="ps-th-action">
                    <span className="visually-hidden">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => (
                  <PostQueueRow
                    key={summary.runId}
                    summary={summary}
                    client={client}
                    preview={previews[summary.runId]}
                    previewPending={runNeedsPreview(runsById[summary.runId])}
                    onLoadPreview={loadPreview}
                    onOpenRun={onOpenRun}
                    scrollRootRef={scrollRootRef}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
