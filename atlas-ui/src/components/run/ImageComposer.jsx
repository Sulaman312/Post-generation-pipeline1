import { useCallback, useEffect, useRef, useState } from "react";
import { pipelineStepLabel } from "../../constants/pipelineContract";
import * as api from "../../services/api";
import ComposerCanvas from "./imageComposer/ComposerCanvas";
import ComposerControls from "./imageComposer/ComposerControls";
import { IconLayers, IconSave, IconSparkle } from "./imageComposer/composerIcons";
import {
  DEFAULT_LOGO,
  DEFAULT_TEXT,
  applyTextBackgroundMeta,
  buildOverlayPayload,
} from "./imageComposer/overlayUtils";
import "./ImageComposer.css";

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
      toast?.("Overlay saved. Run Brand template to export with your logo & text.", {
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
              Place logo and headline on the image, then save before running{" "}
              <strong>{pipelineStepLabel("image_template")}</strong>.
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

        <ComposerControls
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          logoAvailable={logoAvailable}
          showLogo={showLogo}
          setShowLogo={setShowLogo}
          logoOpacity={logoOpacity}
          setLogoOpacity={setLogoOpacity}
          showText={showText}
          setShowText={setShowText}
          textContent={textContent}
          setTextContent={setTextContent}
          fontFamily={fontFamily}
          setFontFamily={setFontFamily}
          fontSize={fontSize}
          setFontSize={setFontSize}
          fontColor={fontColor}
          setFontColor={setFontColor}
          fontBold={fontBold}
          setFontBold={setFontBold}
          textAlign={textAlign}
          setTextAlign={setTextAlign}
          textBgEnabled={textBgEnabled}
          setTextBgEnabled={setTextBgEnabled}
          textBgColor={textBgColor}
          setTextBgColor={setTextBgColor}
          textBgOpacity={textBgOpacity}
          setTextBgOpacity={setTextBgOpacity}
        />
      </div>
    </div>
  );
}
