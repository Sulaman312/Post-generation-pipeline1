import { request } from "./http";

export async function listContextFiles(clientId) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/context-files`
  );
  return data.files ?? [];
}

export async function getContextFile(clientId, filename) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/context-files/${encodeURIComponent(
      filename
    )}`
  );
}

export async function saveContextFile(clientId, filename, content) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/context-files/${encodeURIComponent(
      filename
    )}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }
  );
}

export async function getContextFilesCatalog() {
  const data = await request("/context-files/catalog");
  return Array.isArray(data.files) ? data.files : [];
}
