/** Shared HTTP client configuration and request helper. */

const DEFAULT_BASE = "";

const envUrlRaw =
  typeof process !== "undefined"
    ? (process.env.REACT_APP_API_URL || "").trim()
    : "";

function resolveApiBase() {
  if (envUrlRaw) return envUrlRaw.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8001";
  }
  return DEFAULT_BASE;
}

export const BASE = resolveApiBase();
export const DEV_FLASK_ORIGIN = BASE;

export const REQUEST_TIMEOUT_MS = 30000;
/** Pipeline LLM steps can take several minutes. */
export const STEP_REQUEST_TIMEOUT_MS = 900000;
export const STEP_POLL_INTERVAL_MS = 2000;

const AUTH_TOKEN_KEY = "cf_auth_token";

export function getAuthToken() {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    else sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAuthToken() {
  setAuthToken(null);
}

const _blobCache = new Map();
const _blobInflight = new Map();

export async function fetchAuthenticatedBlobUrl(url) {
  const cached = _blobCache.get(url);
  if (cached) {
    cached.refs += 1;
    return cached.objectUrl;
  }

  let pending = _blobInflight.get(url);
  if (!pending) {
    pending = (async () => {
      const token = getAuthToken();
      const res = await fetch(url, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(`Authenticated fetch failed (${res.status})`);
      }
      const blob = await res.blob();
      if (!blob.size) {
        throw new Error("Authenticated fetch returned empty body");
      }
      const objectUrl = URL.createObjectURL(blob);
      _blobCache.set(url, { objectUrl, refs: 0 });
      return objectUrl;
    })().finally(() => {
      _blobInflight.delete(url);
    });
    _blobInflight.set(url, pending);
  }

  const objectUrl = await pending;
  const entry = _blobCache.get(url);
  if (entry) entry.refs += 1;
  return objectUrl;
}

export function releaseAuthenticatedBlobUrl(url) {
  const entry = _blobCache.get(url);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    URL.revokeObjectURL(entry.objectUrl);
    _blobCache.delete(url);
  }
}

function isLocalBrowser() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export function apiUnavailableMessage() {
  if (isLocalBrowser()) {
    return `Could not reach API at ${BASE || "same origin"}. From the repo root run: python main.py — then use the UI at http://localhost:3001`;
  }
  return `The deployed API at ${BASE || "the same origin"} could not be reached. The service may be restarting or temporarily unavailable; check the Koyeb service logs and health status.`;
}

/** Human-readable target (for UI error banners). */
export function describeApiTargetForHumans() {
  return BASE || "same origin";
}

export function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Stopped by user."));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Stopped by user."));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Flask-style `detail` (string | object | ValidationError-ish list). */
function formatDetail(detail) {
  if (detail == null) return null;
  if (typeof detail === "string") return detail.trim() || null;
  if (Array.isArray(detail)) {
    const parts = [];
    for (const item of detail) {
      if (item == null) continue;
      if (typeof item === "string") parts.push(item);
      else if (typeof item?.msg === "string") parts.push(item.msg);
      else parts.push(JSON.stringify(item));
    }
    const joined = parts.filter(Boolean).join("; ").trim();
    return joined || null;
  }
  if (typeof detail === "object" && typeof detail.msg === "string")
    return detail.msg.trim() || null;
  try {
    const s = JSON.stringify(detail);
    return s && s !== "{}" ? s : null;
  } catch {
    return String(detail);
  }
}

export async function request(path, options = {}) {
  const userSignal = options.signal;
  const timeoutMs =
    options.timeoutMs === 0
      ? null
      : options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const { signal: _omitSignal, timeoutMs: _omitTimeout, ...fetchOptions } =
    options;
  const controller = new AbortController();
  const timer =
    timeoutMs == null ? null : setTimeout(() => controller.abort(), timeoutMs);

  function onUserAbort() {
    controller.abort();
  }
  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(timer);
      throw new Error("Stopped by user.");
    }
    userSignal.addEventListener("abort", onUserAbort);
  }

  try {
    const token = getAuthToken();
    const sendCredentials =
      path.startsWith("/auth/login") || path.startsWith("/auth/logout");
    const res = await fetch(`${BASE}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      credentials: sendCredentials ? "include" : "same-origin",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(fetchOptions.headers || {}),
      },
    });
    const bodyText = await res.text().catch(() => "");

    if (!res.ok) {
      const verb = fetchOptions.method || "GET";
      const prefix = `${verb} ${path} failed (${res.status})`;
      let message = `${prefix}`;
      try {
        const t = bodyText.trimStart();
        if (t.startsWith("{")) {
          const parsed = JSON.parse(bodyText);
          const d = formatDetail(parsed.detail);
          if (d) message = d;
          else message = `${prefix}. ${bodyText.slice(0, 400)}`;
        } else message = `${prefix}. ${bodyText.slice(0, 400)}`;
      } catch {
        message = `${prefix}. ${bodyText.slice(0, 400)}`;
      }
      throw new Error(message.trim());
    }
    if (res.status === 204 || bodyText.trim() === "") return null;

    const trimmed = bodyText.trimStart();
    if (trimmed.startsWith("<")) {
      throw new Error(
        `API returned HTML instead of JSON (${path}). Start Flask: python main.py (repo root). ` +
          `Then open ${DEFAULT_BASE}${path} in a tab — you should see JSON. ` +
          `Use the UI at http://localhost:3001 (npm start in atlas-ui), not the API port.`
      );
    }

    try {
      return JSON.parse(bodyText);
    } catch (_) {
      throw new Error(
        `Invalid JSON from ${path} (starts: ${bodyText.slice(0, 96).replace(/\s+/g, " ")}…)`
      );
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      if (userSignal?.aborted) {
        throw new Error("Stopped by user.");
      }
      const secs = (timeoutMs ?? REQUEST_TIMEOUT_MS) / 1000;
      throw new Error(
        `Request timed out (${secs}s). Is Flask listening at ${BASE}? Run from repo root: python main.py`
      );
    }
    const raw = e?.message || String(e);
    if (raw === "Failed to fetch" || e?.name === "TypeError") {
      throw new Error(apiUnavailableMessage());
    }
    throw e;
  } finally {
    if (timer != null) clearTimeout(timer);
    if (userSignal) userSignal.removeEventListener("abort", onUserAbort);
  }
}
