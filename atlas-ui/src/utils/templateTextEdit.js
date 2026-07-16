const PLATFORM_ORDER = ["instagram", "facebook", "linkedin"];
const LABEL_TEXT_RE = /^(avant|apr[eè]s|after|before)$/i;
const BADGE_BG_RE = /top-text-bg|text-bg|badge|label-bg/i;

/** Figma often uses U+2028 line separators; show normal newlines in the editor. */
export function displayTemplateText(text) {
  return String(text || "")
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/\r\n/g, "\n");
}

export function storeTemplateText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\u2028");
}

function textLayerEntries(format, { includeHidden = false } = {}) {
  const layers = Array.isArray(format?.layers) ? format.layers : [];
  return layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => {
      if (!layer || layer.kind !== "text") return false;
      if (!includeHidden && layer.visible === false) return false;
      return true;
    });
}

function isLabelText(text) {
  const normalized = displayTemplateText(text).replace(/\s+/g, " ").trim();
  return normalized.length > 0 && normalized.length <= 12 && LABEL_TEXT_RE.test(normalized);
}

function parseHexColor(fill) {
  const raw = String(fill || "#ffffff").trim().replace(/^#/, "");
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.padEnd(6, "0").slice(0, 6);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function coverColorForFill(fill) {
  const { r, g, b } = parseHexColor(fill);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#111111" : "#f5f5f5";
}

export function findPrimaryTextLayer(format, { includeHidden = false } = {}) {
  const entries = textLayerEntries(format, { includeHidden });
  if (!entries.length) return null;
  const body = entries.filter(({ layer }) => !isLabelText(layer.text));
  const pool = body.length ? body : entries;
  return pool.reduce((best, entry) => {
    if (!best) return entry;
    const a = entry.layer;
    const b = best.layer;
    const aSize = Number(a.fontSize || a.font_size || 0);
    const bSize = Number(b.fontSize || b.font_size || 0);
    if (aSize !== bSize) return aSize > bSize ? entry : best;
    const aLen = displayTemplateText(a.text).length;
    const bLen = displayTemplateText(b.text).length;
    return aLen >= bLen ? entry : best;
  }, null);
}

function preferredFormatKey(formats) {
  return PLATFORM_ORDER.find((key) => formats[key]) || Object.keys(formats)[0] || null;
}

function layerBox(layer) {
  return {
    x: Number(layer?.x || 0),
    y: Number(layer?.y || 0),
    w: Math.max(1, Number(layer?.width || 1)),
    h: Math.max(1, Number(layer?.height || 1)),
  };
}

function layerLabel(layer, fallback = "Text") {
  const name = String(layer?.name || "").trim();
  if (!name) return fallback;
  if (/^text$/i.test(name)) return fallback;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function isSingleLineTextLayer(layer) {
  const text = displayTemplateText(layer?.text);
  if (text.includes("\n")) return false;
  const fontSize = Number(layer?.fontSize || layer?.font_size || 24);
  const boxH = Math.max(1, Number(layer?.height || fontSize * 1.35));
  return boxH <= fontSize * 1.55;
}

function overlayFromTextLayer(layer, format, { id, label, removable = false }) {
  const box = layerBox(layer);
  const formatWidth = Math.max(1, Number(format.width || 1080));
  const formatHeight = Math.max(1, Number(format.height || 1350));
  const fill = String(layer.fill || "#ffffff");
  const fontSize = Number(layer.fontSize || layer.font_size || 24);
  return {
    id,
    label,
    text: displayTemplateText(layer.text),
    fill,
    cover: coverColorForFill(fill),
    fontSize,
    fontWeight: String(layer.fontWeight || layer.font_weight || "700"),
    fontFamily: String(layer.fontFamily || "Inter, system-ui, sans-serif"),
    textAlign: String(layer.textAlign || "left"),
    leftPct: (box.x / formatWidth) * 100,
    topPct: (box.y / formatHeight) * 100,
    widthPct: (box.w / formatWidth) * 100,
    heightPct: (box.h / formatHeight) * 100,
    fontSizePct: (fontSize / formatWidth) * 100,
    singleLine: isSingleLineTextLayer(layer),
    removable,
    removed: layer.visible === false,
  };
}

function layerCenter(layer) {
  const box = layerBox(layer);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function isBadgeBackgroundAsset(layer) {
  if (!layer || layer.kind !== "asset") return false;
  const name = `${layer.asset || ""} ${layer.name || ""}`;
  return BADGE_BG_RE.test(name);
}

/** Left-side badge = AVANT, right-side = APRES (Figma imports often mislabel FB/LI). */
export function badgeRoleFromPosition(format, layer) {
  const formatWidth = Math.max(1, Number(format?.width || 1080));
  const midX = layerCenter(layer).x;
  return midX < formatWidth / 2 ? "AVANT" : "APRES";
}

function fieldIdForLayer(format, layer, index, primaryIndex) {
  if (primaryIndex != null && index === primaryIndex) return "headline";
  if (isLabelText(layer.text)) {
    return `label:${badgeRoleFromPosition(format, layer)}`;
  }
  return `text:${index}`;
}

/** Pair badge text with its dark background asset (nearest overlapping top-text-bg). */
export function findBadgeBackgroundIndices(format, textIndex, { includeHidden = true } = {}) {
  const layers = Array.isArray(format?.layers) ? format.layers : [];
  const textLayer = layers[textIndex];
  if (!textLayer) return [];
  const text = layerBox(textLayer);
  const textMid = layerCenter(textLayer);
  const scored = [];

  layers.forEach((layer, index) => {
    if (!isBadgeBackgroundAsset(layer)) return;
    if (!includeHidden && layer.visible === false) return;
    const box = layerBox(layer);
    const overlaps =
      box.x < text.x + text.w &&
      box.x + box.w > text.x &&
      box.y < text.y + text.h &&
      box.y + box.h > text.y;
    const mid = layerCenter(layer);
    const dist = Math.hypot(mid.x - textMid.x, mid.y - textMid.y);
    const maxDist = Math.max(180, text.w * 1.5, text.h * 4, box.w);
    if (overlaps || dist < maxDist) {
      scored.push({ index, dist: overlaps ? dist * 0.2 : dist });
    }
  });

  scored.sort((a, b) => a.dist - b.dist);
  return scored.length ? [scored[0].index] : [];
}

function findBadgeTextIndexForBackground(format, bgIndex, { includeHidden = true } = {}) {
  const layers = Array.isArray(format?.layers) ? format.layers : [];
  const bg = layers[bgIndex];
  if (!bg) return null;
  const bgMid = layerCenter(bg);
  const primary = findPrimaryTextLayer(format, { includeHidden });
  const scored = [];
  textLayerEntries(format, { includeHidden }).forEach(({ layer, index }) => {
    if (primary && index === primary.index) return;
    if (!isLabelText(layer.text) && layer.visible !== false) {
      // still allow short hidden labels
    }
    if (!isLabelText(layer.text)) return;
    const mid = layerCenter(layer);
    const dist = Math.hypot(mid.x - bgMid.x, mid.y - bgMid.y);
    scored.push({ index, dist });
  });
  scored.sort((a, b) => a.dist - b.dist);
  return scored.length ? scored[0].index : null;
}

function setLayerVisible(layers, index, visible) {
  if (index == null || !layers[index]) return;
  layers[index] = { ...layers[index], visible: Boolean(visible) };
}

export function setBadgeVisible(layers, textIndex, visible) {
  setLayerVisible(layers, textIndex, visible);
  for (const bgIndex of findBadgeBackgroundIndices({ layers }, textIndex)) {
    setLayerVisible(layers, bgIndex, visible);
  }
}

function unionBox(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}

function badgeEntriesForFormat(format, { includeHidden = false } = {}) {
  const layers = Array.isArray(format?.layers) ? format.layers : [];
  const primary = findPrimaryTextLayer(format, { includeHidden: true });
  const primaryIndex = primary?.index ?? null;
  const byRole = new Map();

  // Text labels first.
  textLayerEntries(format, { includeHidden: true }).forEach(({ layer, index }) => {
    if (primaryIndex != null && index === primaryIndex) return;
    if (!isLabelText(layer.text)) return;
    const role = badgeRoleFromPosition(format, layer);
    const bgIndices = findBadgeBackgroundIndices(format, index, { includeHidden: true });
    const textBox = layerBox(layer);
    let box = textBox;
    for (const bgIndex of bgIndices) {
      box = unionBox(box, layerBox(layers[bgIndex]));
    }
    const textHidden = layer.visible === false;
    const bgsHidden =
      bgIndices.length === 0 || bgIndices.every((i) => layers[i]?.visible === false);
    const removed = textHidden && bgsHidden;
    if (!includeHidden && removed) return;

    const existing = byRole.get(role);
    if (existing && existing.textIndex != null) return;
    byRole.set(role, {
      role,
      textIndex: index,
      bgIndices,
      box,
      text: displayTemplateText(layer.text) || role,
      fill: String(layer.fill || "#ffffff"),
      fontSize: Number(layer.fontSize || layer.font_size || 24),
      fontWeight: String(layer.fontWeight || layer.font_weight || "700"),
      fontFamily: String(layer.fontFamily || "Inter, system-ui, sans-serif"),
      textAlign: String(layer.textAlign || "left"),
      removed,
    });
  });

  // Orphan badge backgrounds (text already gone / mismatched) stay removable.
  layers.forEach((layer, index) => {
    if (!isBadgeBackgroundAsset(layer)) return;
    const role = badgeRoleFromPosition(format, layer);
    const bgHidden = layer.visible === false;
    if (byRole.has(role)) {
      const entry = byRole.get(role);
      if (!entry.bgIndices.includes(index)) {
        entry.bgIndices = [...entry.bgIndices, index];
        entry.box = unionBox(entry.box, layerBox(layer));
      }
      if (!bgHidden) entry.removed = false;
      return;
    }
    if (!includeHidden && bgHidden) return;
    const pairedText = findBadgeTextIndexForBackground(format, index, { includeHidden: true });
    byRole.set(role, {
      role,
      textIndex: pairedText,
      bgIndices: [index],
      box: layerBox(layer),
      text: role,
      fill: "#f5f5f5",
      fontSize: 24,
      fontWeight: "700",
      fontFamily: "Inter, system-ui, sans-serif",
      textAlign: "left",
      removed: bgHidden,
    });
  });

  return [...byRole.values()].sort((a, b) => a.box.x - b.box.x);
}

/**
 * Editable text overlays for on-canvas editing (Figma-like), positioned in % of the format.
 */
export function extractCanvasTextOverlays(template, platformKey, { includeHidden = false } = {}) {
  const formats = template?.formats && typeof template.formats === "object" ? template.formats : {};
  const key = platformKey && formats[platformKey] ? platformKey : preferredFormatKey(formats);
  if (!key) return [];
  const format = formats[key];
  const formatWidth = Math.max(1, Number(format.width || 1080));
  const formatHeight = Math.max(1, Number(format.height || 1350));
  const primary = findPrimaryTextLayer(format, { includeHidden });
  const primaryIndex = primary?.index ?? null;
  const overlays = [];

  if (primary) {
    const layer = primary.layer;
    overlays.push(
      overlayFromTextLayer(layer, format, {
        id: "headline",
        label: layerLabel(layer, "Design text"),
      })
    );
  }

  for (const badge of badgeEntriesForFormat(format, { includeHidden })) {
    if (!includeHidden && badge.removed) continue;
    overlays.push({
      id: `label:${badge.role}`,
      label: badge.role,
      text: badge.text || badge.role,
      fill: badge.fill,
      cover: coverColorForFill(badge.fill),
      fontSize: badge.fontSize,
      fontWeight: badge.fontWeight,
      fontFamily: badge.fontFamily,
      textAlign: badge.textAlign,
      leftPct: (badge.box.x / formatWidth) * 100,
      topPct: (badge.box.y / formatHeight) * 100,
      widthPct: (badge.box.w / formatWidth) * 100,
      heightPct: (badge.box.h / formatHeight) * 100,
      fontSizePct: (badge.fontSize / formatWidth) * 100,
      singleLine: true,
      removable: true,
      removed: Boolean(badge.removed),
    });
  }

  // Any other non-label text layers (rare).
  const seen = new Set(overlays.map((o) => o.id));
  for (const { layer, index } of textLayerEntries(format, { includeHidden })) {
    if (primaryIndex != null && index === primaryIndex) continue;
    if (isLabelText(layer.text)) continue;
    const id = fieldIdForLayer(format, layer, index, primaryIndex);
    if (seen.has(id)) continue;
    seen.add(id);
    overlays.push(
      overlayFromTextLayer(layer, format, {
        id,
        label: layerLabel(layer, "Text"),
      })
    );
  }

  return overlays;
}

export function extractEditableTemplateFields(template, platformKey) {
  return extractCanvasTextOverlays(template, platformKey, { includeHidden: true }).map((o) => ({
    id: o.id,
    label: o.label,
    hint:
      o.id === "headline"
        ? "Shown on the branded image across Instagram, Facebook, and LinkedIn."
        : "Badge on the design (text + dark bar).",
    text: o.text,
    removable: Boolean(o.removable),
    removed: Boolean(o.removed),
  }));
}

function applyBadgeFieldToFormat(format, layers, field) {
  const role = field.id.slice("label:".length);
  const badges = badgeEntriesForFormat({ ...format, layers }, { includeHidden: true });
  const match = badges.find((b) => b.role === role);
  if (!match) return;

  if (match.textIndex != null && layers[match.textIndex]) {
    layers[match.textIndex] = {
      ...layers[match.textIndex],
      text: storeTemplateText(field.text || role),
    };
  }

  const visible = !field.removed;
  if (match.textIndex != null) {
    setLayerVisible(layers, match.textIndex, visible);
  }
  for (const bgIndex of match.bgIndices) {
    setLayerVisible(layers, bgIndex, visible);
  }

  // Fallback: also run proximity pairing from the text index.
  if (match.textIndex != null) {
    for (const bgIndex of findBadgeBackgroundIndices(
      { layers },
      match.textIndex,
      { includeHidden: true }
    )) {
      setLayerVisible(layers, bgIndex, visible);
    }
  }
}

export function applyEditableFieldsToTemplate(template, fields) {
  const next = {
    ...template,
    formats: { ...(template.formats || {}) },
  };
  const byId = Object.fromEntries((fields || []).map((f) => [f.id, f]));

  for (const [formatKey, format] of Object.entries(next.formats)) {
    if (!format || typeof format !== "object") continue;
    const layers = Array.isArray(format.layers) ? format.layers.map((l) => ({ ...l })) : [];
    const primary = findPrimaryTextLayer({ ...format, layers }, { includeHidden: true });

    if (primary && byId.headline) {
      layers[primary.index] = {
        ...layers[primary.index],
        text: storeTemplateText(byId.headline.text),
        visible: byId.headline.removed ? false : true,
      };
    }

    for (const field of fields || []) {
      if (!field.id.startsWith("label:")) continue;
      applyBadgeFieldToFormat(format, layers, field);
    }

    // Non-label misc text
    const primaryIndex = primary?.index ?? null;
    for (const { layer, index } of textLayerEntries({ ...format, layers }, { includeHidden: true })) {
      if (primaryIndex != null && index === primaryIndex) continue;
      if (isLabelText(layer.text)) continue;
      const id = fieldIdForLayer({ ...format, layers }, layer, index, primaryIndex);
      const field = byId[id];
      if (!field) continue;
      layers[index] = {
        ...layers[index],
        text: storeTemplateText(field.text),
        visible: field.removed ? false : true,
      };
    }

    next.formats[formatKey] = { ...format, layers };
  }

  return next;
}

export function templateTextFieldsDirty(template, textFields, platformKey) {
  if (!template || !textFields?.length) return false;
  const original = extractEditableTemplateFields(template, platformKey);
  if (original.length !== textFields.length) return true;
  return textFields.some((field) => {
    const match = original.find((o) => o.id === field.id);
    if (!match) return true;
    return field.text !== match.text || Boolean(field.removed) !== Boolean(match.removed);
  });
}
