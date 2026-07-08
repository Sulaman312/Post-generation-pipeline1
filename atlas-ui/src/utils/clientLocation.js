/** Parse marketing location from company context.md (mirrors backend rules). */

const TABLE_HEADER = /^(field|fields|detail|details|value|values|---|—)$/i;

function cleanCell(text) {
  return String(text || "")
    .replace(/^\*\*|\*\*$/g, "")
    .trim();
}

function isLocationLabel(label) {
  const norm = cleanCell(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!norm || TABLE_HEADER.test(norm)) return false;
  if (norm === "location" || norm === "service area" || norm === "city region") {
    return true;
  }
  return norm.startsWith("location ") || norm.startsWith("location city region");
}

export function parseLocationFromContext(markdown) {
  const text = String(markdown || "").trim();
  if (!text) return "";

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
      const value = cleanCell(cells[1]);
      if (value && !TABLE_HEADER.test(value)) return value;
    }
  }

  const plain = text.match(
    /^\s*(?:[-*•]\s*)?(?:\*\*)?Location(?:\s*\([^)]*\))?(?:\*\*)?\s*:\s*(.+?)\s*$/im
  );
  return plain ? cleanCell(plain[1]) : "";
}

export function locationFromContextResponse(data) {
  const fromApi = String(data?.location ?? "").trim();
  if (fromApi) {
    return { location: fromApi, hasLocation: true };
  }
  const parsed = parseLocationFromContext(data?.content);
  return { location: parsed, hasLocation: Boolean(parsed) };
}
