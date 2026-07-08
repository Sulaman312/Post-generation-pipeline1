import { useCallback } from "react";

/**
 * Workspace-level navigation handlers (client home, run open/close, view switching).
 * Pure state orchestration — no routing library.
 */
export function useWorkspaceNavigation({
  setClient,
  setRunId,
  setActiveStepKey,
  setWorkspaceView,
  setArtifactFilename,
  setStepStatusOverrides,
  setClientsRefresh,
}) {
  const goHome = useCallback(() => {
    setClient(null);
    setRunId(null);
    setWorkspaceView("matrix");
    setArtifactFilename(null);
  }, [setClient, setRunId, setWorkspaceView, setArtifactFilename]);

  const handleClientDeleted = useCallback(() => {
    goHome();
    setClientsRefresh((n) => n + 1);
  }, [goHome, setClientsRefresh]);

  const openClient = useCallback(
    (c) => {
      setClient(c);
      setRunId(null);
      setWorkspaceView("matrix");
      setArtifactFilename(null);
    },
    [setClient, setRunId, setWorkspaceView, setArtifactFilename]
  );

  const openRun = useCallback(
    (id) => {
      setRunId(id);
      setActiveStepKey("client_profile_topic");
      setStepStatusOverrides({});
    },
    [setRunId, setActiveStepKey, setStepStatusOverrides]
  );

  const patchStepStatus = useCallback(
    (stepKey, status) => {
      if (stepKey == null && status == null) {
        setStepStatusOverrides({});
        return;
      }
      setStepStatusOverrides((prev) => {
        if (status == null) {
          if (!(stepKey in prev)) return prev;
          const next = { ...prev };
          delete next[stepKey];
          return next;
        }
        return { ...prev, [stepKey]: status };
      });
    },
    [setStepStatusOverrides]
  );

  const closeRun = useCallback(() => {
    setRunId(null);
    setStepStatusOverrides({});
    setWorkspaceView("matrix");
  }, [setRunId, setStepStatusOverrides, setWorkspaceView]);

  const handleWorkspaceViewChange = useCallback(
    (view) => {
      setWorkspaceView(view);
      setArtifactFilename(null);
    },
    [setWorkspaceView, setArtifactFilename]
  );

  const goToSocialBoard = useCallback(() => {
    setRunId(null);
    setWorkspaceView("overview");
    setArtifactFilename(null);
  }, [setRunId, setWorkspaceView, setArtifactFilename]);

  const goToSocialMatrix = useCallback(() => {
    setRunId(null);
    setWorkspaceView("matrix");
    setArtifactFilename(null);
  }, [setRunId, setWorkspaceView, setArtifactFilename]);

  const goToPostStatus = useCallback(() => {
    setRunId(null);
    setWorkspaceView("post_status");
    setArtifactFilename(null);
  }, [setRunId, setWorkspaceView, setArtifactFilename]);

  const goToArtifacts = useCallback(() => {
    setRunId(null);
    setWorkspaceView("artifacts");
    setArtifactFilename(null);
  }, [setRunId, setWorkspaceView, setArtifactFilename]);

  return {
    goHome,
    handleClientDeleted,
    openClient,
    openRun,
    patchStepStatus,
    closeRun,
    handleWorkspaceViewChange,
    goToSocialBoard,
    goToSocialMatrix,
    goToPostStatus,
    goToArtifacts,
  };
}
