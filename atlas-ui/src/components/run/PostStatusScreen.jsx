import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import { warmAuthenticatedBlobCacheMany } from "../../services/api/http";
import { useLocale } from "../../context/LocaleContext";
import AuthImage from "../shared/AuthImage";
import ImageSkeleton from "../shared/ImageSkeleton";
import TextSkeleton from "../shared/TextSkeleton";
import PageHeader from "../shared/PageHeader";
import DeleteWorkspaceButton from "../shared/DeleteWorkspaceButton";
import { useInView } from "../../hooks/useInView";
import { useMediaReady } from "../../hooks/useMediaReady";
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

const FILTER_KEYS = [
  { key: "all", labelKey: "postStatus.filterAll" },
  { key: "scheduled", labelKey: "postStatus.filterScheduled" },
  { key: "published", labelKey: "postStatus.filterPublished" },
  { key: "draft", labelKey: "postStatus.filterDrafts" },
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
const QUEUE_SKELETON_ROWS = 6;

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
      const warmUrls = [];
      setPreviews((prev) => {
        const next = { ...prev };
        for (const runId of chunk) {
          if (next[runId] !== undefined) continue;
          const preview = previewFromIndex(runs[runId]);
          next[runId] = preview;
          if (preview?.formats) {
            for (const platformKey of PLATFORM_ORDER) {
              const url = platformImageUrl(
                client,
                runId,
                preview.formats,
                preview.cacheKey,
                platformKey
              );
              if (url) warmUrls.push(url);
            }
          }
        }
        return next;
      });
      if (warmUrls.length) {
        void warmAuthenticatedBlobCacheMany(warmUrls);
      }
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

function PostQueueSkeletonRow({ index }) {
  return (
    <tr className="ps-row ps-row--skeleton" aria-hidden>
      <td className="ps-cell ps-cell--post">
        <TextSkeleton lines={2} variant="title" className="ps-text-skeleton" />
        <TextSkeleton lines={1} variant="meta" className="ps-text-skeleton ps-text-skeleton--meta" />
      </td>
      {PLATFORM_ORDER.map((key) => (
        <td key={key} className="ps-cell ps-cell--platform">
          <div className="ps-platform">
            <div className="ps-platform-thumb">
              <ImageSkeleton variant="thumb" />
            </div>
            <TextSkeleton lines={2} variant="meta" className="ps-text-skeleton ps-text-skeleton--platform" />
          </div>
        </td>
      ))}
      <td className="ps-cell ps-cell--action">
        <span className="ps-skeleton-open" />
      </td>
    </tr>
  );
}

function PostQueueRow({
  summary,
  client,
  preview,
  previewPending,
  onLoadPreview,
  onOpenRun,
  t,
}) {
  const shouldWatch = previewPending && preview == null;
  const { ref: rowSentinelRef, inView } = useInView({
    rootMargin: "240px 0px",
    disabled: !shouldWatch,
  });

  useEffect(() => {
    if (!shouldWatch || !inView) return;
    onLoadPreview(summary.runId);
  }, [shouldWatch, inView, summary.runId, onLoadPreview]);

  const platformMap = Object.fromEntries(summary.platforms.map((p) => [p.key, p]));
  const scheduleLabel = formatPostDateTime(summary.scheduledAt);

  return (
    <tr
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
        <div ref={rowSentinelRef} className="ps-row-sentinel" aria-hidden />
        <div className="ps-post-title">{summary.title}</div>
        <div className="ps-post-meta">
          <span className={`ps-status ps-status--${summary.overallStatus}`}>
            {overallStatusLabel(summary.overallStatus, t)}
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
          t={t}
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
          {t("common.open")}
          <IconChevron />
        </button>
      </td>
    </tr>
  );
}

function PlatformCell({ platformKey, platform, imageUrl, thumbLoading = false, t }) {
  const label = PLATFORM_LABELS[platformKey] || platformKey;
  const { status, label: statusLabel, detail } = platformCellDisplay(platform, t);
  const { mediaReady, onMediaLoad } = useMediaReady(imageUrl || "");
  const textPending = Boolean(imageUrl) && !mediaReady;

  return (
    <td className="ps-cell ps-cell--platform" aria-label={`${label}: ${statusLabel}${detail ? `, ${detail}` : ""}`}>
      <div className="ps-platform">
        <div className="ps-platform-thumb">
          {imageUrl ? (
            <AuthImage
              src={imageUrl}
              alt=""
              loading="eager"
              placeholder="thumb"
              onLoad={onMediaLoad}
            />
          ) : thumbLoading ? (
            <ImageSkeleton variant="thumb" />
          ) : (
            <span className="ps-platform-thumb-empty" aria-hidden />
          )}
        </div>
        <div className="ps-platform-text">
          {textPending ? (
            <TextSkeleton lines={2} variant="meta" className="ps-text-skeleton ps-text-skeleton--platform" />
          ) : (
            <>
              <span className={`ps-platform-status ps-platform-status--${status}`}>{statusLabel}</span>
              {detail ? <span className="ps-platform-detail">{detail}</span> : null}
            </>
          )}
        </div>
      </div>
    </td>
  );
}

export default function PostStatusScreen({ client, onOpenRun, onClientDeleted }) {
  const { t } = useLocale();
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

  const sortNewest = dateSort === "desc";
  const sortTitle = sortNewest ? t("postStatus.sortNewest") : t("postStatus.sortOldest");

  return (
    <div className="page post-status-page">
      <header className="ps-hero">
        <PageHeader title={t("postStatus.title")} actions={headerActions} />
        <p className="ps-hero-lede">{t("postStatus.lede")}</p>

        <div className="ps-controls">
          <div className="ps-filters" role="tablist" aria-label={t("postStatus.title")}>
            {FILTER_KEYS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                className={`ps-filter${filter === item.key ? " ps-filter--active" : ""}`}
                aria-selected={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
          <div className="ps-controls-right">
            <button
              type="button"
              className="ps-sort-toggle"
              aria-label={`${t("matrix.sortDate")}: ${sortNewest ? t("postStatus.sortNewest") : t("postStatus.sortOldest")}`}
              title={sortTitle}
              onClick={() => setDateSort((current) => (current === "desc" ? "asc" : "desc"))}
            >
              <IconSort />
              <span>{t("matrix.sortDate")}</span>
            </button>
            <label className="ps-search">
              <IconSearch />
              <input
                type="search"
                placeholder={t("postStatus.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
        </div>
      </header>

      <section className="ps-panel" aria-label={t("postStatus.title")}>
        {loading && summaries.length === 0 ? (
          <div className="ps-table-wrap">
            <table className="ps-table">
              <thead>
                <tr>
                  <th scope="col">{t("postStatus.colPost")}</th>
                  {PLATFORM_ORDER.map((key) => (
                    <th key={key} scope="col">
                      {PLATFORM_LABELS[key]}
                    </th>
                  ))}
                  <th scope="col" className="ps-th-action">
                    <span className="visually-hidden">{t("common.open")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: QUEUE_SKELETON_ROWS }, (_, index) => (
                  <PostQueueSkeletonRow key={`skeleton-${index}`} index={index} />
                ))}
              </tbody>
            </table>
          </div>
        ) : summaries.length === 0 ? (
          <div className="ps-empty">
            {search.trim() || filter !== "all"
              ? t("postStatus.emptyFilter")
              : t("postStatus.empty")}
          </div>
        ) : (
          <div className="ps-table-wrap">
            <table className="ps-table">
              <thead>
                <tr>
                  <th scope="col">{t("postStatus.colPost")}</th>
                  {PLATFORM_ORDER.map((key) => (
                    <th key={key} scope="col">
                      {PLATFORM_LABELS[key]}
                    </th>
                  ))}
                  <th scope="col" className="ps-th-action">
                    <span className="visually-hidden">{t("common.open")}</span>
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
                    t={t}
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
