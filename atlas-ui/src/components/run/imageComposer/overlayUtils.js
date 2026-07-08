export const DISPLAY_MAX_PX = 480;

export const DEFAULT_TEXT = {
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

export const DEFAULT_LOGO = {
  x: 0.03,
  y: 0.03,
  width: 0.18,
  opacity: 0.95,
};

export function markRole(obj, role) {
  if (obj) obj.overlayRole = role;
}

export function hexToRgba(hex, alpha) {
  let h = String(hex || "#000000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function fabricTextBackground(enabled, color, opacity) {
  if (!enabled) return "";
  return hexToRgba(color, opacity);
}

export function applyTextBackgroundMeta(textObj, cfg) {
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

export function findByRole(canvas, role) {
  return canvas.getObjects().find((o) => o.overlayRole === role);
}

export function buildOverlayPayload(canvas, primaryImage, dims) {
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

export function fitCanvasDisplay(canvas, imgW, imgH, hostEl) {
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
