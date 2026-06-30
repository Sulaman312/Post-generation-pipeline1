import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, FabricImage, Textbox } from "fabric";
import * as api from "../../services/api";
import { FONT_GROUPS } from "../../constants/overlayFonts";
import "./ImageComposer.css";

const DISPLAY_MAX_PX = 480;

function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" strokeLinejoin="round" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" strokeLinejoin="round" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" strokeLinecap="round" />
      <circle cx="8" cy="8" r="2.25" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 2.5h7l3 3V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M6 2.5V6h4V2.5M6 11.5h4" strokeLinecap="round" />
    </svg>
  );
}

function IconAlignLeft() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2.5 3.5h11M2.5 8h7M2.5 12.5h9" strokeLinecap="round" />
    </svg>
  );
}

function IconAlignCenter() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2.5 3.5h11M4.5 8h7M3.5 12.5h9" strokeLinecap="round" />
    </svg>
  );
}

function IconAlignRight() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2.5 3.5h11M6.5 8h7M5.5 12.5h9" strokeLinecap="round" />
    </svg>
  );
}

const ALIGN_ICONS = {
  left: IconAlignLeft,
  center: IconAlignCenter,
  right: IconAlignRight,
};

const DEFAULT_TEXT = {
  content: "Your headline",
  x: 0.05,
  y: 0.78,
  width: 0.9,
  fontSize: 52,
  fontFamily: "Arial",
  fill: "#ffffff",
  fontWeight: "bold",
  textAlign: "center",
  backgroundEnabled: false,
  backgroundColor: "#000000",
  backgroundOpacity: 0.65,
};

const DEFAULT_LOGO = {
  x: 0.03,
  y: 0.03,
  width: 0.18,
  opacity: 0.95,
};

function markRole(obj, role) {
  if (obj) obj.overlayRole = role;
}

