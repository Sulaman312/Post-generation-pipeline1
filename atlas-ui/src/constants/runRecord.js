/** Post / pipeline run publishing fields — mirrors `backend/run_record.py`. */

import {
  DEFAULT_PLATFORMS,
  PLATFORMS,
  PLATFORM_RESULT_STATUSES,
  POST_STATUSES,
} from "./pipelineContract";

export { DEFAULT_PLATFORMS, PLATFORMS, PLATFORM_RESULT_STATUSES, POST_STATUSES };

/** @returns {{ status: string, platforms: string[], scheduled_at: string|null, published_results: object[] }} */
export function defaultRunRecordFields() {
  return {
    status: "draft",
    platforms: [...DEFAULT_PLATFORMS],
    scheduled_at: null,
    platform_schedules: {},
    published_results: [],
  };
}

/**
 * @typedef {Object} PublishedResult
 * @property {string} platform
 * @property {string} status
 * @property {string|null} published_at
 * @property {string|null} post_url
 * @property {string|null} error
 */

export function runRecordFromRun(run) {
  const base = defaultRunRecordFields();
  if (!run || typeof run !== "object") return base;
  return {
    status: POST_STATUSES.includes(run.status) ? run.status : base.status,
    platforms: Array.isArray(run.platforms)
      ? run.platforms.filter((p) => PLATFORMS.includes(p))
      : base.platforms,
    scheduled_at:
      typeof run.scheduled_at === "string" && run.scheduled_at.trim()
        ? run.scheduled_at
        : null,
    platform_schedules: (() => {
      const src = run.platform_schedules;
      if (!src || typeof src !== "object") return {};
      const out = {};
      for (const p of PLATFORMS) {
        const iso = src[p];
        if (typeof iso === "string" && iso.trim()) out[p] = iso;
      }
      return out;
    })(),
    published_results: (() => {
      const raw = run.published_results;
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === "object") {
        return Object.values(raw).filter((row) => row && typeof row === "object");
      }
      return base.published_results;
    })(),
  };
}

/** True when selected platforms have a future schedule and are not yet published. */
export function platformPublishResult(record, platform) {
  return (record?.published_results || []).find((row) => row?.platform === platform) || null;
}

export function isPlatformPublished(record, platform) {
  return platformPublishResult(record, platform)?.status === "published";
}

export function isPlatformRetryable(record, platform) {
  const status = platformPublishResult(record, platform)?.status;
  return status === "skipped" || status === "failed";
}

export function unpublishedSelectedPlatforms(record, platforms = null) {
  const selected = platforms ?? record?.platforms ?? [];
  return selected.filter((platform) => !isPlatformPublished(record, platform));
}

export function hasPendingSchedule(record, platforms = null) {
  const selected = platforms ?? record?.platforms ?? [];
  if (!selected.length) return false;

  const schedules = record?.platform_schedules || {};
  const now = Date.now();

  for (const platform of selected) {
    if (isPlatformPublished(record, platform)) continue;
    if (isPlatformRetryable(record, platform)) continue;

    const iso = schedules[platform] || record?.scheduled_at;
    if (!iso) continue;
    const when = Date.parse(iso);
    if (!Number.isNaN(when) && when > now) return true;
  }

  return false;
}
