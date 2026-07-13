import { PLATFORMS } from "../constants/runRecord";

export function sortPlatforms(platforms) {
  return [...platforms].sort((a, b) => PLATFORMS.indexOf(a) - PLATFORMS.indexOf(b));
}

export function platformsEqual(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((platform) => setB.has(platform));
}

export function publishablePlatforms(connected, publishedByPlatform) {
  return connected.filter((platform) => !publishedByPlatform[platform]);
}

export function allPublishablePlatformsSelected(connected, publishedByPlatform, selected) {
  const publishable = publishablePlatforms(connected, publishedByPlatform);
  return (
    publishable.length > 0 &&
    publishable.length === selected.length &&
    publishable.every((platform) => selected.includes(platform))
  );
}

/** Same-schedule checkbox is on when every publishable platform is selected. */
export function deriveSyncSchedules(allSelected, syncOptOut) {
  return allSelected && !syncOptOut;
}

export function platformsFromRecord(recordPlatforms, connected) {
  const allowed = new Set(connected);
  return sortPlatforms((recordPlatforms || []).filter((platform) => allowed.has(platform)));
}

export function selectionInitKey(runId, connected) {
  return `${runId}|${sortPlatforms(connected).join(",")}`;
}

function storageKey(clientId, runId) {
  return `cf:platform-selection:${clientId}:${runId}`;
}

export function readStoredPlatformSelection(clientId, runId) {
  try {
    const raw = sessionStorage.getItem(storageKey(clientId, runId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sortPlatforms(parsed.filter(Boolean)) : null;
  } catch {
    return null;
  }
}

export function writeStoredPlatformSelection(clientId, runId, platforms) {
  try {
    sessionStorage.setItem(
      storageKey(clientId, runId),
      JSON.stringify(sortPlatforms(platforms))
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredPlatformSelection(clientId, runId) {
  try {
    sessionStorage.removeItem(storageKey(clientId, runId));
  } catch {
    /* ignore */
  }
}
