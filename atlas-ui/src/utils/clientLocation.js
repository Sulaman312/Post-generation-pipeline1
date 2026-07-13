/** Parse marketing location from company context.md (mirrors backend rules). */

const TABLE_HEADER = /^(field|fields|detail|details|value|values|---|—)$/i;

const STREET_HINT =
  /\b(route|rue|street|st\.|avenue|ave\.|boulevard|blvd|chemin|impasse|allée|allee|drive|dr\.|lane|ln\.|road|rd\.|highway|hwy|place|pl\.|court|ct\.)\b/i;

const STREET_NUMBER = /(?:^\s*\d{1,5}\s+)|(?:\b\d{1,5}\s*$)|(?:\b\d{4,5}\b)/i;

function cleanCell(text) {
  return String(text || "")
    .replace(/^\*\*|\*\*$/g, "")
    .trim();
}

function isLocationLabel(label) {
  const norm = cleanCell(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!norm || TABLE_HEADER.test(norm)) return false;
  if (
    norm === "location" ||
    norm === "service area" ||
    norm === "city region" ||
    norm === "geographic area" ||
    norm === "areas served" ||
    norm === "region for marketing"
  ) {
    return true;
  }
  return norm.startsWith("location ") || norm.startsWith("location city region");
}

export function looksLikeStreetAddress(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (STREET_HINT.test(s) && STREET_NUMBER.test(s)) return true;
  if (/^\d{1,5}\s+\S/.test(s) && STREET_HINT.test(s)) return true;
  return false;
}

function acceptLocationCandidate(value) {
  const cleaned = cleanCell(value);
  if (!cleaned || TABLE_HEADER.test(cleaned)) return "";
  if (looksLikeStreetAddress(cleaned)) return "";
  return cleaned;
}

export function parseLocationFromContext(markdown) {
  const text = String(markdown || "").trim();
  if (!text) return "";

  const candidates = [];

  for (const line of text.split("\n")) {
    if (!line.includes("|")) continue;
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    if (isLocationLabel(cells[0])) {
      const value = acceptLocationCandidate(cells[1]);
      if (value) candidates.push(value);
    }
  }

  const plain = text.match(
    /^\s*(?:[-*•]\s*)?(?:\*\*)?Location(?:\s*\([^)]*\))?(?:\*\*)?\s*:\s*(.+?)\s*$/im
  );
  if (plain) {
    const value = acceptLocationCandidate(plain[1]);
    if (value) candidates.push(value);
  }

  return candidates[0] || "";
}

export function locationFromContextResponse(data) {
  const fromApi = acceptLocationCandidate(data?.location ?? "");
  if (fromApi) {
    return { location: fromApi, hasLocation: true };
  }
  const parsed = parseLocationFromContext(data?.content);
  return { location: parsed, hasLocation: Boolean(parsed) };
}

export function locationFromApiResponse(data) {
  const location = acceptLocationCandidate(data?.location ?? "");
  const hasLocation =
    typeof data?.has_location === "boolean"
      ? data.has_location && Boolean(location)
      : Boolean(location);
  return { location, hasLocation };
}
