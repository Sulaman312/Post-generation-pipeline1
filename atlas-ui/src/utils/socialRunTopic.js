/** Display + title helpers for social runs (post idea paragraph). */

const LIST_PREFIX = /^[\s]*(?:[-•*●▪]|\d+[.)])\s*/;

/** Strip outline bullets so titles match what users typed. */
export function cleanTopicLine(line) {
  let s = String(line || "").trim();
  if (!s) return "";
  for (let i = 0; i < 3; i += 1) {
    const next = s.replace(LIST_PREFIX, "").trim();
    if (next === s) break;
    s = next;
  }
  if (/^\.\s+\S/.test(s)) {
    s = s.slice(2).trim();
  }
  return s;
}

function nonEmptyLines(text) {
  return String(text || "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Post idea paragraph only (not additional details). */
export function socialPostParagraph(manual) {
  if (!manual || typeof manual !== "object") return "";
  return String(manual.paragraph || "").trim();
}

export function socialAdditionalDetails(manual) {
  if (!manual || typeof manual !== "object") return "";
  return String(manual.additional_details || "").trim();
}

/** @deprecated Use socialPostParagraph — kept for search/tooltips */
export function socialPostIdeaText(manual) {
  return socialPostParagraph(manual);
}

/** Short label for matrix / sidebar (best line from manual, else cleaned stored topic). */
export function socialRunTitle(manual, storedTopic = "") {
  const para = String(manual?.paragraph || "").trim();
  if (para) {
    for (const line of nonEmptyLines(para)) {
      const cleaned = cleanTopicLine(line);
      if (cleaned.length >= 3) return cleaned.slice(0, 500);
    }
  }
  const details = String(manual?.additional_details || "").trim();
  if (details) {
    for (const line of nonEmptyLines(details)) {
      const cleaned = cleanTopicLine(line);
      if (cleaned.length >= 3) return cleaned.slice(0, 500);
    }
  }
  const fallback = cleanTopicLine(storedTopic);
  return fallback || "(untitled)";
}

export function isSocialPipeline(pipelineId) {
  return pipelineId === "social_media";
}

/** Short single-line label for run header chrome. */
export function socialRunChromeLabel(manual, storedTopic = "") {
  return socialRunTitle(manual, storedTopic);
}

/**
 * Light structure for read-only post idea display (checklist lines, headings).
 * @returns {{ type: 'blank'|'title'|'subhead'|'check'|'line', text: string }[]}
 */
export function parseSocialPostBlocks(text) {
  const lines = String(text || "").split(/\n/);
  const blocks = [];
  let seenContent = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      blocks.push({ type: "blank", text: "" });
      continue;
    }
    if (/^✓/.test(t)) {
      blocks.push({ type: "check", text: t });
      seenContent = true;
      continue;
    }
    if (
      /^(checklist post|then:)/i.test(t) ||
      (/:\s*$/.test(t) && t.length < 72)
    ) {
      blocks.push({ type: "subhead", text: t });
      seenContent = true;
      continue;
    }
    if (!seenContent) {
      blocks.push({ type: "title", text: cleanTopicLine(t) || t });
      seenContent = true;
      continue;
    }
    blocks.push({ type: "line", text: raw });
    seenContent = true;
  }
  return blocks;
}
