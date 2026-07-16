import { BASE, getAuthToken, request } from "./http";

export function generatedImageUrl(clientId, runId, filename) {
  return `${BASE}/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
    runId
  )}/images/generated/${encodeURIComponent(filename)}`;
}

export function formattedImageUrl(clientId, runId, filename, cacheKey) {
  const base = `${BASE}/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
    runId
  )}/images/formats/${encodeURIComponent(filename)}`;
  if (cacheKey) {
    return `${base}?v=${encodeURIComponent(String(cacheKey))}`;
  }
  return base;
}

export function socialTemplateAssetUrl(clientId, filename, templateId = "social_post") {
  return `${BASE}/clients/${encodeURIComponent(
    clientId
  )}/templates/${encodeURIComponent(templateId || "social_post")}/assets/${encodeURIComponent(
    filename
  )}`;
}

export async function downloadFormattedImage(clientId, runId, filename, cacheKey) {
  const url = `${formattedImageUrl(clientId, runId, filename, cacheKey)}${
    cacheKey ? "&" : "?"
  }download=1`;
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function getFormatsIndex(clientId, runId) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/formats`
  );
}

/** Batch format indexes for Publishing queue lazy loading. */
export async function getFormatsIndexBatch(clientId, runIds) {
  if (!Array.isArray(runIds) || runIds.length === 0) {
    return { runs: {} };
  }
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/image-formats/batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_ids: runIds }),
    }
  );
}

export async function regenerateFormats(clientId, runId, { baseOnly = false } = {}) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/format-exports/regenerate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(baseOnly ? { base_only: true } : {}),
    }
  );
}

export async function listRunImages(clientId, runId) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images`
  );
  return {
    images: Array.isArray(data.images) ? data.images : [],
    selected_primary: data.selected_primary || null,
    image_meta: data.image_meta && typeof data.image_meta === "object" ? data.image_meta : {},
  };
}

/** Style labels and prompts from Step 3 image_prompt.md (progressive Step 4 UI). */
export async function getImageStylePlan(clientId, runId) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/style-plan`
  );
  return {
    styles: Array.isArray(data.styles) ? data.styles : [],
  };
}

export async function regenerateStyleImage(clientId, runId, styleKey) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/regenerate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style_key: styleKey }),
    }
  );
}

export async function selectRunImage(clientId, runId, filename) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/select`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    }
  );
}

export async function deleteRunImage(clientId, runId, filename) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    }
  );
}

export async function uploadRunImage(clientId, runId, imageBase64, { setPrimary = true } = {}) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: imageBase64, set_primary: setPrimary }),
      timeoutMs: 120000,
    }
  );
}

export async function getImageOverlay(clientId, runId) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/overlay`
  );
  return data.overlay || null;
}

export async function listImageTemplates(clientId) {
  const data = await request(`/clients/${encodeURIComponent(clientId)}/templates`);
  return Array.isArray(data.templates) ? data.templates : [];
}

export async function getImageTemplate(clientId, runId, templateId) {
  const q = templateId ? `?template_id=${encodeURIComponent(templateId)}` : "";
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/template${q}`
  );
  return data.template || null;
}

export async function saveImageTemplate(clientId, runId, template) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/template`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template || {}),
    }
  );
  return data.template || null;
}

export async function applyImageTemplate(clientId, runId) {
  return request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/template/apply`,
    {
      method: "POST",
      timeoutMs: 120000,
    }
  );
}

/** Textless branded layout for Figma-like on-canvas text editing. */
export function templateCanvasPreviewUrl(clientId, runId, { platform = "instagram", cacheKey } = {}) {
  const base = `${BASE}/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
    runId
  )}/images/template/canvas-preview?platform=${encodeURIComponent(platform)}&omit_text=1`;
  if (cacheKey) {
    return `${base}&v=${encodeURIComponent(String(cacheKey))}`;
  }
  return base;
}

export async function saveImageOverlay(clientId, runId, overlay) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/overlay`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overlay }),
    }
  );
  return data.overlay;
}

export async function suggestOverlayText(clientId, runId) {
  const data = await request(
    `/clients/${encodeURIComponent(clientId)}/runs/${encodeURIComponent(
      runId
    )}/images/overlay/suggest-text`,
    { method: "POST" }
  );
  return data.text || "";
}
