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
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
  skipped: "Skipped",
  pending: "Pending",
};

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

export function formatPlatformTime(status, time) {
  const formatted = formatPostDateTime(time);
  if (formatted) return formatted;
  if (status === "draft") return "Not scheduled";
  if (status === "skipped") return "Not selected";
  return "Pending";
}

export function overallStatusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.draft;
}

export function platformStatusLabel(status) {
  return STATUS_LABELS[status] || status;
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
    } else if (publishDone) {
      status = "published";
      time = run?.timestamp || null;
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
    overallStatus: record.status,
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
    return summary.overallStatus === "draft" && !summary.platforms.some((p) => p.status !== "draft");
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
