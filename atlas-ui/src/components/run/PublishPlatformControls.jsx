import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import { PLATFORMS, runRecordFromRun } from "../../constants/runRecord";
import { executeRunStep } from "../../utils/runStepAction";
import SchedulePublishModal, { formatScheduleLabel } from "./SchedulePublishModal";
import "./PublishPlatformControls.css";

const PLATFORM_LABELS = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

function schedulesAreSynced(schedules, platforms) {
  if (!platforms.length) return true;

  const times = platforms.map((platform) => {
    const iso = schedules[platform];
    return typeof iso === "string" && iso.trim() ? iso.trim() : null;
  });

  const scheduled = times.filter(Boolean);
  if (!scheduled.length) return true;
  if (scheduled.length !== platforms.length) return false;
  return scheduled.every((time) => time === scheduled[0]);
}

function PlatformSwitch({ checked, disabled, onChange, label }) {
  return (
    <label className="ppc-switch">
      <input
        type="checkbox"
        className="ppc-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ppc-switch-track" aria-hidden />
      <span className="visually-hidden">{label}</span>
    </label>
  );
}

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
}) {
  const [connected, setConnected] = useState([]);
  const [loadingConnected, setLoadingConnected] = useState(true);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [syncSchedules, setSyncSchedules] = useState(true);
  const initialSyncPlatformsRef = useRef(true);
  const syncPreferenceRef = useRef(null);

  const record = useMemo(() => runRecordFromRun(run), [run]);
  const platformSchedules = record.platform_schedules || {};

  useEffect(() => {
    let cancelled = false;
    setLoadingConnected(true);
    api
      .getConnectedPlatforms()
      .then((rows) => {
        if (cancelled) return;
        setConnected(
          rows.filter((row) => row?.connected && row?.key).map((row) => row.key)
        );
      })
      .catch((e) => {
        if (!cancelled) {
          toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    const allowed = new Set(connected);
    const next = (record.platforms || []).filter((p) => allowed.has(p));
    setSelected(next);
  }, [record.platforms, connected]);

  useEffect(() => {
    syncPreferenceRef.current = null;
    initialSyncPlatformsRef.current = true;
    setSyncSchedules(schedulesAreSynced(platformSchedules, selected));
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

  async function handlePublishNow() {
    if (publishing || selected.length === 0) return;
    setPublishing(true);
    try {
      await executeRunStep(
        api,
        client,
        runId,
        "publish",
        topic,
        statuses,
        null,
        pipelineId
      );
      await onRunUpdated?.();
      toast?.("Publishing started.", { variant: "success", duration: 3500 });
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 12000 });
    } finally {
      setPublishing(false);
    }
  }

  function openScheduleFor(platform) {
    setScheduleTarget(platform);
    setScheduleOpen(true);
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

  function platformStatusLabel(platform) {
    const result = publishedByPlatform[platform];
    if (!result) return null;
    if (result.status === "published") return "Published";
    if (result.status === "failed") return "Failed";
    if (result.status === "skipped") return "Skipped";
    return null;
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
        <h3 className="ppc-title">Publish to</h3>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={noneSelected || publishBusy}
          onClick={handlePublishNow}
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
          No accounts connected — add credentials in <code>.env</code>
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
              const publishResult = platformStatusLabel(platform);
              const scheduleIso = platformSchedules[platform] || null;
              const scheduleLabel = scheduleIso ? formatScheduleLabel(scheduleIso) : null;

              return (
                <li
                  key={platform}
                  className={`ppc-row${active ? " ppc-row--on" : ""}${
                    publishResult ? " ppc-row--published" : ""
                  }`}
                >
                  <PlatformSwitch
                    checked={active}
                    disabled={saving || Boolean(publishResult)}
                    onChange={() => handleToggle(platform)}
                    label={`Publish to ${PLATFORM_LABELS[platform] || platform}`}
                  />
                  <span className="ppc-name">{PLATFORM_LABELS[platform] || platform}</span>
                  <div className="ppc-schedule">
                    {publishResult ? (
                      <span className="ppc-schedule-text ppc-schedule-text--muted">
                        {publishResult}
                      </span>
                    ) : !active ? (
                      <span className="ppc-schedule-text ppc-schedule-text--muted">
                        Off
                      </span>
                    ) : scheduleLabel ? (
                      <span className="ppc-schedule-text">{scheduleLabel}</span>
                    ) : (
                      <span className="ppc-schedule-text ppc-schedule-text--muted">
                        Not scheduled
                      </span>
                    )}
                    {active && !publishResult ? (
                      <button
                        type="button"
                        className="ppc-schedule-btn"
                        disabled={scheduling}
                        onClick={() => openScheduleFor(platform)}
                      >
                        {scheduleLabel ? "Change" : "Set time"}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {noneSelected && connected.length > 0 ? (
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
        onClose={() => {
          if (!scheduling) {
            setScheduleOpen(false);
            setScheduleTarget(null);
          }
        }}
        onConfirm={handleScheduleConfirm}
      />
    </section>
  );
}
