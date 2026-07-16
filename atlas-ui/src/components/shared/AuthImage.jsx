import { useEffect, useRef, useState } from "react";
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
 * keepPrevious: when src changes, keep showing the last good image until the
 * next one is ready (avoids grey flash when switching brand template views).
 */
export default function AuthImage({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  loading = "lazy",
  placeholder = "media",
  keepPrevious = false,
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
  // Prefer authenticated blob fetch whenever we have a session token so image
  // GETs send Authorization (native <img> only sends cookies). On same-origin
  // Koyeb deploys this avoids permanent grey skeletons when cookies are missing
  // or stripped by the proxy.
  const [useBlob, setUseBlob] = useState(
    () => Boolean(getAuthToken()) || apiIsCrossOrigin()
  );
  const [failed, setFailed] = useState(false);
  const [decoded, setDecoded] = useState(false);
  const heldRequestUrlRef = useRef(null);
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;

  useEffect(() => {
    setFailed(false);
    if (!keepPrevious) {
      setDecoded(false);
    }
  }, [src, keepPrevious]);

  useEffect(() => {
    if (!shouldLoad || !useBlob || !src) {
      if (!keepPrevious) setBlobSrc(null);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      if (!keepPrevious) setBlobSrc(null);
      try {
        const url = await fetchAuthenticatedBlobUrl(src);
        if (cancelled) {
          releaseAuthenticatedBlobUrl(src);
          return;
        }
        const previousRequest = heldRequestUrlRef.current;
        heldRequestUrlRef.current = src;
        setBlobSrc(url);
        if (previousRequest && previousRequest !== src) {
          releaseAuthenticatedBlobUrl(previousRequest);
        }
      } catch {
        if (!cancelled) {
          if (!keepPrevious || !heldRequestUrlRef.current) {
            setBlobSrc(null);
            setFailed(true);
            onFailedRef.current?.();
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      if (!keepPrevious && src) releaseAuthenticatedBlobUrl(src);
    };
  }, [src, useBlob, shouldLoad, keepPrevious]);

  useEffect(() => {
    return () => {
      if (heldRequestUrlRef.current) {
        releaseAuthenticatedBlobUrl(heldRequestUrlRef.current);
        heldRequestUrlRef.current = null;
      }
    };
  }, []);

  const handleDecode = () => {
    setDecoded(true);
    onLoad?.();
  };

  const handleNativeError = () => {
    if (!keepPrevious) setDecoded(false);
    setUseBlob(true);
  };

  if (!src) return null;

  const showPlaceholder = placeholder !== "none";
  const incomingSrc = useBlob ? blobSrc : src;
  const resolvedSrc = incomingSrc;
  const holdingPrevious = Boolean(keepPrevious && resolvedSrc && !decoded);
  const waitingForSrc = shouldLoad && !resolvedSrc;
  const showSkeleton =
    showPlaceholder &&
    !holdingPrevious &&
    (!decoded || waitingForSrc || !shouldLoad);

  if (failed && !resolvedSrc) {
    return (
      <span ref={visibilityRef} className={`auth-image auth-image--failed ${className}`.trim()}>
        <ImageSkeleton variant={placeholder === "thumb" ? "thumb" : "media"} />
      </span>
    );
  }

  const shellClass = [
    "auth-image",
    placeholder === "media" ? "auth-image--media" : "",
    decoded || holdingPrevious ? "auth-image--loaded" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const imgClass = [
    "auth-image__img",
    decoded || holdingPrevious ? "auth-image__img--loaded" : "",
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
            if (!keepPrevious || !resolvedSrc) {
              setFailed(true);
              onFailedRef.current?.();
            }
          } : handleNativeError}
          {...props}
        />
      ) : null}
    </span>
  );
}
