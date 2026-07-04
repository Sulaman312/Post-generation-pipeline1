/** Post / pipeline run publishing fields — mirrors `backend/run_record.py`. */

export const POST_STATUSES = ["draft", "scheduled", "published", "failed"];

export const PLATFORMS = ["instagram", "linkedin", "facebook"];

export const PLATFORM_RESULT_STATUSES = [
  "pending",
  "published",
  "failed",
  "skipped",
];

export const DEFAULT_PLATFORMS = [...PLATFORMS];

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

/**
 * @param {object|null|undefined} run
 * @returns {{ status: string, platforms: string[], scheduled_at: string|null, published_results: PublishedResult[] }}
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
    published_results: Array.isArray(run.published_results)
      ? run.published_results
      : base.published_results,
  };
}