function hexToRgba(hex, alpha) {
  let h = String(hex || "#000000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function fabricTextBackground(enabled, color, opacity) {
  if (!enabled) return "";
  return hexToRgba(color, opacity);
}

function applyTextBackgroundMeta(textObj, cfg) {
  const enabled = Boolean(cfg.backgroundEnabled);
  const color = cfg.backgroundColor || "#000000";
  const opacity = cfg.backgroundOpacity ?? 0.65;
  textObj.set({
    overlayBackgroundEnabled: enabled,
    overlayBackgroundColor: color,
    overlayBackgroundOpacity: opacity,
    backgroundColor: fabricTextBackground(enabled, color, opacity),
  });
}

function findByRole(canvas, role) {
  return canvas.getObjects().find((o) => o.overlayRole === role);
}

function buildOverlayPayload(canvas, primaryImage, dims) {
  const W = dims.w;
  const H = dims.h;
  const logoObj = findByRole(canvas, "logo");
  const textObj = findByRole(canvas, "text");

  const payload = {
    version: 1,
    primary_image: primaryImage,
    source_width: W,
    source_height: H,
    logo: { visible: false },
    text: { visible: false, content: "" },
  };

  if (logoObj && logoObj.visible !== false) {
    const br = logoObj.getBoundingRect(false, true);
    payload.logo = {
      visible: true,
      x: br.left / W,
      y: br.top / H,
      width: br.width / W,
      opacity: logoObj.opacity ?? 1,
    };
  }

  if (textObj && textObj.visible !== false && (textObj.text || "").trim()) {
    const scaleX = textObj.scaleX || 1;
    payload.text = {
      visible: true,
      content: textObj.text || "",
      x: (textObj.left || 0) / W,
      y: (textObj.top || 0) / H,
      width: Math.max(0.05, ((textObj.width || 200) * scaleX) / W),
      fontSize: textObj.fontSize || 48,
      fontFamily: textObj.fontFamily || "Arial",
      fill: textObj.fill || "#ffffff",
      fontWeight: textObj.fontWeight || "bold",
      textAlign: textObj.textAlign || "left",
      backgroundEnabled: Boolean(textObj.overlayBackgroundEnabled),
      backgroundColor: textObj.overlayBackgroundColor || "#000000",
      backgroundOpacity: textObj.overlayBackgroundOpacity ?? 0.65,
    };
  }

  return payload;
}

function fitCanvasDisplay(canvas, imgW, imgH, hostEl) {
  const scale = DISPLAY_MAX_PX / Math.max(imgW, imgH, 1);
  const displayW = Math.round(imgW * scale);
  const displayH = Math.round(imgH * scale);

  canvas.setDimensions({ width: imgW, height: imgH });
  canvas.setViewportTransform([scale, 0, 0, scale, 0, 0]);

  const container = canvas.getElement()?.parentElement;
  if (container) {
    container.style.width = `${displayW}px`;
    container.style.height = `${displayH}px`;
    container.style.maxWidth = "100%";
  }
  if (hostEl) {
    hostEl.style.width = `${displayW}px`;
    hostEl.style.height = `${displayH}px`;
  }
  const wrap = hostEl?.closest(".image-composer-canvas-wrap");
  if (wrap) {
    wrap.style.width = `${displayW}px`;
    wrap.style.height = `${displayH}px`;
  }

  return { displayW, displayH, scale };
}

/** Fabric owns the DOM inside `hostRef` — React must not render children there. */
function ComposerCanvas({
  client,
  runId,
  primaryImage,
  onReady,
  onLogoAvailable,
  onError,
}) {
  const hostRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onLogoRef = useRef(onLogoAvailable);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onLogoRef.current = onLogoAvailable;
  onErrorRef.current = onError;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !primaryImage) return;

    let disposed = false;
    let canvas = null;

    host.replaceChildren();
    const canvasEl = document.createElement("canvas");
    host.appendChild(canvasEl);

    async function init() {
      canvas = new Canvas(canvasEl, {
        width: 1024,
        height: 1024,
        backgroundColor: "#000000",
        preserveObjectStacking: true,
      });

      const bgUrl = api.generatedImageUrl(client, runId, primaryImage);
      const bg = await FabricImage.fromURL(bgUrl, { crossOrigin: "anonymous" });
      if (disposed) return;

      const imgW = Math.max(1, Math.round(bg.width || 1024));
      const imgH = Math.max(1, Math.round(bg.height || 1024));
      const dims = { w: imgW, h: imgH };

      canvas.setDimensions({ width: imgW, height: imgH });
      bg.set({
        left: 0,
        top: 0,
        scaleX: 1,
        scaleY: 1,
        originX: "left",
        originY: "top",
        selectable: false,
        evented: false,
      });
      markRole(bg, "background");
      canvas.add(bg);
      canvas.sendObjectToBack(bg);

      let saved = null;
      try {
        saved = await api.getImageOverlay(client, runId);
      } catch {
        saved = null;
      }

      const logoCfg = saved?.logo || {};
      const textCfg = saved?.text || {};
      const useLogo = logoCfg.visible !== false;
      const useText = textCfg.visible !== false;

      let logoObj = null;
      try {
        const logoUrl = api.clientLogoUrl(client);
        logoObj = await FabricImage.fromURL(logoUrl, { crossOrigin: "anonymous" });
        if (disposed) return;
        const lw = logoCfg.width ?? DEFAULT_LOGO.width;
        logoObj.scaleToWidth(imgW * lw);
        logoObj.set({
          left: imgW * (logoCfg.x ?? DEFAULT_LOGO.x),
          top: imgH * (logoCfg.y ?? DEFAULT_LOGO.y),
          opacity: logoCfg.opacity ?? DEFAULT_LOGO.opacity,
          visible: useLogo,
          hasControls: true,
          cornerStyle: "circle",
        });
        markRole(logoObj, "logo");
        canvas.add(logoObj);
        onLogoRef.current?.(true);
      } catch {
        onLogoRef.current?.(false);
      }

      const text = new Textbox(textCfg.content || DEFAULT_TEXT.content, {
        left: imgW * (textCfg.x ?? DEFAULT_TEXT.x),
        top: imgH * (textCfg.y ?? DEFAULT_TEXT.y),
        width: imgW * (textCfg.width ?? DEFAULT_TEXT.width),
        fontSize: textCfg.fontSize ?? DEFAULT_TEXT.fontSize,
        fill: textCfg.fill ?? DEFAULT_TEXT.fill,
        fontFamily: textCfg.fontFamily ?? DEFAULT_TEXT.fontFamily,
        fontWeight: textCfg.fontWeight ?? DEFAULT_TEXT.fontWeight,
        textAlign: textCfg.textAlign ?? DEFAULT_TEXT.textAlign,
        visible: useText,
        editable: true,
        splitByGrapheme: false,
      });
      markRole(text, "text");
      applyTextBackgroundMeta(text, {
        backgroundEnabled: textCfg.backgroundEnabled,
        backgroundColor: textCfg.backgroundColor,
        backgroundOpacity: textCfg.backgroundOpacity,
      });
      canvas.add(text);

      fitCanvasDisplay(canvas, imgW, imgH, hostRef.current);
      canvas.renderAll();

      if (!disposed) {
        onReadyRef.current?.({ canvas, dims, logoObj, textObj: text });
      }
    }

    init().catch((err) => {
      if (!disposed) onErrorRef.current?.(err);
    });

    return () => {
      disposed = true;
      try {
        canvas?.dispose();
      } catch {
        /* Fabric may already be torn down */
      }
      const wrap = hostRef.current?.closest(".image-composer-canvas-wrap");
      if (wrap) {
        wrap.style.width = "";
        wrap.style.height = "";
      }
      host.replaceChildren();
    };
  }, [client, runId, primaryImage]);

  return <div ref={hostRef} className="image-composer-canvas-host" />;
}

