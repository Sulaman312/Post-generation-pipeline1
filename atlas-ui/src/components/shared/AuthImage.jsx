import { useEffect, useState } from "react";
import { useInView } from "../../hooks/useInView";
import { fetchAuthenticatedBlobUrl, getAuthToken, releaseAuthenticatedBlobUrl } from "../../services/api/http";
import ImageSkeleton from "./ImageSkeleton";
import "./ImageSkeleton.css";

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
 * Authenticated image with Facebook-style skeleton → fade-in loading.
 * placeholder: "media" (4:5 feed), "thumb" (square), "none"
 */
export default function AuthImage({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  loading = "lazy",
  placeholder = "media",
  onFailed,
  onLoad,
  ...props
}) {
  const lazy = loading === "lazy";
  const { ref: visibilityRef, inView } = useInView({
    rootMargin: "160px 0px",
    disabled: !lazy || !src,
  });
  const shouldLoad = !lazy || inView;

  const [blobSrc, setBlobSrc] = useState(null);
  const [useBlob, setUseBlob] = useState(
    () => apiIsCrossOrigin() && Boolean(getAuthToken())
  );
  const [failed, setFailed] = useState(false);
  const [decoded, setDecoded] = useState(false);

  useEffect(() => {
    setDecoded(false);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!shouldLoad || !useBlob || !src) {
      setBlobSrc(null);
      return undefined;
    }

    let cancelled = false;

    (async () => {
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
  }, [src, useBlob, onFailed, shouldLoad]);

  const handleDecode = () => {
    setDecoded(true);
    onLoad?.();
  };

  const handleNativeError = () => {
    setDecoded(false);
    setUseBlob(true);
  };

  if (!src || failed) return null;

  const showPlaceholder = placeholder !== "none";
  const resolvedSrc = useBlob ? blobSrc : src;
  const waitingForSrc = shouldLoad && (!resolvedSrc || (useBlob && !blobSrc));
  const showSkeleton = showPlaceholder && (!decoded || waitingForSrc || !shouldLoad);
  const shellClass = [
    "auth-image",
    placeholder === "media" ? "auth-image--media" : "",
    decoded ? "auth-image--loaded" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const imgClass = [
    "auth-image__img",
    decoded ? "auth-image__img--loaded" : "",
    imgClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span ref={visibilityRef} className={shellClass}>
      {showSkeleton ? <ImageSkeleton variant={placeholder === "thumb" ? "thumb" : "media"} /> : null}
      {shouldLoad && resolvedSrc ? (
        <img
          src={resolvedSrc}
          alt={alt}
          className={imgClass}
          loading={loading}
          onLoad={handleDecode}
          onError={useBlob ? () => {
            setFailed(true);
            onFailed?.();
          } : handleNativeError}
          {...props}
        />
      ) : null}
    </span>
  );
}
