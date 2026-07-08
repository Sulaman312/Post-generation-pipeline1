import { BASE, request } from "./http";
import { getContextFile } from "./context";
import { locationFromContextResponse } from "../../utils/clientLocation";

export function clientLogoUrl(clientId) {
  return `${BASE}/clients/${encodeURIComponent(clientId)}/logo`;
}

export async function getClients() {
  const data = await request("/clients");
  const rows = data.clients ?? [];
  return rows.map((c) => {
    if (typeof c === "string") {
      return { id: c, display_name: c };
    }
    return {
      id: c.id,
      display_name: c.display_name || c.id,
    };
  });
}

export async function createClient(clientId, options = null) {
  const body =
    options && typeof options === "object"
      ? {
          ...(options.display_name
            ? { display_name: options.display_name }
            : {}),
          ...(options.logo_base64 ? { logo_base64: options.logo_base64 } : {}),
          ...(options.logo_filename
            ? { logo_filename: options.logo_filename }
            : {}),
        }
      : {};
  return request(`/clients/${encodeURIComponent(clientId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function uploadClientLogo(clientId, logoBase64, logoFilename) {
  return request(`/clients/${encodeURIComponent(clientId)}/logo`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      logo_base64: logoBase64,
      logo_filename: logoFilename,
    }),
  });
}

export async function updateClientWorkspace(clientId, options = {}) {
  const body = {};
  if (options.display_name != null) {
    body.display_name = options.display_name;
  }
  if (options.logo_base64) {
    body.logo_base64 = options.logo_base64;
    if (options.logo_filename) {
      body.logo_filename = options.logo_filename;
    }
  }
  return request(`/clients/${encodeURIComponent(clientId)}/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteClient(clientId) {
  return request(`/clients/${encodeURIComponent(clientId)}`, {
    method: "DELETE",
  });
}

export async function getClientLocation(clientId) {
  const data = await getContextFile(clientId, "context.md");
  return locationFromContextResponse(data);
}

export async function getContextSummary(clientId) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/context-summary`
  );
  return data.summary ?? "";
}

export async function listWorkspaceArtifacts(clientId) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/workspace-artifacts`
  );
  return data.artifacts ?? [];
}

export async function createWorkspaceArtifact(clientId, payload) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/workspace-artifacts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  return data.artifact;
}

export async function deleteWorkspaceArtifact(clientId, filename) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/workspace-artifacts/${encodeURIComponent(
      filename
    )}`,
    { method: "DELETE" }
  );
}
