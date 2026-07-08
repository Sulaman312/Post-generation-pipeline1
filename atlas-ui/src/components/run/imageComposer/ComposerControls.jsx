import { FONT_GROUPS } from "../../../constants/overlayFonts";
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
  return (
    <div className="image-composer-controls">
      <div className="image-composer-tabs" role="tablist" aria-label="Overlay controls">
        {[
          { id: "logo", label: "Logo" },
          { id: "text", label: "Text" },
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
          <p className="image-composer-note">
            No workspace logo yet. Upload one from the workspace dashboard.
          </p>
        ) : (
          <>
            <label className="image-composer-check">
              <input
                type="checkbox"
                checked={showLogo}
                onChange={(e) => setShowLogo(e.target.checked)}
              />
              Show logo on image
            </label>
            <label className="image-composer-field">
              <span>Opacity</span>
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
            <p className="image-composer-hint">Click and drag the logo on the canvas.</p>
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
          Show text on image
        </label>
        <label className="image-composer-field">
          <span>Headline</span>
          <textarea
            className="textarea"
            rows={2}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
          />
        </label>
        <label className="image-composer-field">
          <span>Font</span>
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
          <span>Size</span>
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
          <span>Color</span>
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
          Bold
        </label>
        <div className="image-composer-subsection">
          <label className="image-composer-check">
            <input
              type="checkbox"
              checked={textBgEnabled}
              onChange={(e) => setTextBgEnabled(e.target.checked)}
            />
            Text background
          </label>
          {textBgEnabled ? (
            <>
              <label className="image-composer-field">
                <span>Background color</span>
                <input
                  type="color"
                  value={textBgColor}
                  onChange={(e) => setTextBgColor(e.target.value)}
                />
              </label>
              <label className="image-composer-field">
                <span>Background opacity</span>
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
          <span>Align</span>
          {["left", "center", "right"].map((a) => {
            const AlignIcon = ALIGN_ICONS[a];
            return (
              <button
                key={a}
                type="button"
                className={`btn btn-sm image-composer-align-btn ${textAlign === a ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTextAlign(a)}
                aria-label={`Align ${a}`}
                title={`Align ${a}`}
              >
                <AlignIcon />
              </button>
            );
          })}
        </div>
        <p className="image-composer-hint">Click the text on the canvas to drag or resize.</p>
      </div>
    </div>
  );
}
