import { parseBlocks } from "./markdownBlocks";

const SECTION_KEYS = {
  "primary intent": "primaryIntent",
  "post format": "postFormat",
  "short angle statement": "shortAngle",
  "short angle": "shortAngle",
  "alternative angles": "alternatives",
  alternatives: "alternatives",
};

function normalizeLabel(raw) {
  return String(raw || "")
    .replace(/^#+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/:$/, "")
    .trim()
    .toLowerCase();
}

function sectionKeyForLabel(label) {
  const n = normalizeLabel(label);
  return SECTION_KEYS[n] || null;
}

/**
 * Parse content angle & intent artifact into display fields.
 * Handles ## headings, **Bold labels**, and --- separators from model output.
 */
export function parseContentAngleIntent(text) {
  if (!String(text || "").trim()) return null;

  const blocks = parseBlocks(text);
  const out = {
    primaryIntent: "",
    postFormat: "",
    shortAngle: "",
    alternatives: [],
  };

  let current = null;

  for (const block of blocks) {
    if (block.type === "hr") continue;

    if (block.type === "heading") {
      current = sectionKeyForLabel(block.text);
      continue;
    }

    if (block.type === "p") {
      const boldOnly = block.text.match(/^\*\*([^*]+)\*\*\s*$/);
      if (boldOnly) {
        current = sectionKeyForLabel(boldOnly[1]);
        continue;
      }
      const inline = block.text.match(/^\*\*([^*]+)\*\*\s*:?\s*(.+)$/s);
      if (inline) {
        const key = sectionKeyForLabel(inline[1]);
        const val = inline[2].trim();
        if (key === "alternatives") {
          if (val) out.alternatives.push(val);
        } else if (key && val) {
          out[key] = val;
        }
        continue;
      }
      if (current === "alternatives") {
        const t = block.text.trim();
        if (t) out.alternatives.push(t);
      } else if (current) {
        const t = block.text.trim();
        if (!t) continue;
        out[current] = out[current] ? `${out[current]}\n${t}` : t;
      }
      continue;
    }

    if (block.type === "ul" || block.type === "ol") {
      current = "alternatives";
      for (const item of block.items) {
        const t = String(item || "").trim();
        if (t) out.alternatives.push(t);
      }
    }
  }

  const hasContent =
    Boolean(out.primaryIntent?.trim()) ||
    Boolean(out.postFormat?.trim()) ||
    Boolean(out.shortAngle?.trim()) ||
    out.alternatives.length > 0;

  return hasContent ? out : null;
}

export function isContentAngleFormat(text) {
  return Boolean(parseContentAngleIntent(text));
}
