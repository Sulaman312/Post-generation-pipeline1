import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import { PLATFORMS, hasPendingSchedule, isPlatformRetryable, runRecordFromRun, unpublishedSelectedPlatforms } from "../../constants/runRecord";
import { PLATFORM_LABELS } from "../../utils/postPublishStatus";
import { schedulesAreSynced } from "../../utils/publishSchedules";
import SchedulePublishModal, { formatScheduleLabel } from "./SchedulePublishModal";
import PlatformSwitch from "./publish/PlatformSwitch";
import PublishEnvToggle from "./publish/PublishEnvToggle";
import "./PublishPlatformControls.css";

export default function PublishPlatformControls({
  client,
  runId,
  run,
  stepKey,
  topic = "",
  statuses = {},
  pipelineId = "social_media",
  onRunUpdated,
  toast,
  onPublishActionsLockedChange,
}) {
  const [connected, setConnected] = useState([]);
  const [loadingConnected, setLoadingConnected] = useState(true);
  const [publishEnv, setPublishEnv] = useState("test");
  const [envAvailability, setEnvAvailability] = useState({ test: true, live: false });
  const [switchingEnv, setSwitchingEnv] = useState(false);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [syncSchedules, setSyncSchedules] = useState(true);
  const [scheduleEditUnlocked, setScheduleEditUnlocked] = useState(false);
  const initialSyncPlatformsRef = useRef(true);
  const syncPreferenceRef = useRef(null);

  const record = useMemo(() => runRecordFromRun(run), [run]);
  const platformSchedules = useMemo(
    () => record.platform_schedules || {},
    [record.platform_schedules]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingConnected(true);
      try {
        const settings = await api.getPublishSettings(client);
        if (cancelled) return;
        setPublishEnv(settings.env || "test");
        setEnvAvailability(settings.availability || { test: true, live: false });
        const keys = (settings.connected_platforms || []).map((row) =>
          typeof row === "string" ? row : row.key
        ).filter(Boolean);
        setConnected(keys);
      } catch (e) {
        if (cancelled) return;
        try {
          const rows = await api.getConnectedPlatforms(client);
          setConnected(
            rows.filter((row) => row?.connected && row?.key).map((row) => row.key)
          );
        } catch (inner) {
          toast?.(inner?.message || String(inner), { variant: "error", duration: 9000 });
        }
      } finally {
        if (!cancelled) setLoadingConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, toast]);

  async function handlePublishEnvChange(nextEnv) {
    if (switchingEnv || nextEnv === publishEnv) return;
    setSwitchingEnv(true);
    try {
      const settings = await api.setPublishEnv(nextEnv, client);
      setPublishEnv(settings.env || nextEnv);
      setEnvAvailability(settings.availability || envAvailability);
      const keys = (settings.connected_platforms || []).map((row) =>
        typeof row === "string" ? row : row.key
      ).filter(Boolean);
      setConnected(keys);
      toast?.(
        nextEnv === "live"
          ? "Switched to live publishing credentials."
          : "Switched to test publishing credentials.",
        { variant: "success", duration: 3000 }
      );
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    } finally {
      setSwitchingEnv(false);
    }
  }

  useEffect(() => {
    const allowed = new Set(connected);
    const next = (record.platforms || []).filter((p) => allowed.has(p));
    setSelected(next);
  }, [record.platforms, connected]);

  useEffect(() => {
    syncPreferenceRef.current = null;
    initialSyncPlatformsRef.current = true;
    setSyncSchedules(schedulesAreSynced(platformSchedules, selected));
    setScheduleEditUnlocked(false);
    // Only reset when switching runs; schedule sync is handled in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional runId-only reset
  }, [runId]);

  useEffect(() => {
    const synced = schedulesAreSynced(platformSchedules, selected);
    if (!synced) {
      syncPreferenceRef.current = null;
      setSyncSchedules(false);
      return;
    }
    if (syncPreferenceRef.current === null) {
      setSyncSchedules(true);
    }
  }, [platformSchedules, selected]);

  const persistPlatforms = useCallback(
    async (platforms) => {
      setSaving(true);
      try {
        const updated = await api.updateRunPlatforms(client, runId, platforms);
        setSelected(updated.platforms || platforms);
        await onRunUpdated?.(updated);
      } catch (e) {
        toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [client, runId, onRunUpdated, toast]
  );

  const publishedByPlatform = useMemo(() => {
    const map = {};
    for (const row of record.published_results || []) {
      if (row?.platform) map[row.platform] = row;
    }
    return map;
  }, [record.published_results]);

  const selectAllPublishablePlatforms = useCallback(async () => {
    const allPublishable = connected
      .filter((platform) => !publishedByPlatform[platform])
      .sort((a, b) => PLATFORMS.indexOf(a) - PLATFORMS.indexOf(b));
    const current = (record.platforms || []).filter((p) => connected.includes(p));
    const alreadyAllSelected =
      allPublishable.length === current.length &&
      allPublishable.every((platform) => current.includes(platform));
    if (alreadyAllSelected || allPublishable.length === 0) return;

    setSelected(allPublishable);
    try {
      await persistPlatforms(allPublishable);
    } catch {
      setSelected(current);
    }
  }, [connected, publishedByPlatform, record.platforms, persistPlatforms]);

  useEffect(() => {
    if (!syncSchedules || loadingConnected || !initialSyncPlatformsRef.current) return;
    initialSyncPlatformsRef.current = false;
    void selectAllPublishablePlatforms();
  }, [syncSchedules, loadingConnected, connected, selectAllPublishablePlatforms]);

  async function handleSyncSchedulesChange(checked) {
    syncPreferenceRef.current = checked;
    setSyncSchedules(checked);
    if (!checked || saving) return;
    await selectAllPublishablePlatforms();
  }

  async function handleToggle(platform) {
    if (saving || !connected.includes(platform)) return;
    const next = selected.includes(platform)
      ? selected.filter((p) => p !== platform)
      : [...selected, platform].sort(
          (a, b) => PLATFORMS.indexOf(a) - PLATFORMS.indexOf(b)
        );
    setSelected(next);
    try {
      await persistPlatforms(next);
    } catch {
      setSelected((record.platforms || []).filter((p) => connected.includes(p)));
    }
  }

  async function handlePublishNow(targetPlatforms = null) {
    if (publishing || publishActionsLocked) return;
    const targets = targetPlatforms || unpublishedSelectedPlatforms(record, selected);
    if (!targets.length) return;
    setPublishing(true);
    try {
      await api.publishRunPlatforms(client, runId, targets);
      await onRunUpdated?.();
      toast?.(
        targets.length === 1
          ? `Publishing to ${PLATFORM_LABELS[targets[0]] || targets[0]}…`
          : "Publishing started.",
        { variant: "success", duration: 3500 }
      );
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 12000 });
    } finally {
      setPublishing(false);
    }
  }

  function openScheduleFor(platform) {
    setScheduleEditUnlocked(true);
    setScheduleTarget(platform);
    setScheduleOpen(true);
  }

  function closeScheduleModal() {
    if (scheduling) return;
    setScheduleOpen(false);
    setScheduleTarget(null);
    if (hasPendingSchedule(record, selected)) {
      setScheduleEditUnlocked(false);
    }
  }

  async function handleScheduleConfirm(scheduledAt) {
    setScheduling(true);
    try {
      const updates = {};
      if (syncSchedules) {
        for (const platform of selected) {
          updates[platform] = scheduledAt;
        }
      } else if (scheduleTarget) {
        updates[scheduleTarget] = scheduledAt;
      }
      const updated = await api.scheduleRun(client, runId, {
        scheduled_at: scheduledAt,
        platform_schedules: updates,
      });
      await onRunUpdated?.(updated);
      setScheduleOpen(false);
      setScheduleTarget(null);
      setScheduleEditUnlocked(false);
      const label = formatScheduleLabel(scheduledAt);
      toast?.(
        syncSchedules
          ? `All selected platforms scheduled for ${label}.`
          : `${PLATFORM_LABELS[scheduleTarget] || scheduleTarget} scheduled for ${label}.`,
        { variant: "success", duration: 4500 }
      );
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    } finally {
      setScheduling(false);
    }
  }

  const noneSelected = selected.length === 0;
  const publishStepStatus = statuses.publish || "pending";
  const publishBusy = publishing || publishStepStatus === "running";
  const publishActionsLocked =
    hasPendingSchedule(record, selected) && !scheduleEditUnlocked;
  const unpublishedTargets = unpublishedSelectedPlatforms(record, selected);
  const hasRetryablePlatforms = selected.some((platform) =>
    isPlatformRetryable(record, platform)
  );

  useEffect(() => {
    onPublishActionsLockedChange?.(publishActionsLocked);
    window.dispatchEvent(
      new CustomEvent("cf:publish-schedule-lock", {
        detail: { clientId: client, runId, locked: publishActionsLocked },
      })
    );
  }, [publishActionsLocked, client, runId, onPublishActionsLockedChange]);

  function platformRowState(platform) {
    const result = publishedByPlatform[platform];
    if (result?.status === "published") {
      return { kind: "published", label: "Published" };
    }
    if (result?.status === "failed") {
      return {
        kind: "retryable",
        label: "Failed",
        detail: result.error || "Publish failed",
      };
    }
    if (result?.status === "skipped") {
      const detail = result.error === "not connected" ? "Not connected" : result.error;
      return { kind: "retryable", label: "Skipped", detail };
    }
    return { kind: "pending", label: null, detail: null };
  }

  const scheduleModalPlatform = scheduleTarget
    ? PLATFORM_LABELS[scheduleTarget] || scheduleTarget
    : null;
  const existingForModal =
    scheduleTarget && !syncSchedules
      ? platformSchedules[scheduleTarget] || null
      : selected.map((p) => platformSchedules[p]).find(Boolean) ||
        record.scheduled_at ||
        null;

  return (
    <section className="publish-platform-controls" aria-label="Publish destinations">
      <div className="ppc-head">
        <div className="ppc-head-main">
          <h3 className="ppc-title">Publish to</h3>
          <PublishEnvToggle
            env={publishEnv}
            availability={envAvailability}
            switching={switchingEnv || loadingConnected}
            onChange={handlePublishEnvChange}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={unpublishedTargets.length === 0 || publishBusy || publishActionsLocked}
          title={
            publishActionsLocked
              ? "Change the schedule to publish immediately"
              : undefined
          }
          onClick={() => handlePublishNow()}
        >
          {publishBusy ? (
            <>
              <span className="spinner spinner-light" /> Publishing…
            </>
          ) : (
            "Publish now"
          )}
        </button>
      </div>

      {loadingConnected ? (
        <p className="publish-platform-loading">
          <span className="spinner" /> Checking connected accounts…
        </p>
      ) : connected.length === 0 ? (
        <p className="publish-platform-empty">
          No accounts connected for <strong>{publishEnv}</strong>
          {publishEnv === "test" ? (
            <>
              {" "}
              — add credentials in <code>.env</code> (META_*, LINKEDIN_*)
            </>
          ) : (
            <>
              {" "}
              — add META_LIVE_&lt;WORKSPACE&gt;_* / LINKEDIN_LIVE_&lt;WORKSPACE&gt;_*
              in <code>.env</code>
            </>
          )}
        </p>
      ) : (
        <>
          <label className="ppc-sync">
            <input
              type="checkbox"
              checked={syncSchedules}
              onChange={(e) => handleSyncSchedulesChange(e.target.checked)}
            />
            <span className="ppc-sync-box" aria-hidden />
            <span>Use same schedule for all platforms</span>
          </label>

          <ul className="ppc-list">
            {connected.map((platform) => {
              const active = selected.includes(platform);
              const rowState = platformRowState(platform);
              const scheduleIso = platformSchedules[platform] || null;
              const scheduleLabel = scheduleIso ? formatScheduleLabel(scheduleIso) : null;
              const published = rowState.kind === "published";
              const retryable = rowState.kind === "retryable";

              return (
                <li
                  key={platform}
                  className={`ppc-row${active ? " ppc-row--on" : ""}${
                    published ? " ppc-row--published" : ""
                  }${retryable ? " ppc-row--retryable" : ""}`}
                >
                  <PlatformSwitch
                    checked={active}
                    disabled={saving || published}
                    onChange={() => handleToggle(platform)}
                    label={`Publish to ${PLATFORM_LABELS[platform] || platform}`}
                  />
                  <span className="ppc-name">{PLATFORM_LABELS[platform] || platform}</span>
                  <div className="ppc-schedule">
                    {published ? (
                      <span className="ppc-schedule-text ppc-schedule-text--muted">
                        {rowState.label}
                      </span>
                    ) : !active ? (
                      <span className="ppc-schedule-text ppc-schedule-text--muted">
                        Off
                      </span>
                    ) : retryable ? (
                      <span className="ppc-schedule-text ppc-schedule-text--warning">
                        {rowState.detail || rowState.label}
                      </span>
                    ) : scheduleLabel ? (
                      <span className="ppc-schedule-text">{scheduleLabel}</span>
                    ) : (
                      <span className="ppc-schedule-text ppc-schedule-text--muted">
                        Not scheduled
                      </span>
                    )}
                    {active && !published ? (
                      <div className="ppc-schedule-actions">
                        {retryable ? (
                          <button
                            type="button"
                            className="ppc-schedule-btn ppc-schedule-btn--primary"
                            disabled={publishing || publishBusy}
                            onClick={() => handlePublishNow([platform])}
                          >
                            Publish now
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ppc-schedule-btn"
                          disabled={scheduling}
                          onClick={() => openScheduleFor(platform)}
                        >
                          {scheduleLabel || retryable ? "Reschedule" : "Set time"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {hasRetryablePlatforms ? (
        <p className="publish-platform-hint publish-platform-hint--retry" role="status">
          Some platforms were not published. Use <strong>Publish now</strong> or{" "}
          <strong>Reschedule</strong> below.
        </p>
      ) : publishActionsLocked ? (
        <p className="publish-platform-hint" role="status">
          This post is scheduled. Use <strong>Reschedule</strong> on a platform to publish
          immediately.
        </p>
      ) : null}

      {noneSelected && connected.length > 0 && !publishActionsLocked ? (
        <p className="publish-platform-hint" role="status">
          Turn on at least one platform to publish or schedule.
        </p>
      ) : null}

      {stepKey === "publish" && publishStepStatus === "done" ? (
        <p className="publish-platform-note">Publish step completed — see output below.</p>
      ) : null}

      <SchedulePublishModal
        open={scheduleOpen}
        saving={scheduling}
        existingScheduledAt={existingForModal}
        platformCount={syncSchedules ? selected.length : 1}
        platformLabel={syncSchedules ? null : scheduleModalPlatform}
        onClose={closeScheduleModal}
        onConfirm={handleScheduleConfirm}
      />
    </section>
  );
}
