import { useCallback } from "react";
import { APP_BRAND_NAME } from "../../constants/brand";
import { stepsForPipeline } from "../../constants/pipelines";
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
          />
        )}
      </div>

      <div className="sb-foot">
        {!collapsed ? (
          <div className="sb-foot-inner">
            <span>{APP_BRAND_NAME} • {stepsForPipeline().length} steps</span>
            {authUsername ? (
              <button
                type="button"
                className="sb-foot-logout"
                onClick={onLogout}
                title={`Log out ${authUsername}`}
                aria-label={`Log out ${authUsername}`}
              >
                <IconLogout />
                Logout
              </button>
            ) : null}
          </div>
        ) : runId ? null : (
          <span className="sb-foot-expand-hint" title="Expand sidebar" aria-hidden>
            ···
          </span>
        )}
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
