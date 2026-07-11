import { useEffect, useState } from "react";
import { fetchAuthenticatedBlobUrl, getAuthToken, releaseAuthenticatedBlobUrl } from "../../services/api/http";

function apiIsCrossOrigin() {
  if (typeof window === "undefined") return false;
  const base = (process.env.REACT_APP_API_URL || "").trim();
  if (!base) return false;
  try {
    return new URL(base.replace(/\/$/, "")).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Image for API URLs that require login.
 * Fast path: native <img> (session cookie on same-origin deploys like Koyeb).
 * Fallback: authenticated blob fetch (local dev UI on :3001 → API on :8001).
 */
export default function AuthImage({
  src,
  alt = "",
  className = "",
  loading = "lazy",
  onFailed,
  ...props
}) {
  const [blobSrc, setBlobSrc] = useState(null);
  const [useBlob, setUseBlob] = useState(
    () => apiIsCrossOrigin() && Boolean(getAuthToken())
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!useBlob || !src) {
      setBlobSrc(null);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setFailed(false);
      setBlobSrc(null);
      try {
        const url = await fetchAuthenticatedBlobUrl(src);
        if (!cancelled) setBlobSrc(url);
      } catch {
        if (!cancelled) {
          setBlobSrc(null);
          setFailed(true);
          onFailed?.();
        }
      }
    })();

    return () => {
      cancelled = true;
      if (src) releaseAuthenticatedBlobUrl(src);
    };
  }, [src, useBlob, onFailed]);

  if (!src || failed) return null;

  if (useBlob) {
    if (!blobSrc) return null;
    return (
      <img
        src={blobSrc}
        alt={alt}
        className={className}
        loading={loading}
        {...props}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setUseBlob(true)}
      {...props}
    />
  );
}
