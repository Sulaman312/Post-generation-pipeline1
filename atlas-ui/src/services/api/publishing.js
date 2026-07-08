import { request } from "./http";

export async function publishRunPlatforms(clientId, runId, platforms = null) {
  const body = platforms ? { platforms } : {};
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(runId)}/publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function getPublishSettings() {
  return request("/publishing/settings");
}

export async function setPublishEnv(env) {
  return request("/publishing/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ env }),
  });
}

export async function getConnectedPlatforms() {
  try {
    const data = await request("/publishing/connected-platforms");
    return data.platforms ?? [];
  } catch (e) {
    const msg = e?.message || String(e);
    if (!msg.includes("(404)")) throw e;
    const health = await request("/health");
    return health.connected_platforms ?? [];
  }
}
