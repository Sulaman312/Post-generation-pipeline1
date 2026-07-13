import { useCallback } from "react";
import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  useSidebarResize,
} from "../../hooks/useSidebarResize";
import { formatWorkspaceLabel } from "../../utils/formatWorkspaceLabel";
import WorkspaceLogo from "../workspace/WorkspaceLogo";
import { IconChevronLeft, IconChevronRight, IconLogout } from "./sidebar/sidebarIcons";
import { ClientNavSection } from "./sidebar/sidebarNav";
import { RunNavSection } from "./sidebar/RunNavSection";

export default function AppSidebar({
  client,
  runId,
  collapsed = false,
  sidebarWidth = 380,
  onSidebarWidthChange,
  onToggleCollapse,
  activeStepKey,
  onSelectStep,
  onGoHome,
  onLogout,
  authUsername = "",
  onClearRun,
  workspaceView = "overview",
  onWorkspaceViewChange,
  onGoToEditorial,
  onGoToMatrix,
  onGoToSocialBoard,
  onGoToSocialMatrix,
  onGoToPostStatus,
  onGoToArtifacts,
  activePipeline = null,
  lockedPipeline = null,
  logoVersion = 0,
  onPatchStepStatus,
  stepStatusOverrides = {},
  run = null,
  onRefreshRun,
}) {
  const handleWidthChange = useCallback(
    (w) => onSidebarWidthChange?.(w),
    [onSidebarWidthChange]
  );
  const onResizePointerDown = useSidebarResize({
    enabled: !collapsed && Boolean(onSidebarWidthChange),
    width: sidebarWidth,
    onWidthChange: handleWidthChange,
    min: SIDEBAR_WIDTH_MIN,
    max: SIDEBAR_WIDTH_MAX,
  });

  if (!client) return null;

  const workspaceTitle = formatWorkspaceLabel(client);

  return (
    <aside className={`sb${collapsed ? " sb--collapsed" : ""}`}>
      <div className="sb-brand">
        <button
          type="button"
          className="sb-brand-main sb-brand-home-btn"
          onClick={onGoHome}
          title="All workspaces"
          aria-label={`All workspaces — ${workspaceTitle}`}
        >
          <div className="sb-brand-logo-wrap">
            <WorkspaceLogo
              clientId={client}
              size={40}
              className="sb-brand-logo"
              cacheKey={logoVersion}
              displayName={workspaceTitle}
            />
          </div>
          {!collapsed ? (
            <div className="sb-brand-text">
              <span className="sb-brand-kicker">Workspace</span>
              <span className="sb-brand-name sb-brand-name--workspace">
                {workspaceTitle}
              </span>
            </div>
          ) : null}
        </button>
        <button
          type="button"
          className="sb-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      <div className="sb-scroll">
        {!runId ? (
          <ClientNavSection
            client={client}
            collapsed={collapsed}
            workspaceView={workspaceView}
            activePipeline={activePipeline}
            lockedPipeline={lockedPipeline}
            onGoToEditorial={onGoToEditorial}
            onGoToMatrix={onGoToMatrix}
            onGoToSocialBoard={onGoToSocialBoard}
            onGoToSocialMatrix={onGoToSocialMatrix}
            onGoToPostStatus={onGoToPostStatus}
            onGoToArtifacts={onGoToArtifacts}
          />
        ) : (
          <RunNavSection
            client={client}
            runId={runId}
            collapsed={collapsed}
            activeStepKey={activeStepKey}
            onSelectStep={onSelectStep}
            onClearRun={onClearRun}
            onGoToMatrix={onGoToMatrix}
            onGoToSocialMatrix={onGoToSocialMatrix}
            onPatchStepStatus={onPatchStepStatus}
            statusOverrides={stepStatusOverrides}
            run={run}
            onRefreshRun={onRefreshRun}
          />
        )}
      </div>

      <div className="sb-foot">
        {!collapsed && authUsername ? (
          <div className="sb-foot-card">
            <div className="sb-foot-profile">
              <div className="sb-foot-avatar" aria-hidden="true">
                {authUsername.charAt(0).toUpperCase()}
              </div>
              <div className="sb-foot-profile-text">
                <span className="sb-foot-user">{authUsername}</span>
              </div>
            </div>
            <button
              type="button"
              className="sb-foot-logout-btn"
              onClick={onLogout}
              title={`Log out ${authUsername}`}
              aria-label={`Log out ${authUsername}`}
            >
              <IconLogout />
              <span className="sb-foot-logout-label">Logout</span>
            </button>
          </div>
        ) : collapsed && !runId ? (
          <span className="sb-foot-expand-hint" title="Expand sidebar" aria-hidden>
            ···
          </span>
        ) : null}
      </div>

      {!collapsed && onSidebarWidthChange ? (
        <div
          className="sb-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize sidebar"
          onPointerDown={onResizePointerDown}
        />
      ) : null}
    </aside>
  );
}
