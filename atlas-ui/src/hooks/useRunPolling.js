import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../services/api";
import { platformsEqual } from "../utils/publishPlatformSelection";

/** Poll run manifest while a run view is open; listens for step-complete events. */
export function useRunPolling(client, runId, activeStepKey) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);
  const refreshSequenceRef = useRef(0);
  const platformsOverrideRef = useRef(null);

  const applyRun = useCallback((nextRun) => {
    if (!nextRun || typeof nextRun !== "object") {
      setRun(nextRun);
      return;
    }

    const override = platformsOverrideRef.current;
    if (Array.isArray(override)) {
      const polled = Array.isArray(nextRun.platforms) ? nextRun.platforms : [];
      if (platformsEqual(polled, override)) {
        platformsOverrideRef.current = null;
      } else {
        setRun({ ...nextRun, platforms: override });
        return;
      }
    }

    setRun(nextRun);
  }, []);

  const refreshRun = useCallback(
    async (merge) => {
      if (merge && typeof merge === "object") {
        if (Array.isArray(merge.platforms)) {
          platformsOverrideRef.current = merge.platforms;
        }
        setRun((prev) => (prev ? { ...prev, ...merge } : merge));
        setError(null);
        return;
      }

      const sequence = ++refreshSequenceRef.current;
      try {
        const r = await api.getRun(client, runId);
        if (sequence !== refreshSequenceRef.current) return;
        applyRun(r);
        setError(null);
      } catch (e) {
        if (sequence !== refreshSequenceRef.current) return;
        setError(e?.message || String(e));
      }
    },
    [applyRun, client, runId]
  );

  useEffect(() => {
    refreshSequenceRef.current += 1;
    platformsOverrideRef.current = null;
    setRun(null);
    setError(null);
    refreshRun();
    const id = setInterval(refreshRun, 2000);
    return () => {
      clearInterval(id);
      refreshSequenceRef.current += 1;
      platformsOverrideRef.current = null;
    };
  }, [client, runId, refreshRun]);

  useEffect(() => {
    function onStepComplete(e) {
      const d = e.detail;
      if (d?.clientId !== client || d?.runId !== runId) return;
      refreshRun();
    }
    window.addEventListener("cf:run-step-complete", onStepComplete);
    return () => window.removeEventListener("cf:run-step-complete", onStepComplete);
  }, [client, runId, refreshRun]);

  useEffect(() => {
    refreshRun();
  }, [activeStepKey, refreshRun]);

  return { run, error, refreshRun };
}
