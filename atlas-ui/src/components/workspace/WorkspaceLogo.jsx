import { useEffect, useState } from "react";
import { clientLogoUrl } from "../../services/api";
import { getAuthToken } from "../../services/api/http";
import { formatWorkspaceLabel } from "../../utils/formatWorkspaceLabel";
import LogoFitImage from "./LogoFitImage";
import "./WorkspaceLogo.css";

export default function WorkspaceLogo({
  clientId,
  size = 40,
  className = "",
  cacheKey = 0,
  displayName = "",
}) {
  const [failed, setFailed] = useState(false);
  const [blobSrc, setBlobSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  const label = (displayName || "").trim() || formatWorkspaceLabel(clientId);
  const px = typeof size === "number" ? size : 40;

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    async function loadLogo() {
      setLoading(true);
      setFailed(false);
      setBlobSrc(null);

      const base = clientLogoUrl(clientId);
      const url =
        cacheKey != null && cacheKey !== 0
          ? `${base}?v=${encodeURIComponent(String(cacheKey))}`
          : base;

      try {
        const token = getAuthToken();
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("logo unavailable");
        const blob = await res.blob();
        if (!blob.size) throw new Error("empty logo");
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setBlobSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLogo();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [clientId, cacheKey]);

  if (loading && !blobSrc && !failed) {
    return (
      <div
        className={`ws-logo ws-logo--fallback ws-logo--loading ${className}`.trim()}
        style={{ width: px, height: px }}
        aria-hidden
      />
    );
  }

  if (failed || !blobSrc) {
    return (
      <div
        className={`ws-logo ws-logo--fallback ws-logo--text ${className}`.trim()}
        style={{ width: px, height: px }}
        title={label}
        aria-label={label}
      >
        <span className="ws-logo-text">{label}</span>
      </div>
    );
  }

  return (
    <LogoFitImage
      src={blobSrc}
      size={px}
      className={className}
      title={label}
      onError={() => setFailed(true)}
    />
  );
}
