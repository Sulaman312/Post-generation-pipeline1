import { request, STEP_REQUEST_TIMEOUT_MS } from "./http";

export async function publishRunPlatforms(clientId, runId, platforms = null) {
  const body = platforms ? { platforms } : {};
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(runId)}/publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Publish to Meta/LinkedIn often exceeds the default 30s client timeout.
      timeoutMs: STEP_REQUEST_TIMEOUT_MS,
    }
  );
}

function withClientQuery(path, clientId) {
  if (!clientId) return path;
  const qs = new URLSearchParams({ client_id: String(clientId) });
  return `${path}?${qs.toString()}`;
}

export async function getPublishSettings(clientId) {
  return request(withClientQuery("/publishing/settings", clientId));
}

export async function setPublishEnv(env, clientId) {
  return request(withClientQuery("/publishing/settings", clientId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ env, client_id: clientId || undefined }),
  });
}

export async function getConnectedPlatforms(clientId) {
  try {
    const data = await request(
      withClientQuery("/publishing/connected-platforms", clientId)
    );
    return data.platforms ?? [];
  } catch (e) {
    const msg = e?.message || String(e);
    if (!msg.includes("(404)")) throw e;
    const health = await request("/health");
    return health.connected_platforms ?? [];
  }
}
