import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import { PLATFORMS, hasPendingSchedule, isPlatformRetryable, runRecordFromRun, unpublishedSelectedPlatforms } from "../../constants/runRecord";
import { PLATFORM_LABELS } from "../../utils/postPublishStatus";
import {
  allPublishablePlatformsSelected,
  clearStoredPlatformSelection,
  deriveSyncSchedules,
  platformsEqual,
  platformsFromRecord,
  readStoredPlatformSelection,
  selectionInitKey,
  sortPlatforms,
  writeStoredPlatformSelection,
} from "../../utils/publishPlatformSelection";
import SchedulePublishModal, { formatScheduleLabel } from "./SchedulePublishModal";
import PlatformSwitch from "./publish/PlatformSwitch";
import PublishEnvToggle from "./publish/PublishEnvToggle";
import { useLocale } from "../../context/LocaleContext";
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
  const { t } = useLocale();
  const [connected, setConnected] = useState([]);
  const [loadingConnected, setLoadingConnected] = useState(true);
  const [publishEnv, setPublishEnv] = useState("test");
  const [envAvailability, setEnvAvailability] = useState({ test: true, live: false });
  const [switchingEnv, setSwitchingEnv] = useState(false);
  const [selected, setSelected] = useState([]);
  const [syncOptOut, setSyncOptOut] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleEditUnlocked, setScheduleEditUnlocked] = useState(false);
  const selectionInitKeyRef = useRef("");
  const userEditedPlatformsRef = useRef(false);
  const platformSaveInFlightRef = useRef(new Set());
  const selectedRef = useRef([]);
  const prevAllSelectedRef = useRef(false);
  const runScopeRef = useRef("");

  const record = useMemo(() => runRecordFromRun(run), [run]);
  const platformSchedules = useMemo(
    () => record.platform_schedules || {},
    [record.platform_schedules]
  );

  const publishedByPlatform = useMemo(() => {
    const map = {};
    for (const row of record.published_results || []) {
      if (row?.platform) map[row.platform] = row;
    }
    return map;
  }, [record.published_results]);

  const allSelected = useMemo(
    () => allPublishablePlatformsSelected(connected, publishedByPlatform, selected),
    [connected, publishedByPlatform, selected]
  );
  const syncSchedules = deriveSyncSchedules(allSelected, syncOptOut);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

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
          ? t("publish.switchedLive")
          : t("publish.switchedTest"),
        { variant: "success", duration: 3000 }
      );
    } catch (e) {
      toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
    } finally {
      setSwitchingEnv(false);
    }
  }

  useEffect(() => {
    const scope = `${client}|${runId}`;
    if (runScopeRef.current === scope) return;
    runScopeRef.current = scope;
    selectionInitKeyRef.current = "";
    userEditedPlatformsRef.current = false;
    prevAllSelectedRef.current = false;
    clearStoredPlatformSelection(client, runId);
    setSyncOptOut(false);
    setScheduleEditUnlocked(false);
  }, [client, runId]);

  useEffect(() => {
    if (!run || loadingConnected || !connected.length) return;

    const initKey = selectionInitKey(runId, connected);
    if (selectionInitKeyRef.current === initKey) return;

    selectionInitKeyRef.current = initKey;
    const stored = readStoredPlatformSelection(client, runId);
    if (stored) {
      userEditedPlatformsRef.current = true;
      setSelected(platformsFromRecord(stored, connected));
    } else {
      setSelected(platformsFromRecord(record.platforms, connected));
    }
    setSyncOptOut(false);
  }, [client, runId, run, loadingConnected, connected, record.platforms]);

  useEffect(() => {
    if (!prevAllSelectedRef.current && allSelected) {
      setSyncOptOut(false);
    }
    prevAllSelectedRef.current = allSelected;
  }, [allSelected]);

  const applyPlatformSelection = useCallback(
    (platforms) => {
      const normalized = sortPlatforms(platforms);
      userEditedPlatformsRef.current = true;
      writeStoredPlatformSelection(client, runId, normalized);
      setSelected(normalized);
      onRunUpdated?.({ platforms: normalized });
      return normalized;
    },
    [client, runId, onRunUpdated]
  );

  const persistPlatforms = useCallback(
    async (platforms, { trackPlatform = null } = {}) => {
      const normalized = sortPlatforms(platforms);
      const previous = selectedRef.current;
      applyPlatformSelection(normalized);
      if (trackPlatform) {
        platformSaveInFlightRef.current.add(trackPlatform);
      }
      try {
        const updated = await api.updateRunPlatforms(client, runId, normalized);
        writeStoredPlatformSelection(client, runId, normalized);
        onRunUpdated?.({ ...updated, platforms: normalized });
        return updated;
      } catch (e) {
        userEditedPlatformsRef.current = true;
        writeStoredPlatformSelection(client, runId, previous);
        setSelected(previous);
        onRunUpdated?.({ platforms: previous });
        toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
        throw e;
      } finally {
        if (trackPlatform) {
          platformSaveInFlightRef.current.delete(trackPlatform);
        }
      }
    },
    [applyPlatformSelection, client, runId, onRunUpdated, toast]
  );

  const selectAllPublishablePlatforms = useCallback(async () => {
    const allPublishable = connected
      .filter((platform) => !publishedByPlatform[platform])
      .sort((a, b) => PLATFORMS.indexOf(a) - PLATFORMS.indexOf(b));
    if (platformsEqual(allPublishable, selectedRef.current) || allPublishable.length === 0) {
      return;
    }
    await persistPlatforms(allPublishable);
  }, [connected, publishedByPlatform, persistPlatforms]);

  async function handleSyncSchedulesChange(checked) {
    if (!checked) {
      setSyncOptOut(true);
      return;
    }
    setSyncOptOut(false);
    await selectAllPublishablePlatforms();
  }

  async function handleToggle(platform, enabled) {
    if (!connected.includes(platform) || platformSaveInFlightRef.current.has(platform)) {
      return;
    }
    const current = selectedRef.current;
    const next = enabled
      ? sortPlatforms([...new Set([...current, platform])])
      : current.filter((p) => p !== platform);
    if (platformsEqual(next, current)) return;

    try {
      await persistPlatforms(next, { trackPlatform: platform });
    } catch {
      // Error toast and rollback handled in persistPlatforms.
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
          ? t("publish.toPlatform", {
              platform: PLATFORM_LABELS[targets[0]] || targets[0],
            }) + "…"
          : t("publish.started"),
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
      onRunUpdated?.(updated);
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
      return { kind: "published", label: t("publish.published") };
    }
    if (result?.status === "failed") {
      return {
        kind: "retryable",
        label: t("publish.failed"),
        detail: result.error || t("publish.publishFailed"),
      };
    }
    if (result?.status === "skipped") {
      const detail =
        result.error === "not connected"
          ? t("publish.notConnected")
          : result.error;
      return { kind: "retryable", label: t("publish.skipped"), detail };
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
    <section className="publish-platform-controls" aria-label={t("publish.to")}>
      <div className="ppc-head">
        <div className="ppc-head-main">
          <h3 className="ppc-title">{t("publish.to")}</h3>
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
              ? t("publish.lockImmediate")
              : undefined
          }
          onClick={() => handlePublishNow()}
        >
          {publishBusy ? (
            <>
              <span className="spinner spinner-light" /> {t("publish.publishing")}
            </>
          ) : (
            t("publish.now")
          )}
        </button>
      </div>

      {loadingConnected ? (
        <p className="publish-platform-loading">
          <span className="spinner" /> {t("publish.checkingAccounts")}
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
              — add META_LIVE_&lt;WORKSPACE&gt;_* / LINKEDIN_LIVE_&lt;WORKSPACE&gt;_* in{" "}
              <code>.env</code>
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
            <span>{t("publish.sameSchedule")}</span>
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
                    disabled={published}
                    onChange={(enabled) => handleToggle(platform, enabled)}
                    label={t("publish.toPlatform", {
                      platform: PLATFORM_LABELS[platform] || platform,
                    })}
                  />
                  <span className="ppc-name">{PLATFORM_LABELS[platform] || platform}</span>
                  <div className="ppc-schedule">
                    {published ? (
                      <span className="ppc-schedule-text ppc-schedule-text--muted">
                        {rowState.label}
                      </span>
                    ) : !active ? (
                      <span className="ppc-schedule-text ppc-schedule-text--muted">
                        {t("publish.off")}
                      </span>
                    ) : retryable ? (
                      <span className="ppc-schedule-text ppc-schedule-text--warning">
                        {rowState.detail || rowState.label}
                      </span>
                    ) : scheduleLabel ? (
                      <span className="ppc-schedule-text">{scheduleLabel}</span>
                    ) : (
                      <span className="ppc-schedule-text ppc-schedule-text--muted">
                        {t("publish.notScheduled")}
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
                            {t("publish.now")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ppc-schedule-btn"
                          disabled={scheduling}
                          onClick={() => openScheduleFor(platform)}
                        >
                          {scheduleLabel || retryable
                            ? t("publish.reschedule")
                            : t("publish.setTime")}
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
          {t("publish.retryHint")}
        </p>
      ) : publishActionsLocked ? (
        <p className="publish-platform-hint" role="status">
          {t("publish.scheduledHint")}
        </p>
      ) : null}

      {noneSelected && connected.length > 0 && !publishActionsLocked ? (
        <p className="publish-platform-hint" role="status">
          {t("publish.selectPlatformHint")}
        </p>
      ) : null}

      {stepKey === "publish" && publishStepStatus === "done" ? (
        <p className="publish-platform-note">{t("publish.stepDone")}</p>
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
