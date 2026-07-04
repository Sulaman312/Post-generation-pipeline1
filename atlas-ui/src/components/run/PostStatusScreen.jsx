import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../../services/api";
import PageHeader from "../shared/PageHeader";
import DeleteWorkspaceButton from "../shared/DeleteWorkspaceButton";
import {
  PLATFORM_ORDER,
  PLATFORM_LABELS,
  comparePostSummariesByDate,
  formatPlatformTime,
  formatPostDateTime,
  matchesPostStatusFilter,
  overallStatusLabel,
  summarizePostPublish,
} from "../../utils/postPublishStatus";
import "./PostStatusScreen.css";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
];

const DATE_SORTS = [
  { key: "desc", label: "Newest first" },
  { key: "asc", label: "Oldest first" },
];

function IconSearch() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
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

function platformTimeText(platform) {
  if (!platform) return "Not selected";
  if (platform.status === "draft") return "Not scheduled yet";
  if (platform.status === "skipped") return "Not selected";
  return formatPlatformTime(platform.status, platform.time);
}

function PlatformCell({ platformKey, platform, imageUrl }) {
  const label = PLATFORM_LABELS[platformKey] || platformKey;
  const timeText = platformTimeText(platform);

  return (
    <td className="ps-cell ps-cell--platform" aria-label={`${label}: ${timeText}`}>
      <div className="ps-platform">
        <div className="ps-platform-thumb">
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" />
          ) : (
            <span className="ps-platform-thumb-empty" aria-hidden />
          )}
        </div>
        <span className="ps-platform-time">{timeText}</span>
      </div>
    </td>
  );
}

function useQueuePreviews(client, runs) {
  const [previews, setPreviews] = useState({});

  useEffect(() => {
    let cancelled = false;
    const targets = runs.filter(
      (run) => run?.statuses?.image_formats === "done" && run?.run_id
    );
    if (!targets.length) return undefined;

    (async () => {
      const rows = await Promise.all(
        targets.map(async (run) => {
          try {
            const idx = await api.getFormatsIndex(client, run.run_id);
            return [
              run.run_id,
              {
                formats: idx?.outputs || {},
                cacheKey: idx?.generated_at || "",
              },
            ];
          } catch {
            return [run.run_id, null];
          }
        })
      );
      if (cancelled) return;
      setPreviews((prev) => {
        const next = { ...prev };
        for (const [runId, data] of rows) {
          if (data) next[runId] = data;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [client, runs]);

  return previews;
}

export default function PostStatusScreen({ client, onOpenRun, onClientDeleted }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateSort, setDateSort] = useState("desc");

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getRuns(client);
      setRuns((list || []).filter((r) => (r.pipeline_id || "article") === "social_media" && !r.archived));
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

  const previews = useQueuePreviews(client, runs);

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
            <div className="ps-sort" role="group" aria-label="Sort posts by date">
              <span className="ps-sort-label">Date</span>
              <div className="ps-sort-options">
                {DATE_SORTS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`ps-sort-btn${dateSort === item.key ? " ps-sort-btn--active" : ""}`}
                    aria-pressed={dateSort === item.key}
                    onClick={() => setDateSort(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
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

      <section className="ps-panel" aria-label="Publishing queue">
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
                {summaries.map((summary) => {
                  const platformMap = Object.fromEntries(
                    summary.platforms.map((p) => [p.key, p])
                  );
                  const scheduleLabel = formatPostDateTime(summary.scheduledAt);
                  const preview = previews[summary.runId];

                  return (
                    <tr
                      key={summary.runId}
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
                          <span className="ps-status">{overallStatusLabel(summary.overallStatus)}</span>
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
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
