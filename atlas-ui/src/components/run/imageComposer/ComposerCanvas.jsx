import { useEffect, useRef } from "react";
import { Canvas, FabricImage, Textbox } from "fabric";
import * as api from "../../../services/api";
import {
  DEFAULT_LOGO,
  DEFAULT_TEXT,
  applyTextBackgroundMeta,
  fitCanvasDisplay,
  markRole,
} from "./overlayUtils";

/** Fabric owns the DOM inside `hostRef` — React must not render children there. */
export default function ComposerCanvas({
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
