import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../../services/api";
import { useToast } from "../../../context/ToastContext";
import { stepsForPipeline } from "../../../constants/pipelines";
import {
  isSocialPipeline,
  socialRunFullText,
  socialRunTitle,
} from "../../../utils/socialRunTopic";
import {
  formatStepMetaSubtitle,
  formatStepStatusWithDuration,
  resolveStepTiming,
} from "../../../utils/formatStepDuration";
import { canRunStep } from "../../../utils/pipelineFlow";
import { hasPendingSchedule, runRecordFromRun } from "../../../constants/runRecord";
import { publishStepSidebarMeta } from "../../../utils/postPublishStatus";
import { executeRunStep } from "../../../utils/runStepAction";
import { statusLabel } from "../../../utils/runViewStatus";
import {
  IconMatrix,
  IconPauseStep,
  IconPlayStep,
  IconRerun,
} from "./sidebarIcons";
import { SidebarSection } from "./sidebarNav";
import {
  CollapsedRunProgress,
  CollapsedStepNode,
  StepRailDot,
  splitStepStatus,
} from "./sidebarStepRail";

export function RunNavSection({
  client,
  runId,
  collapsed,
  activeStepKey,
  onSelectStep,
  onClearRun,
  onGoToMatrix,
  onGoToSocialMatrix,
  onPatchStepStatus,
  statusOverrides = {},
  run = null,
  onRefreshRun,
}) {
  const { toast } = useToast();
  const [runningStepKey, setRunningStepKey] = useState(null);
  const [hoveredStepKey, setHoveredStepKey] = useState(null);
  const [clockTick, setClockTick] = useState(0);
  const [clientStepDurations, setClientStepDurations] = useState({});
  const [publishScheduleLocked, setPublishScheduleLocked] = useState(false);
  const [showFullTopic, setShowFullTopic] = useState(false);
  const runAbortRef = useRef(null);
  const stepRunStartRef = useRef({});

  function reconcileStatusOverrides(serverStatuses) {
    for (const stepKey of Object.keys(statusOverrides)) {
      const server = serverStatuses[stepKey] ?? "pending";
      const override = statusOverrides[stepKey];
      if (server === override) {
        onPatchStepStatus?.(stepKey, null);
        continue;
      }
      if (override === "pending" && server === "running") {
        continue;
      }
      onPatchStepStatus?.(stepKey, null);
    }
  }

  async function refreshRunData() {
    try {
      await onRefreshRun?.();
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!run?.statuses) return;
    reconcileStatusOverrides(run.statuses);
    // Reconcile when shared run data updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  function markStepPending(stepKey) {
    onPatchStepStatus?.(stepKey, "pending");
    setRunningStepKey(null);
    runAbortRef.current = null;
  }

  const serverStatuses = run?.statuses || {};
  const statuses = { ...serverStatuses, ...statusOverrides };
  const storedTopic = run?.topic || "";
  const pipelineId = run?.pipeline_id || "article";
  const isSocial = isSocialPipeline(pipelineId);
  const topic = isSocial
    ? socialRunTitle(run?.manual_inputs, storedTopic)
    : storedTopic;
  const topicFullText = isSocial
    ? socialRunFullText(run?.manual_inputs, storedTopic)
    : storedTopic.trim() || topic;
  const topicNeedsExpand =
    topicFullText.length > topic.length ||
    topic.includes("\n") ||
    topic.length > 48;
  useEffect(() => {
    setShowFullTopic(false);
  }, [client, runId, topic]);

  const STEPS = stepsForPipeline(pipelineId);
  const stepTimings = run?.step_timings || {};

  const publishRecord = useMemo(() => runRecordFromRun(run), [run]);
  const publishStepScheduled = useMemo(
    () => hasPendingSchedule(publishRecord, publishRecord.platforms),
    [publishRecord]
  );

  useEffect(() => {
    setPublishScheduleLocked(publishStepScheduled);
  }, [client, runId, publishStepScheduled]);

  useEffect(() => {
    function onPublishScheduleLock(event) {
      const { clientId, runId: eventRunId, locked } = event.detail || {};
      if (clientId !== client || eventRunId !== runId) return;
      setPublishScheduleLocked(Boolean(locked));
    }
    window.addEventListener("cf:publish-schedule-lock", onPublishScheduleLock);
    return () => window.removeEventListener("cf:publish-schedule-lock", onPublishScheduleLock);
  }, [client, runId]);

  const hasRunningStep =
    Boolean(runningStepKey) ||
    Object.values(statuses).some((s) => s === "running");

  useEffect(() => {
    if (!hasRunningStep) return undefined;
    const id = window.setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [hasRunningStep]);

  async function handleRunStep(stepKey, e) {
    e?.stopPropagation?.();
    if (runningStepKey) return;
    const st = statuses[stepKey] || "pending";
    if (st === "running") return;
    if (stepKey === "publish" && publishScheduleLocked) return;
    if (!canRunStep(stepKey, statuses, topic, pipelineId) && st !== "done") return;

    onSelectStep(stepKey);
    const ac = new AbortController();
    runAbortRef.current = ac;
    setRunningStepKey(stepKey);
    const runStartedAt = Date.now();
    stepRunStartRef.current[stepKey] = runStartedAt;
    try {
      const ran = await executeRunStep(
        api,
        client,
        runId,
        stepKey,
        topic,
        statuses,
        ac.signal,
        pipelineId
      );
      const elapsedMs = Date.now() - runStartedAt;
      setClientStepDurations((prev) => ({
        ...prev,
        [stepKey]: elapsedMs,
      }));
      await refreshRunData();
      onSelectStep(stepKey);
      window.dispatchEvent(
        new CustomEvent("cf:run-step-complete", {
          detail: { clientId: client, runId, stepKey },
        })
      );
      toast(
        st === "done" ? `Re-ran ${ran?.label || "step"}.` : `Ran ${ran?.label || "step"}.`,
        { variant: "success", duration: 3500 }
      );
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg === "Stopped by user.") {
        markStepPending(stepKey);
        const cancelled = await tryCancelOnServer(stepKey);
        await refreshRunData();
        toast(
          cancelled
            ? "Step paused."
            : "Step paused in the UI. Restart python main.py, then pause again if it still shows Running.",
          { variant: "success", duration: cancelled ? 3500 : 6000 }
        );
      } else {
        toast(msg, { variant: "error", duration: 12000 });
      }
    } finally {
      runAbortRef.current = null;
      setRunningStepKey(null);
    }
  }

  async function tryCancelOnServer(stepKey) {
    try {
      await api.cancelStep(client, runId, stepKey);
      return true;
    } catch {
      return false;
    }
  }

  async function handlePauseStep(stepKey, e) {
    e?.stopPropagation?.();
    if (runningStepKey === stepKey && runAbortRef.current) {
      const ac = runAbortRef.current;
      ac.abort();
      markStepPending(stepKey);
      const cancelled = await tryCancelOnServer(stepKey);
      await refreshRunData();
      toast(
        cancelled
          ? "Step paused."
          : "Step paused in the UI. Restart python main.py, then pause again to reset the server.",
        { variant: "success", duration: cancelled ? 3500 : 6000 }
      );
      return;
    }
    if ((serverStatuses[stepKey] || "pending") !== "running") return;
    markStepPending(stepKey);
    const cancelled = await tryCancelOnServer(stepKey);
    await refreshRunData();
    toast(
      cancelled
        ? "Step reset to pending."
        : "Shown as pending here. Restart python main.py so the server can clear Running.",
      { variant: "success", duration: cancelled ? 3500 : 6000 }
    );
  }

  function handleBack() {
    onClearRun?.();
    if ((run?.pipeline_id || "article") === "social_media") onGoToSocialMatrix?.();
    else onGoToMatrix?.();
  }

  return (
    <>
      {!collapsed ? (
        <div className="sb-run-nav-top">
          <button
            type="button"
            className="sb-item active sb-run-back"
            onClick={handleBack}
            aria-label="Back to step matrix"
          >
            <IconMatrix />
            <span className="sb-item-label">Step matrix</span>
          </button>
          {topic ? (
            topicNeedsExpand ? (
              <button
                type="button"
                className={`sb-run-topic-bar${
                  showFullTopic ? " sb-run-topic-bar--expanded" : ""
                }`}
                onClick={() => setShowFullTopic((v) => !v)}
                aria-expanded={showFullTopic}
                aria-label={showFullTopic ? "Hide full title" : "Show full title"}
              >
                <span className="sb-run-topic">
                  {showFullTopic ? topicFullText : topic}
                </span>
              </button>
            ) : (
              <p className="sb-run-topic-bar sb-run-topic-bar--static">
                <span className="sb-run-topic sb-run-topic--expanded">{topic}</span>
              </p>
            )
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="sb-collapsed-back sb-collapsed-back--matrix"
          onClick={handleBack}
          title="Back to step matrix"
          aria-label="Back to step matrix"
        >
          <IconMatrix />
        </button>
      )}

      <SidebarSection
        collapsed={collapsed}
        title="Pipeline steps"
        className={[
          "sb-section--pipeline",
          collapsed ? "sb-section--collapsed-rail" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div
          className={
            collapsed
              ? "sb-collapsed-steps"
              : `sb-steps-stack sb-steps-timeline`
          }
          data-clock-tick={hasRunningStep ? clockTick : undefined}
        >
          {STEPS.map((step, stepIdx) => {
            const s = statuses[step.key] || "pending";
            const active = step.key === activeStepKey;
            const isLast = stepIdx === STEPS.length - 1;
            const runnable =
              s !== "running" &&
              (s === "done" ||
                s === "skipped" ||
                canRunStep(step.key, statuses, topic, pipelineId));
            const publishStepLocked =
              step.key === "publish" && publishScheduleLocked;
            const isRunningThis =
              (s === "running" || runningStepKey === step.key) &&
              s !== "pending";
            const pausable =
              isRunningThis &&
              (runningStepKey === step.key || s === "running");
            let resolvedTiming = resolveStepTiming(
              step.key,
              stepTimings,
              clientStepDurations
            );
            const localStart = stepRunStartRef.current[step.key];
            if (
              (isRunningThis || runningStepKey === step.key) &&
              localStart &&
              !resolvedTiming?.duration_ms
            ) {
              resolvedTiming = {
                ...resolvedTiming,
                started_at: new Date(localStart).toISOString(),
              };
            }
            const statusText = formatStepStatusWithDuration(
              s,
              resolvedTiming,
              Date.now(),
              isRunningThis ? step.index : null
            );
            const metaSubtitle = (() => {
              if (step.key === "publish" && run) {
                const publishMeta = publishStepSidebarMeta(run);
                if (publishMeta) return publishMeta;
              }
              return formatStepMetaSubtitle(
                s,
                resolvedTiming,
                Date.now(),
                isRunningThis ? step.index : null
              );
            })();
            const timingTitle = resolvedTiming?.client
              ? "Duration measured in this browser session"
              : resolvedTiming?.inferred && resolvedTiming?.duration_ms
                ? "Estimated from when each step file was saved"
                : undefined;
            const cls = [
              "sb-step",
              collapsed ? "sb-step--collapsed" : "",
              active ? "active" : "",
              s === "done" ? "is-done" : "",
              isRunningThis ? "is-running" : "",
              s === "error" ? "is-error" : "",
              s === "skipped" ? "is-skipped" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const { detail: statusDetail } = splitStepStatus(statusText);
            const rowCls = [
              "sb-step-row",
              isLast ? "sb-step-row--last" : "",
              active ? "active" : "",
              s === "done" ? "is-done" : "",
              isRunningThis ? "is-running" : "",
              s === "error" ? "is-error" : "",
              s === "skipped" ? "is-skipped" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const showRailAction =
              !collapsed &&
              (active || hoveredStepKey === step.key) &&
              Boolean(pausable || runnable);

            return (
              <div
                key={step.key}
                className={rowCls}
                onMouseEnter={() => setHoveredStepKey(step.key)}
                onMouseLeave={() => setHoveredStepKey(null)}
              >
                <div className="sb-step-card">
                {!collapsed ? (
                  <div className="sb-step-rail">
                    <div className="sb-step-rail-slot">
                      {pausable ? (
                        <button
                          type="button"
                          className="sb-step-rail-btn sb-step-rail-btn--pause"
                          aria-label={`Pause ${step.label}`}
                          title={`Pause ${step.label}`}
                          onClick={(e) => handlePauseStep(step.key, e)}
                        >
                          <IconPauseStep />
                        </button>
                      ) : showRailAction && runnable ? (
                        <button
                          type="button"
                          className={`sb-step-rail-btn${
                            s === "done"
                              ? " sb-step-rail-btn--rerun"
                              : " sb-step-rail-btn--play"
                          }`}
                          disabled={Boolean(runningStepKey) || publishStepLocked}
                          aria-label={
                            s === "done"
                              ? `Re-run ${step.label}`
                              : `Run ${step.label}`
                          }
                          title={
                            publishStepLocked
                              ? "Change the schedule to publish immediately"
                              : s === "done"
                                ? "Re-run this step"
                                : `Run ${step.label}`
                          }
                          data-tip={
                            s === "done" ? "Re-run this step" : undefined
                          }
                          onClick={(e) => handleRunStep(step.key, e)}
                        >
                          {runningStepKey === step.key ? (
                            <span className="spinner spinner--sm" aria-hidden />
                          ) : s === "done" ? (
                            <IconRerun />
                          ) : (
                            <IconPlayStep />
                          )}
                        </button>
                      ) : (
                        <div className="sb-step-rail-indicator" aria-hidden>
                          <StepRailDot
                            status={s}
                            active={active}
                            isRunningThis={isRunningThis}
                            stepIndex={step.index}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelectStep(step.key)}
                  className={cls}
                  aria-label={
                    collapsed
                      ? `${step.index}. ${step.label} — ${statusText}`
                      : `${step.label} — ${statusText}`
                  }
                  title={
                    collapsed
                      ? `${step.index}. ${step.label} — ${statusText}`
                      : timingTitle
                  }
                  data-tip={
                    collapsed
                      ? `${step.label} · ${statusLabel(s)}`
                      : undefined
                  }
                >
                  {collapsed ? (
                    <CollapsedStepNode
                      step={step}
                      status={s}
                      active={active}
                      isRunningThis={isRunningThis}
                    />
                  ) : null}
                  {!collapsed ? (
                    <span className="sb-step-text">
                      <div className="sb-step-label">
                        <span className="sb-step-name">{step.label}</span>
                      </div>
                      {metaSubtitle || statusDetail ? (
                        <div className="sb-step-meta" title={timingTitle}>
                          <span className="sb-step-duration">
                            {metaSubtitle || statusDetail}
                          </span>
                        </div>
                      ) : null}
                    </span>
                  ) : null}
                  {!collapsed && isRunningThis ? (
                    <span className="spinner sb-step-spinner" />
                  ) : null}
                </button>
                </div>
              </div>
            );
          })}
        </div>
        {collapsed ? (
          <CollapsedRunProgress
            steps={STEPS}
            statuses={statuses}
            activeStepKey={activeStepKey}
            runningStepKey={runningStepKey}
          />
        ) : null}
      </SidebarSection>
    </>
  );
}
