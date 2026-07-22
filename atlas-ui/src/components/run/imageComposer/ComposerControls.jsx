import { FONT_GROUPS } from "../../../constants/overlayFonts";
import { useLocale } from "../../../context/LocaleContext";
import { ALIGN_ICONS } from "./composerIcons";

export default function ComposerControls({
  activeTab,
  setActiveTab,
  logoAvailable,
  showLogo,
  setShowLogo,
  logoOpacity,
  setLogoOpacity,
  showText,
  setShowText,
  textContent,
  setTextContent,
  fontFamily,
  setFontFamily,
  fontSize,
  setFontSize,
  fontColor,
  setFontColor,
  fontBold,
  setFontBold,
  textAlign,
  setTextAlign,
  textBgEnabled,
  setTextBgEnabled,
  textBgColor,
  setTextBgColor,
  textBgOpacity,
  setTextBgOpacity,
}) {
  const { t } = useLocale();
  const alignLabels = {
    left: t("composer.alignLeft"),
    center: t("composer.alignCenter"),
    right: t("composer.alignRight"),
  };

  return (
    <div className="image-composer-controls">
      <div className="image-composer-tabs" role="tablist" aria-label={t("composer.overlayControls")}>
        {[
          { id: "logo", label: t("composer.tabLogo") },
          { id: "text", label: t("composer.tabText") },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`composer-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`composer-panel-${tab.id}`}
            className={`image-composer-tab${activeTab === tab.id ? " image-composer-tab--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id="composer-panel-logo"
        role="tabpanel"
        aria-labelledby="composer-tab-logo"
        hidden={activeTab !== "logo"}
        className="image-composer-tab-panel"
      >
        {!logoAvailable ? (
          <p className="image-composer-note">{t("composer.noLogo")}</p>
        ) : (
          <>
            <label className="image-composer-check">
              <input
                type="checkbox"
                checked={showLogo}
                onChange={(e) => setShowLogo(e.target.checked)}
              />
              {t("composer.showLogo")}
            </label>
            <label className="image-composer-field">
              <span>{t("composer.opacity")}</span>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={logoOpacity}
                onChange={(e) => setLogoOpacity(parseFloat(e.target.value))}
              />
              <span className="image-composer-field-value">
                {Math.round(logoOpacity * 100)}%
              </span>
            </label>
            <p className="image-composer-hint">{t("composer.hintLogo")}</p>
          </>
        )}
      </div>

      <div
        id="composer-panel-text"
        role="tabpanel"
        aria-labelledby="composer-tab-text"
        hidden={activeTab !== "text"}
        className="image-composer-tab-panel"
      >
        <label className="image-composer-check">
          <input
            type="checkbox"
            checked={showText}
            onChange={(e) => setShowText(e.target.checked)}
          />
          {t("composer.showText")}
        </label>
        <label className="image-composer-field">
          <span>{t("composer.headline")}</span>
          <textarea
            className="textarea"
            rows={2}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
          />
        </label>
        <label className="image-composer-field">
          <span>{t("composer.font")}</span>
          <select
            className="input"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
          >
            {FONT_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.fonts.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="image-composer-field">
          <span>{t("composer.size")}</span>
          <input
            type="range"
            min="18"
            max="120"
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
          />
          <span className="image-composer-field-value">{fontSize}px</span>
        </label>
        <label className="image-composer-field">
          <span>{t("composer.color")}</span>
          <input
            type="color"
            value={fontColor}
            onChange={(e) => setFontColor(e.target.value)}
          />
        </label>
        <label className="image-composer-check">
          <input
            type="checkbox"
            checked={fontBold}
            onChange={(e) => setFontBold(e.target.checked)}
          />
          {t("composer.bold")}
        </label>
        <div className="image-composer-subsection">
          <label className="image-composer-check">
            <input
              type="checkbox"
              checked={textBgEnabled}
              onChange={(e) => setTextBgEnabled(e.target.checked)}
            />
            {t("composer.textBg")}
          </label>
          {textBgEnabled ? (
            <>
              <label className="image-composer-field">
                <span>{t("composer.textBgColor")}</span>
                <input
                  type="color"
                  value={textBgColor}
                  onChange={(e) => setTextBgColor(e.target.value)}
                />
              </label>
              <label className="image-composer-field">
                <span>{t("composer.textBgOpacity")}</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={textBgOpacity}
                  onChange={(e) => setTextBgOpacity(parseFloat(e.target.value))}
                />
              </label>
            </>
          ) : null}
        </div>
        <div className="image-composer-align">
          <span>{t("composer.align")}</span>
          {["left", "center", "right"].map((a) => {
            const AlignIcon = ALIGN_ICONS[a];
            return (
              <button
                key={a}
                type="button"
                className={`btn btn-sm image-composer-align-btn ${textAlign === a ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTextAlign(a)}
                aria-label={alignLabels[a]}
                title={alignLabels[a]}
              >
                <AlignIcon />
              </button>
            );
          })}
        </div>
        <p className="image-composer-hint">{t("composer.hintText")}</p>
      </div>
    </div>
  );
}
