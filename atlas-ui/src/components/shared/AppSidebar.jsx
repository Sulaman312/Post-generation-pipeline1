import { useCallback } from "react";
import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  useSidebarResize,
} from "../../hooks/useSidebarResize";
import { useLocale } from "../../context/LocaleContext";
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
  const { t } = useLocale();
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
          title={t("nav.allWorkspaces")}
          aria-label={`${t("nav.allWorkspaces")} — ${workspaceTitle}`}
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
              <span className="sb-brand-kicker">{t("nav.workspace")}</span>
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
          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
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
              title={t("nav.logoutUser", { name: authUsername })}
              aria-label={t("nav.logoutUser", { name: authUsername })}
            >
              <IconLogout />
              <span className="sb-foot-logout-label">{t("nav.logout")}</span>
            </button>
          </div>
        ) : collapsed && !runId ? (
          <span className="sb-foot-expand-hint" title={t("sidebar.expand")} aria-hidden>
            ···
          </span>
        ) : null}
      </div>

      {!collapsed && onSidebarWidthChange ? (
        <div
          className="sb-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("sidebar.resize")}
          title={t("sidebar.resizeHint")}
          onPointerDown={onResizePointerDown}
        />
      ) : null}
    </aside>
  );
}
