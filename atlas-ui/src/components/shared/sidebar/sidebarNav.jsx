import {
  IconArtifacts,
  IconEditorial,
  IconMatrix,
  IconPostStatus,
} from "./sidebarIcons";
import { useLocale } from "../../../context/LocaleContext";

export function NavItem({
  collapsed,
  icon,
  label,
  active = false,
  accent = false,
  onClick,
}) {
  return (
    <button
      type="button"
      className={[
        "sb-item",
        active ? "active" : "",
        accent ? "sb-item--accent" : "",
        collapsed ? "sb-item--collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span className="sb-item-label">{label}</span>
    </button>
  );
}

export function SidebarSection({ collapsed, title, children, className = "" }) {
  return (
    <div className={`sb-section ${className}`.trim()}>
      {!collapsed ? (
        <div className="sb-section-title">{title}</div>
      ) : null}
      {children}
    </div>
  );
}

export function WorkspaceHomeNav({ collapsed, workspaceView, onGoToArtifacts }) {
  const { t } = useLocale();
  return (
    <SidebarSection collapsed={collapsed} title={t("nav.workspace")}>
      <NavItem
        collapsed={collapsed}
        icon={<IconArtifacts />}
        label={t("nav.artifacts")}
        active={workspaceView === "artifacts"}
        onClick={onGoToArtifacts}
      />
    </SidebarSection>
  );
}

export function ContentPipelineNav({
  collapsed,
  workspaceView,
  activePipeline,
  onGoToEditorial,
  onGoToMatrix,
  onGoToArtifacts,
}) {
  const { t } = useLocale();
  const inContent = activePipeline === "content";

  return (
    <SidebarSection collapsed={collapsed} title={t("nav.contentPipeline")}>
      <NavItem
        collapsed={collapsed}
        icon={<IconEditorial />}
        label={t("nav.newArticle")}
        active={inContent && workspaceView === "overview"}
        onClick={onGoToEditorial}
      />
      <NavItem
        collapsed={collapsed}
        icon={<IconMatrix />}
        label={t("nav.stepMatrix")}
        active={inContent && workspaceView === "matrix"}
        onClick={onGoToMatrix}
      />
      <NavItem
        collapsed={collapsed}
        icon={<IconArtifacts />}
        label={t("nav.artifacts")}
        active={inContent && workspaceView === "artifacts"}
        onClick={onGoToArtifacts}
      />
    </SidebarSection>
  );
}

export function SocialPipelineNav({
  collapsed,
  workspaceView,
  activePipeline,
  onGoToSocialBoard,
  onGoToSocialMatrix,
  onGoToPostStatus,
  onGoToArtifacts,
}) {
  const { t } = useLocale();
  const inSocial = activePipeline === "social";
  return (
    <SidebarSection collapsed={collapsed} title={t("nav.socialPipeline")}>
      <NavItem
        collapsed={collapsed}
        icon={<IconEditorial />}
        label={t("nav.newPost")}
        active={inSocial && workspaceView === "overview"}
        onClick={onGoToSocialBoard}
      />
      <NavItem
        collapsed={collapsed}
        icon={<IconMatrix />}
        label={t("nav.stepMatrix")}
        active={inSocial && workspaceView === "matrix"}
        onClick={onGoToSocialMatrix}
      />
      <NavItem
        collapsed={collapsed}
        icon={<IconPostStatus />}
        label={t("nav.postStatus")}
        active={inSocial && workspaceView === "post_status"}
        onClick={onGoToPostStatus}
      />
      <NavItem
        collapsed={collapsed}
        icon={<IconArtifacts />}
        label={t("nav.artifacts")}
        active={inSocial && workspaceView === "artifacts"}
        onClick={onGoToArtifacts}
      />
    </SidebarSection>
  );
}

export function ClientNavSection({
  collapsed,
  workspaceView,
  activePipeline,
  lockedPipeline = null,
  onGoToEditorial,
  onGoToMatrix,
  onGoToSocialBoard,
  onGoToSocialMatrix,
  onGoToPostStatus,
  onGoToArtifacts,
}) {
  const navPipeline = activePipeline ?? lockedPipeline;

  if (navPipeline === null) {
    return (
      <WorkspaceHomeNav
        collapsed={collapsed}
        workspaceView={workspaceView}
        onGoToArtifacts={onGoToArtifacts}
      />
    );
  }
  if (navPipeline === "social") {
    return (
      <SocialPipelineNav
        collapsed={collapsed}
        workspaceView={workspaceView}
        activePipeline={activePipeline}
        onGoToSocialBoard={onGoToSocialBoard}
        onGoToSocialMatrix={onGoToSocialMatrix}
        onGoToPostStatus={onGoToPostStatus}
        onGoToArtifacts={onGoToArtifacts}
      />
    );
  }
  return (
    <ContentPipelineNav
      collapsed={collapsed}
      workspaceView={workspaceView}
      activePipeline={activePipeline}
      onGoToEditorial={onGoToEditorial}
      onGoToMatrix={onGoToMatrix}
      onGoToArtifacts={onGoToArtifacts}
    />
  );
}
