import { useCallback, useEffect, useState } from "react";
import * as api from "../services/api";

/** Poll run manifest while a run view is open; listens for step-complete events. */
export function useRunPolling(client, runId, activeStepKey) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);

  const refreshRun = useCallback(async () => {
    try {
      const r = await api.getRun(client, runId);
      setRun(r);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [client, runId]);

  useEffect(() => {
    refreshRun();
    const id = setInterval(refreshRun, 2000);
    return () => clearInterval(id);
  }, [refreshRun]);

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
