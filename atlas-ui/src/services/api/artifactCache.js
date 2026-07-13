const _artifactCache = new Map();
const _artifactInflight = new Map();

function artifactCacheKey(clientId, runId, stepName) {
  return `${clientId}|${runId}|${stepName}`;
}

export function readCachedArtifact(clientId, runId, stepName) {
  return _artifactCache.get(artifactCacheKey(clientId, runId, stepName));
}

export function writeCachedArtifact(clientId, runId, stepName, content) {
  _artifactCache.set(artifactCacheKey(clientId, runId, stepName), content ?? "");
}

export function invalidateArtifactCache(clientId, runId, stepName = null) {
  if (!stepName) {
    const prefix = `${clientId}|${runId}|`;
    for (const key of _artifactCache.keys()) {
      if (key.startsWith(prefix)) _artifactCache.delete(key);
    }
    for (const key of _artifactInflight.keys()) {
      if (key.startsWith(prefix)) _artifactInflight.delete(key);
    }
    return;
  }
  const key = artifactCacheKey(clientId, runId, stepName);
  _artifactCache.delete(key);
  _artifactInflight.delete(key);
}

export async function fetchArtifactCached(clientId, runId, stepName, fetcher) {
  const key = artifactCacheKey(clientId, runId, stepName);
  if (_artifactCache.has(key)) {
    return _artifactCache.get(key);
  }
  let pending = _artifactInflight.get(key);
  if (!pending) {
    pending = fetcher().then((content) => {
      _artifactCache.set(key, content ?? "");
      _artifactInflight.delete(key);
      return content ?? "";
    }).catch((error) => {
      _artifactInflight.delete(key);
      throw error;
    });
    _artifactInflight.set(key, pending);
  }
  return pending;
}

if (typeof window !== "undefined") {
  window.addEventListener("cf:run-step-complete", (event) => {
    const detail = event.detail || {};
    if (detail.clientId && detail.runId) {
      invalidateArtifactCache(detail.clientId, detail.runId, detail.stepName || detail.stepKey || null);
    }
  });
}
