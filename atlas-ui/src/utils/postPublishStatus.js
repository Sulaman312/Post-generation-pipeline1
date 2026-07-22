import { runRecordFromRun } from "../constants/runRecord";
import { socialRunTitle } from "./socialRunTopic";

export const PLATFORM_ORDER = ["instagram", "linkedin", "facebook"];

export const PLATFORM_LABELS = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

const STATUS_LABELS = {
  draft: "Draft",
  ready: "Ready to publish",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
  skipped: "Skipped",
  pending: "Pending",
};

const STATUS_I18N = {
  draft: "postStatus.draft",
  ready: "postStatus.ready",
  scheduled: "postStatus.scheduled",
  published: "postStatus.published",
  failed: "postStatus.failed",
  skipped: "postStatus.skipped",
  pending: "postStatus.pending",
};

function translateStatus(status, t, fallback) {
  const key = STATUS_I18N[status];
  if (typeof t === "function" && key) return t(key);
  return fallback ?? STATUS_LABELS[status] ?? status;
}

export function formatPostDateTime(iso) {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatPlatformTime(status, time, t) {
  const formatted = formatPostDateTime(time);
  if (formatted) return formatted;
  if (status === "draft") {
    return typeof t === "function" ? t("postStatus.notScheduled") : "Not scheduled";
  }
  if (status === "skipped") {
    return typeof t === "function" ? t("postStatus.notSelected") : "Not selected";
  }
  return typeof t === "function" ? t("postStatus.pending") : "Pending";
}

export function overallStatusLabel(status, t) {
  return translateStatus(status, t, STATUS_LABELS[status] || STATUS_LABELS.draft);
}

export function platformStatusLabel(status, t) {
  return translateStatus(status, t, STATUS_LABELS[status] || status);
}

export function platformCellDisplay(platform, t) {
  if (!platform) {
    return {
      status: "skipped",
      label: typeof t === "function" ? t("postStatus.notSelected") : "Not selected",
      detail: null,
    };
  }

  const { status, time } = platform;
  const detail = formatPostDateTime(time);

  if (status === "published") {
    return {
      status,
      label: typeof t === "function" ? t("postStatus.published") : "Published",
      detail,
    };
  }
  if (status === "scheduled") {
    return {
      status,
      label: typeof t === "function" ? t("postStatus.scheduled") : "Scheduled",
      detail,
    };
  }
  if (status === "skipped") {
    return {
      status,
      label: typeof t === "function" ? t("postStatus.notSelected") : "Not selected",
      detail: null,
    };
  }
  if (status === "draft") {
    return {
      status,
      label: typeof t === "function" ? t("postStatus.notScheduled") : "Not scheduled",
      detail: null,
    };
  }
  if (status === "ready") {
    return {
      status,
      label: typeof t === "function" ? t("postStatus.awaiting") : "Awaiting publish",
      detail: null,
    };
  }
  if (status === "failed") {
    return {
      status,
      label: typeof t === "function" ? t("postStatus.failed") : "Failed",
      detail: null,
    };
  }

  return {
    status,
    label: platformStatusLabel(status, t),
    detail: detail || null,
  };
}

export function deriveOverallStatus(record, platforms, run = null) {
  if (record.status === "published") return "published";
  if (record.status === "failed") return "failed";
  if (platforms.some((p) => p.status === "scheduled")) return "scheduled";
  if (platforms.some((p) => p.status === "failed")) return "failed";
  if (platforms.some((p) => p.status === "published")) return "published";
  const reviewDone = run?.statuses?.review_checklist === "done";
  const publishPending = run?.statuses?.publish !== "done";
  const hasPublishResults = (record.published_results || []).some(
    (row) => row?.status === "published"
  );
  if (
    reviewDone &&
    publishPending &&
    !hasPublishResults &&
    (record.status === "draft" || !record.status)
  ) {
    return "ready";
  }
  return record.status || "draft";
}

/**
 * @param {object} run
 * @returns {{
 *   runId: string,
 *   title: string,
 *   overallStatus: string,
 *   scheduledAt: string|null,
 *   archived: boolean,
 *   platforms: Array<{ key: string, label: string, status: string, time: string|null }>
 * }}
 */
export function summarizePostPublish(run) {
  const record = runRecordFromRun(run);
  const title = socialRunTitle(run?.manual_inputs, run?.topic);
  const publishDone = run?.statuses?.publish === "done";
  const reviewDone = run?.statuses?.review_checklist === "done";
  const resultsByPlatform = Object.fromEntries(
    (record.published_results || [])
      .filter((row) => row?.platform)
      .map((row) => [row.platform, row])
  );
  const platformSchedules = record.platform_schedules || {};

  const platforms = (record.platforms || []).map((key) => {
    const result = resultsByPlatform[key];
    let status = "draft";
    let time = null;

    if (result) {
      status = result.status || "pending";
      time = result.published_at || null;
    } else if (platformSchedules[key]) {
      status = "scheduled";
      time = platformSchedules[key];
    } else if (record.status === "scheduled" && record.scheduled_at) {
      status = "scheduled";
      time = record.scheduled_at;
    } else if (publishDone || record.status === "published") {
      status = "published";
      time = run?.timestamp || null;
    } else if (reviewDone && run?.statuses?.publish !== "done") {
      status = "ready";
      time = null;
    }

    return {
      key,
      label: PLATFORM_LABELS[key] || key,
      status,
      time,
    };
  });

  return {
    runId: run?.run_id || "",
    title,
    overallStatus: deriveOverallStatus(record, platforms, run),
    scheduledAt: record.scheduled_at,
    archived: Boolean(run?.archived),
    platforms,
  };
}

export function matchesPostStatusFilter(summary, filter) {
  if (filter === "all") return true;
  if (filter === "scheduled") {
    return summary.overallStatus === "scheduled" || summary.platforms.some((p) => p.status === "scheduled");
  }
  if (filter === "published") {
    return summary.overallStatus === "published" || summary.platforms.some((p) => p.status === "published");
  }
  if (filter === "draft") {
    return (
      (summary.overallStatus === "draft" || summary.overallStatus === "ready") &&
      !summary.platforms.some((p) => ["published", "scheduled", "failed"].includes(p.status))
    );
  }
  return true;
}

export function summarySortTime(summary) {
  if (summary.scheduledAt) return summary.scheduledAt;
  const platformTimes = summary.platforms
    .map((platform) => platform.time)
    .filter((time) => typeof time === "string" && time.trim());
  if (!platformTimes.length) return null;
  return platformTimes.sort()[0];
}

export function formatTimeUntil(iso, nowMs = Date.now()) {
  if (!iso) return null;
  const when = Date.parse(iso);
  if (Number.isNaN(when)) return null;
  const ms = when - nowMs;
  if (ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} sec`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min} min ${sec} sec` : `${min} min`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr} hr ${remMin} min` : `${hr} hr`;
}

/** Sidebar subtitle for the publish step when schedules or retries are pending. */
export function publishStepSidebarMeta(run, t) {
  if (!run) return null;
  const record = runRecordFromRun(run);
  const selected = record.platforms || [];

  const retryable = selected.filter((platform) => {
    const row = (record.published_results || []).find((r) => r.platform === platform);
    return row?.status === "skipped" || row?.status === "failed";
  });
  if (retryable.length) {
    const names = retryable.map((p) => PLATFORM_LABELS[p] || p).join(", ");
    if (typeof t === "function") {
      return t("publish.needsPublish", { names });
    }
    return `${names} needs publish`;
  }

  const schedules = record.platform_schedules || {};
  let nextIso = null;
  let nextWhen = Infinity;
  const now = Date.now();
  for (const platform of selected) {
    const row = (record.published_results || []).find((r) => r.platform === platform);
    if (row?.status === "published") continue;
    const iso = schedules[platform] || record.scheduled_at;
    if (!iso) continue;
    const when = Date.parse(iso);
    if (Number.isNaN(when) || when <= now) continue;
    if (when < nextWhen) {
      nextWhen = when;
      nextIso = iso;
    }
  }
  const until = formatTimeUntil(nextIso);
  return until ? `~${until}` : null;
}

export function comparePostSummariesByDate(a, b, direction = "desc") {
  const aTime = summarySortTime(a);
  const bTime = summarySortTime(b);
  const multiplier = direction === "asc" ? 1 : -1;

  if (aTime && bTime) {
    const diff = new Date(aTime).getTime() - new Date(bTime).getTime();
    if (diff !== 0) return diff * multiplier;
    return a.title.localeCompare(b.title);
  }
  if (aTime) return -1 * multiplier;
  if (bTime) return multiplier;
  return a.title.localeCompare(b.title);
}
