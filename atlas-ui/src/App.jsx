import { useEffect, useState } from "react";
import "./App.css";
import LoginScreen from "./components/auth/LoginScreen";
import AppSidebar from "./components/shared/AppSidebar";
import { IconLogout } from "./components/shared/sidebar/sidebarIcons";
import ClientsGrid from "./components/workspace/ClientsGrid";
import WorkspaceMain from "./components/workspace/WorkspaceMain";
import { ToastProvider } from "./context/ToastContext";
import { APP_BRAND_NAME, APP_LOGO } from "./constants/brand";
import { appProductMeta } from "./constants/appProject";
import { readStoredSidebarWidth } from "./hooks/useSidebarResize";
import { useRunPolling } from "./hooks/useRunPolling";
import { useWorkspaceNavigation } from "./hooks/useWorkspaceNavigation";
import * as api from "./services/api";
import { getAuthToken } from "./services/api/http";

const PRODUCT = appProductMeta();

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [client, setClient] = useState(null);
  const [runId, setRunId] = useState(null);
  const [activeStepKey, setActiveStepKey] = useState("client_profile_topic");
  const [clientsRefresh, setClientsRefresh] = useState(0);
  const [workspaceView, setWorkspaceView] = useState("matrix");
  const [artifactFilename, setArtifactFilename] = useState(null);
  const [logoVersions, setLogoVersions] = useState({});
  const [stepStatusOverrides, setStepStatusOverrides] = useState({});
  const { run, error: runError, refreshRun } = useRunPolling(client, runId, stepStatusOverrides);

  const {
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
  } = useWorkspaceNavigation({
    setClient,
    setRunId,
    setActiveStepKey,
    setWorkspaceView,
    setArtifactFilename,
    setStepStatusOverrides,
    setClientsRefresh,
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("cf-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);

  useEffect(() => {
    try {
      localStorage.setItem(
        "cf-sidebar-collapsed",
        sidebarCollapsed ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (sidebarCollapsed) return;
    try {
      localStorage.setItem("cf-sidebar-width", String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth, sidebarCollapsed]);

  function bumpClientLogo(clientId) {
    setLogoVersions((v) => ({ ...v, [clientId]: Date.now() }));
  }

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      if (!getAuthToken()) {
        if (!cancelled) {
          setAuthUser(null);
          setAuthLoading(false);
        }
        return;
      }
      try {
        const data = await api.getSession();
        if (!cancelled) setAuthUser(data?.user || null);
      } catch {
        if (!cancelled) {
          api.clearAuthToken();
          setAuthUser(null);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await api.logout();
    setAuthUser(null);
    goHome();
  }

  if (authLoading) {
    return (
      <div className="login-screen">
        <div className="empty-state">
          <span className="spinner" /> Checking session…
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen onLoggedIn={setAuthUser} />;
  }

  if (!client) {
    return (
      <div className="layout-flat">
        <header className="topbar">
          <div className="topbar-brand" onClick={goHome}>
            <img
              className="topbar-mark-img"
              src={APP_LOGO}
              alt={APP_BRAND_NAME}
              width={36}
              height={36}
            />
            <div className="topbar-name">
              {PRODUCT.name}
              <span className="topbar-meta">{PRODUCT.workspaceTagline}</span>
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-logout" onClick={handleLogout}>
            <IconLogout />
            <span className="btn-logout-label">Logout</span>
          </button>
        </header>
        <main className="layout-main">
          <ClientsGrid
            key={clientsRefresh}
            onOpenClient={openClient}
            logoVersions={logoVersions}
            onClientLogoSaved={bumpClientLogo}
          />
        </main>
      </div>
    );
  }

  return (
    <div
      className={`layout${sidebarCollapsed ? " layout--sb-collapsed" : ""}`}
      style={
        sidebarCollapsed
          ? undefined
          : { "--sidebar-w": `${sidebarWidth}px` }
      }
    >
      <AppSidebar
        client={client}
        runId={runId}
        collapsed={sidebarCollapsed}
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={setSidebarWidth}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        activeStepKey={activeStepKey}
        onSelectStep={setActiveStepKey}
        onGoHome={goHome}
        onLogout={handleLogout}
        authUsername={authUser?.username}
        onClearRun={closeRun}
        workspaceView={workspaceView}
        onWorkspaceViewChange={handleWorkspaceViewChange}
        onGoToSocialBoard={goToSocialBoard}
        onGoToSocialMatrix={goToSocialMatrix}
        onGoToPostStatus={goToPostStatus}
        onGoToArtifacts={goToArtifacts}
        activePipeline="social"
        lockedPipeline="social"
        logoVersion={logoVersions[client] || 0}
        onPatchStepStatus={patchStepStatus}
        stepStatusOverrides={stepStatusOverrides}
        run={run}
        onRefreshRun={refreshRun}
      />
      <main className="layout-main">
        <WorkspaceMain
          client={client}
          runId={runId}
          run={run}
          runError={runError}
          onRefreshRun={refreshRun}
          workspaceView={workspaceView}
          artifactFilename={artifactFilename}
          onArtifactFilenameChange={setArtifactFilename}
          activeStepKey={activeStepKey}
          stepStatusOverrides={stepStatusOverrides}
          onPatchStepStatus={patchStepStatus}
          onOpenRun={openRun}
          onClientDeleted={handleClientDeleted}
          onSelectStep={setActiveStepKey}
          onBackFromRun={() => {
            closeRun();
            setWorkspaceView("matrix");
          }}
          onBackToBoard={() => setWorkspaceView("overview")}
        />
      </main>
    </div>
  );
}

export default function AppWithToast() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
