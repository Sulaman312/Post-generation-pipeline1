/**
 * Compact page title row — navigation lives in the sidebar / back button.
 */
import LanguageToggle from "./LanguageToggle";

export default function PageHeader({
  title,
  subtitle,
  actions,
  back,
  onBack,
  backLabel,
  showLanguage = true,
}) {
  const hasActions = Boolean(actions) || showLanguage;

  return (
    <header className="page-head">
      <div className="page-head-main">
        {back ? (
          <button
            type="button"
            className="page-head-back"
            onClick={onBack}
            aria-label={backLabel || "Back"}
          >
            ←
          </button>
        ) : null}
        <div className="page-head-text">
          <h1 className="page-head-title">{title}</h1>
          {subtitle ? (
            <p className="page-head-subtitle">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {hasActions ? (
        <div className="page-head-actions">
          {actions}
          {showLanguage ? (
            <LanguageToggle compact className="page-head-lang" />
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
