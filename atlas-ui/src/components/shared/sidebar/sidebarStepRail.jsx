import { IconPlayStep } from "./sidebarIcons";

/** Numbered node for the collapsed pipeline rail. */
export function CollapsedStepNode({ step, status, active, isRunningThis }) {
  const showDoneMark = status === "done" && !isRunningThis && !active;
  return (
    <span
      className={[
        "sb-collapsed-node",
        active ? "is-active" : "",
        status === "done" ? "is-done" : "",
        isRunningThis ? "is-running" : "",
        status === "error" ? "is-error" : "",
        status === "skipped" ? "is-skipped" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      {showDoneMark ? (
        <svg viewBox="0 0 12 12" className="sb-collapsed-node-check" aria-hidden>
          <path
            d="M2.5 6.2 4.8 8.5 9.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span className="sb-collapsed-node-num">{step.index}</span>
      )}
    </span>
  );
}

export function CollapsedRunProgress({
  steps,
  statuses,
  activeStepKey,
  runningStepKey = null,
}) {
  const total = steps.length;
  const doneCount = steps.filter(
    (s) => (statuses[s.key] || "pending") === "done"
  ).length;
  const runningStep = steps.find(
    (s) => statuses[s.key] === "running" || s.key === runningStepKey
  );
  const activeStep = steps.find((s) => s.key === activeStepKey);
  const highlightStep = runningStep || activeStep;
  const pos = highlightStep?.index ?? 1;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const circumference = 2 * Math.PI * 14;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      className="sb-collapsed-progress"
      title={`${doneCount} of ${total} steps complete`}
      aria-label={`${doneCount} of ${total} steps complete, on step ${pos}`}
    >
      <svg className="sb-collapsed-progress-ring" viewBox="0 0 36 36" aria-hidden>
        <circle className="sb-collapsed-progress-track" cx="18" cy="18" r="14" />
        <circle
          className="sb-collapsed-progress-fill"
          cx="18"
          cy="18"
          r="14"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <span className="sb-collapsed-progress-text">{pos}</span>
    </div>
  );
}

export function StepRailDot({ status, active, isRunningThis, stepIndex = null }) {
  const showDoneTick = status === "done" && !isRunningThis;
  const showPlayHint = status === "pending" && !active && !isRunningThis;
  return (
    <span
      className={[
        "sb-step-dot",
        showDoneTick ? "sb-step-dot--done" : "",
        active && !showDoneTick ? "sb-step-dot--active" : "",
        isRunningThis ? "sb-step-dot--running" : "",
        status === "error" ? "sb-step-dot--error" : "",
        status === "skipped" ? "sb-step-dot--skipped" : "",
        showPlayHint ? "sb-step-dot--pending" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showDoneTick ? (
        <svg viewBox="0 0 12 12" className="sb-step-dot-icon" aria-hidden>
          <path
            d="M2.8 6.2 5.1 8.5 9.2 3.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : isRunningThis ? (
        <span className="sb-step-dot-num" aria-hidden>
          {stepIndex ?? "·"}
        </span>
      ) : showPlayHint ? (
        <IconPlayStep className="sb-step-dot-play" />
      ) : null}
    </span>
  );
}

export function splitStepStatus(statusText) {
  const parts = String(statusText || "").split(" · ");
  return {
    label: parts[0] || statusText,
    detail: parts.length > 1 ? parts.slice(1).join(" · ") : null,
  };
}
