/** Format milliseconds as a short human duration (e.g. `2m 15s`). */
export function formatStepDurationMs(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 1) return "<1s";
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

/** Long-form duration for sidebar step rows (e.g. `31 min 35 secs`). */
export function formatStepDurationLong(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 1) return "<1 sec";
  if (totalSec < 60) return `${totalSec} sec${totalSec === 1 ? "" : "s"}`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) {
    if (sec > 0) return `${min} min ${sec} sec${sec === 1 ? "" : "s"}`;
    return `${min} min`;
  }
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (remMin > 0) return `${hr} hr ${remMin} min`;
  return `${hr} hr`;
}

function elapsedMsFromStartedAt(startedAt, nowMs = Date.now()) {
  if (!startedAt) return null;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, nowMs - t);
}

/**
 * Status label plus duration for pipeline sidebar (e.g. `Done · 2m 15s`).
 */
export function formatStepStatusWithDuration(status, timing, nowMs = Date.now()) {
  const base =
    status === "done"
      ? "Done"
      : status === "running"
        ? "Running"
        : status === "error"
          ? "Error"
          : status === "skipped"
            ? "Skipped"
            : "Pending";

  if (!timing) return base;

  if (status === "running") {
    const elapsed = formatStepDurationMs(
      elapsedMsFromStartedAt(timing.started_at, nowMs)
    );
    return elapsed ? `${base} · ${elapsed}` : base;
  }

  const duration = formatStepDurationMs(timing.duration_ms);
  if (!duration) return base;

  const prefix = timing.inferred && !timing.client ? "~" : "";
  return `${base} · ${prefix}${duration}`;
}

/** Subtitle under step name in sidebar (duration only, reference-style). */
export function formatStepMetaSubtitle(status, timing, nowMs = Date.now()) {
  if (status === "running") {
    const elapsed = formatStepDurationLong(
      elapsedMsFromStartedAt(timing?.started_at, nowMs)
    );
    return elapsed ? `${elapsed}…` : "Running…";
  }
  if (status === "done") {
    const duration = formatStepDurationLong(timing?.duration_ms);
    if (!duration) return null;
    return timing?.inferred && !timing?.client ? `~${duration}` : duration;
  }
  if (status === "error") return "Failed";
  if (status === "skipped") return "Skipped";
  return null;
}

/** Merge server timings with a client-measured duration (fallback when API is stale). */
export function resolveStepTiming(stepKey, serverTimings, clientDurations) {
  const server = serverTimings?.[stepKey];
  if (server?.duration_ms != null && server.duration_ms > 0) {
    return server;
  }
  const clientMs = clientDurations?.[stepKey];
  if (clientMs != null && clientMs > 0) {
    return { duration_ms: clientMs, client: true };
  }
  return server || null;
}