export default function ImageComposer({ client, runId, primaryImage, toast }) {
  const fabricRef = useRef(null);
  const dimsRef = useRef({ w: 1024, h: 1024 });
  const logoRef = useRef(null);
  const textRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [logoAvailable, setLogoAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [showLogo, setShowLogo] = useState(true);
  const [showText, setShowText] = useState(true);
  const [textContent, setTextContent] = useState(DEFAULT_TEXT.content);
  const [fontFamily, setFontFamily] = useState(DEFAULT_TEXT.fontFamily);
  const [fontSize, setFontSize] = useState(DEFAULT_TEXT.fontSize);
  const [fontColor, setFontColor] = useState(DEFAULT_TEXT.fill);
  const [fontBold, setFontBold] = useState(true);
  const [textAlign, setTextAlign] = useState(DEFAULT_TEXT.textAlign);
  const [logoOpacity, setLogoOpacity] = useState(DEFAULT_LOGO.opacity);
  const [textBgEnabled, setTextBgEnabled] = useState(DEFAULT_TEXT.backgroundEnabled);
  const [textBgColor, setTextBgColor] = useState(DEFAULT_TEXT.backgroundColor);
  const [textBgOpacity, setTextBgOpacity] = useState(DEFAULT_TEXT.backgroundOpacity);
  const [activeTab, setActiveTab] = useState("text");

  const handleCanvasReady = useCallback(
    ({ canvas, dims, logoObj, textObj }) => {
      fabricRef.current = canvas;
      dimsRef.current = dims;
      logoRef.current = logoObj;
      textRef.current = textObj;

      if (textObj) {
        setTextContent(textObj.text || DEFAULT_TEXT.content);
        setFontFamily(textObj.fontFamily || "Arial");
        setFontSize(Math.round(textObj.fontSize || 48));
        setFontColor(typeof textObj.fill === "string" ? textObj.fill : "#ffffff");
        setFontBold(String(textObj.fontWeight || "").toLowerCase() === "bold");
        setTextAlign(textObj.textAlign || "left");
        setShowText(textObj.visible !== false);
        setTextBgEnabled(Boolean(textObj.overlayBackgroundEnabled));
        setTextBgColor(textObj.overlayBackgroundColor || "#000000");
        setTextBgOpacity(textObj.overlayBackgroundOpacity ?? 0.65);
      }
      if (logoObj) {
        setLogoOpacity(logoObj.opacity ?? 1);
        setShowLogo(logoObj.visible !== false);
      }
      setReady(true);
    },
    []
  );

  const handleCanvasError = useCallback(
    (err) => {
      setReady(false);
      toast?.(err?.message || String(err), { variant: "error", duration: 9000 });
    },
    [toast]
  );

  useEffect(() => {
    setReady(false);
    fabricRef.current = null;
    logoRef.current = null;
    textRef.current = null;
  }, [primaryImage]);

  useEffect(() => {
    const textObj = textRef.current;
    const canvas = fabricRef.current;
    if (!textObj || !canvas || !ready) return;
    textObj.set({
      text: textContent,
      fontFamily,
      fontSize,
      fill: fontColor,
      fontWeight: fontBold ? "bold" : "normal",
      textAlign,
      visible: showText,
    });
    applyTextBackgroundMeta(textObj, {
      backgroundEnabled: textBgEnabled,
      backgroundColor: textBgColor,
      backgroundOpacity: textBgOpacity,
    });
    canvas.requestRenderAll();
  }, [
    textContent,
    fontFamily,
    fontSize,
    fontColor,
    fontBold,
    textAlign,
    showText,
    textBgEnabled,
    textBgColor,
    textBgOpacity,
    ready,
  ]);

  useEffect(() => {
    const logoObj = logoRef.current;
    const canvas = fabricRef.current;
    if (!logoObj || !canvas || !ready) return;
    logoObj.set({ opacity: logoOpacity, visible: showLogo });
    canvas.requestRenderAll();
  }, [logoOpacity, showLogo, ready]);

  async function handleSave() {
    const canvas = fabricRef.current;
    if (!canvas || saving) return;
    setSaving(true);
    try {
      const overlay = buildOverlayPayload(canvas, primaryImage, dimsRef.current);
      await api.saveImageOverlay(client, runId, overlay);
      toast?.("Overlay saved. Run Step 6 (Resize & formats) to export with your logo & text.", {
        variant: "success",
        duration: 5000,
      });
    } catch (err) {
      toast?.(err?.message || String(err), { variant: "error", duration: 9000 });
    } finally {
      setSaving(false);
    }
  }

  async function handleSuggestText() {
    if (suggesting) return;
    setSuggesting(true);
    try {
      const suggested = await api.suggestOverlayText(client, runId);
      if (suggested) {
        setTextContent(suggested);
        toast?.("AI headline applied — drag to position.", {
          variant: "success",
          duration: 3000,
        });
      }
    } catch (err) {
      toast?.(err?.message || String(err), { variant: "error", duration: 9000 });
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="image-composer">
      <div className="image-composer-header">
        <div className="image-composer-heading">
          <div className="image-composer-icon" aria-hidden>
            <IconLayers />
          </div>
          <div>
            <h3 className="image-composer-title">Compose image</h3>
            <p className="image-composer-desc">
              Place logo and headline on the image, then save before running Step 6.
            </p>
          </div>
        </div>
        <div className="image-composer-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm image-composer-btn-icon"
            onClick={handleSuggestText}
            disabled={!ready || suggesting}
          >
            <IconSparkle />
            {suggesting ? "Suggesting…" : "AI suggest text"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm image-composer-btn-icon"
            onClick={handleSave}
            disabled={!ready || saving}
          >
            <IconSave />
            {saving ? "Saving…" : "Save overlay"}
          </button>
        </div>
      </div>

      <div className="image-composer-body">
        <div className="image-composer-preview">
          <div className="image-composer-canvas-wrap">
            <div
              className={`image-composer-loading${ready ? " image-composer-loading--hidden" : ""}`}
              aria-hidden={ready}
            >
              <span className="spinner" /> Loading composer…
            </div>
            <ComposerCanvas
              key={primaryImage}
              client={client}
              runId={runId}
              primaryImage={primaryImage}
              onReady={handleCanvasReady}
              onLogoAvailable={setLogoAvailable}
              onError={handleCanvasError}
            />
          </div>
        </div>

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
      </div>
    </div>
  );
}
