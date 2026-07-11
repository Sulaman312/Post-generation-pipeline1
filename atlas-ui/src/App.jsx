import { useEffect, useState } from "react";
import "./App.css";
import AppSidebar from "./components/shared/AppSidebar";
import ClientsGrid from "./components/workspace/ClientsGrid";
import WorkspaceMain from "./components/workspace/WorkspaceMain";
import { ToastProvider } from "./context/ToastContext";
import { APP_BRAND_NAME, APP_LOGO } from "./constants/brand";
import { appProductMeta } from "./constants/appProject";
import { readStoredSidebarWidth } from "./hooks/useSidebarResize";
import { useWorkspaceNavigation } from "./hooks/useWorkspaceNavigation";

const PRODUCT = appProductMeta();

function App() {
  const [client, setClient] = useState(null);
  const [runId, setRunId] = useState(null);
  const [activeStepKey, setActiveStepKey] = useState("client_profile_topic");
  const [clientsRefresh, setClientsRefresh] = useState(0);
  const [workspaceView, setWorkspaceView] = useState("matrix");
  const [artifactFilename, setArtifactFilename] = useState(null);
  const [logoVersions, setLogoVersions] = useState({});
  const [stepStatusOverrides, setStepStatusOverrides] = useState({});

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
      />
      <main className="layout-main">
        <WorkspaceMain
          client={client}
          runId={runId}
          workspaceView={workspaceView}
          artifactFilename={artifactFilename}
          onArtifactFilenameChange={setArtifactFilename}
          activeStepKey={activeStepKey}
          stepStatusOverrides={stepStatusOverrides}
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
