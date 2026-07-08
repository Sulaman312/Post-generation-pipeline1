import { useCallback } from "react";
import { stepsForPipeline } from "../../constants/pipelines";
import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  useSidebarResize,
} from "../../hooks/useSidebarResize";
import { formatWorkspaceLabel } from "../../utils/formatWorkspaceLabel";
import WorkspaceLogo from "../workspace/WorkspaceLogo";
import { IconChevronLeft, IconChevronRight } from "./sidebar/sidebarIcons";
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
    <aside
      className={`sb${collapsed ? " sb--collapsed" : ""}`}
      aria-expanded={!collapsed}
    >
      <div className="sb-brand">
        <div className="sb-brand-main">
          <div className="sb-brand-logo-wrap" aria-hidden>
            <WorkspaceLogo
              clientId={client}
              size={40}
              className="sb-brand-logo"
              cacheKey={logoVersion}
            />
          </div>
          {!collapsed ? (
            <div className="sb-brand-text">
              <span className="sb-brand-kicker">Workspace</span>
              <button
                type="button"
                className="sb-brand-name sb-brand-name--workspace sb-brand-name-btn"
                onClick={onGoHome}
                title="All workspaces"
              >
                {workspaceTitle}
              </button>
            </div>
          ) : null}
        </div>
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
          <span>ContentFlow • {stepsForPipeline().length} steps</span>
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
