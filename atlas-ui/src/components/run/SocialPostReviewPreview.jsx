import { useCallback, useEffect, useState } from "react";
import * as api from "../../services/api";
import { warmAuthenticatedBlobCacheMany } from "../../services/api/http";
import { useLocale } from "../../context/LocaleContext";
import { useMediaReady } from "../../hooks/useMediaReady";
import AuthImage from "../shared/AuthImage";
import ImageSkeleton from "../shared/ImageSkeleton";
import TextSkeleton from "../shared/TextSkeleton";
import "./ImageGenerationStep.css";

export const PLATFORM_PREVIEW_ORDER = [
  { key: "instagram", title: "Instagram", handlePrefix: "@", tone: "ig" },
  { key: "facebook", title: "Facebook", handlePrefix: "", tone: "fb" },
  { key: "linkedin", title: "LinkedIn", handlePrefix: "", tone: "li" },
];

export const PUBLISH_META_LINE =
  /^\s*(?:[-*•]\s*)?\*{0,2}\s*(?:Suggested\s+(?:location\s+tag|posting\s+time(?:\s+window)?)|(?:Recommended|Best|Ideal)\s+(?:posting\s+)?time(?:\s+to\s+post|\s+window)?|Posting\s+time\s+(?:suggestion|window|recommendation))\s*:.+$/i;

const INLINE_PUBLISH_META =
  /\s*(?:[-*•]\s*)?\*{0,2}\s*(?:Suggested\s+(?:location\s+tag|posting\s+time(?:\s+window)?)|(?:Recommended|Best|Ideal)\s+(?:posting\s+)?time(?:\s+to\s+post|\s+window)?|Posting\s+time\s+(?:suggestion|window|recommendation))\s*:[^\n]*/gi;

function sanitizeCaptionText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => {
      if (PUBLISH_META_LINE.test(line)) return "";
      return line.replace(INLINE_PUBLISH_META, "").trimEnd();
    })
    .filter((line) => line.trim())
    .join("\n")
    .trim();
}

export function parsePlatformCaptions(markdown) {
  const sections = {};
  let current = null;
  for (const rawLine of String(markdown || "").split(/\r?\n/)) {
    const heading = rawLine.match(/^##\s+(Instagram|LinkedIn|Facebook)\s*$/i);
    if (heading) {
      current = heading[1].toLowerCase();
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(rawLine);
  }
  const clean = {};
  for (const [key, lines] of Object.entries(sections)) {
    clean[key] = sanitizeCaptionText(lines.join("\n"));
  }
  return clean;
}

function previewImageUrls(client, runId, outputs, cacheKey) {
  const urls = PLATFORM_PREVIEW_ORDER.map((platform) => {
    const filename = outputs?.[platform.key]?.filename;
    return filename ? api.formattedImageUrl(client, runId, filename, cacheKey) : "";
  }).filter(Boolean);
  const logoUrl = api.clientLogoUrl(client);
  if (logoUrl) urls.unshift(logoUrl);
  return urls;
}

export function clientLabelFromId(client) {
  return String(client || "Client")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function SocialPostReviewPreview({ client, runId, toast, skeletonOnly = false }) {
  const [captions, setCaptions] = useState({});
  const [formats, setFormats] = useState({});
  const [cacheKey, setCacheKey] = useState("");
  const [loading, setLoading] = useState(!skeletonOnly);
  const brand = clientLabelFromId(client);
  const contentPending = skeletonOnly || loading;

  useEffect(() => {
    if (skeletonOnly) return undefined;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [captionMd, idx] = await Promise.all([
          api.getArtifact(client, runId, "captions"),
          api.getFormatsIndex(client, runId),
        ]);
        if (cancelled) return;
        const outputs = idx?.outputs || {};
        const generatedAt = idx?.generated_at || "";
        void warmAuthenticatedBlobCacheMany(
          previewImageUrls(client, runId, outputs, generatedAt)
        );
        setCaptions(parsePlatformCaptions(captionMd));
        setFormats(outputs);
        setCacheKey(generatedAt);
      } catch (e) {
        if (!cancelled) {
          toast?.(e?.message || String(e), { variant: "error", duration: 9000 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [client, runId, toast, skeletonOnly]);

  return (
    <div className="social-review">
      <section className="social-review-platforms" aria-label="Platform feed previews">
        <div className="social-preview-grid">
          {PLATFORM_PREVIEW_ORDER.map((platform) => {
            const info = formats[platform.key] || {};
            const imageUrl = info.filename
              ? api.formattedImageUrl(client, runId, info.filename, cacheKey)
              : "";
            return (
              <div key={platform.key} className="social-preview-column">
                <div className={`social-preview-label social-preview-label--${platform.tone}`}>
                  {platform.title}
                </div>
                <PlatformPostCard
                  platform={platform}
                  brand={brand}
                  client={client}
                  caption={contentPending ? null : captions[platform.key] || ""}
                  imageUrl={imageUrl}
                  contentPending={contentPending}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Avatar({ client, brand, className = "" }) {
  const [failed, setFailed] = useState(false);
  const handleFailed = useCallback(() => setFailed(true), []);
  const initials = brand
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div className={`social-preview-avatar ${className}`}>
      {!failed ? (
        <AuthImage
          src={api.clientLogoUrl(client)}
          alt=""
          placeholder="thumb"
          loading="eager"
          onFailed={handleFailed}
        />
      ) : (
        <span>{initials || "CF"}</span>
      )}
    </div>
  );
}

function PlatformPostCard({
  platform,
  brand,
  client,
  caption,
  imageUrl,
  contentPending = false,
}) {
  const { mediaReady, onMediaLoad } = useMediaReady(imageUrl || "");
  const captionPending = contentPending || (Boolean(imageUrl) && !mediaReady);

  if (platform.tone === "ig") {
    return (
      <article className="social-preview-card social-preview-card--instagram">
        <div className="ig-topbar">
          <Avatar client={client} brand={brand} />
          <div className="ig-identity">
            <strong>{brand.toLowerCase().replace(/\s+/g, "")}</strong>
            <span>Sponsored</span>
          </div>
          <span className="social-preview-more">...</span>
        </div>
        <PreviewImage
          imageUrl={imageUrl}
          alt={`${platform.title} post`}
          pending={contentPending}
          onMediaLoad={onMediaLoad}
        />
        <div className="ig-actions" aria-hidden>
          <span>♡</span><span>💬</span><span>↗</span><span className="ig-save">▱</span>
        </div>
        <div className="ig-likes">Liked by local businesses and others</div>
        <div className="ig-caption">
          <strong>{brand.toLowerCase().replace(/\s+/g, "")}</strong>{" "}
          <CaptionText text={caption} pending={captionPending} />
        </div>
        <div className="ig-meta">View all comments</div>
        <div className="ig-time">JUST NOW</div>
      </article>
    );
  }

  if (platform.tone === "fb") {
    return (
      <article className="social-preview-card social-preview-card--facebook">
        <div className="fb-header">
          <Avatar client={client} brand={brand} />
          <div>
            <strong>{brand}</strong>
            <span>Just now · 🌐</span>
          </div>
          <span className="social-preview-more">...</span>
        </div>
        <div className="fb-caption">
          <CaptionText text={caption} pending={captionPending} />
        </div>
        <PreviewImage
          imageUrl={imageUrl}
          alt={`${platform.title} post`}
          pending={contentPending}
          onMediaLoad={onMediaLoad}
        />
        <div className="fb-social-row"><span>👍 ❤️ 24</span><span>3 comments · 2 shares</span></div>
        <div className="fb-actions"><span>Like</span><span>Comment</span><span>Share</span></div>
      </article>
    );
  }

  return (
    <article className="social-preview-card social-preview-card--linkedin">
      <div className="li-header">
        <Avatar client={client} brand={brand} />
        <div>
          <strong>{brand}</strong>
          <span>Company page · Just now</span>
        </div>
        <button type="button">+ Follow</button>
      </div>
      <div className="li-caption">
        <CaptionText text={caption} pending={captionPending} />
      </div>
      <PreviewImage
        imageUrl={imageUrl}
        alt={`${platform.title} post`}
        pending={contentPending}
        onMediaLoad={onMediaLoad}
      />
      <div className="li-social-row"><span>👍 💡 18</span><span>4 comments · 1 repost</span></div>
      <div className="li-actions"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>
    </article>
  );
}

function CaptionText({ text, pending = false }) {
  const { t } = useLocale();
  if (pending) {
    return <TextSkeleton lines={4} variant="caption" className="social-preview-caption-skeleton" />;
  }
  if (!String(text || "").trim()) {
    return <span className="social-preview-empty">{t("review.noCaption")}</span>;
  }
  return String(text)
    .split(/\n{2,}/)
    .map((block, index) => (
      <span className="social-preview-caption-block" key={index}>
        {block.split(/\n/).map((line, lineIndex) => (
          <span key={lineIndex}>
            {line}
            {lineIndex < block.split(/\n/).length - 1 ? <br /> : null}
          </span>
        ))}
      </span>
    ));
}

function PreviewImage({ imageUrl, alt, pending = false, onMediaLoad }) {
  const { t } = useLocale();
  if (!imageUrl && !pending) {
    return (
      <div className="social-preview-image social-preview-image--empty">
        {t("review.needTemplate")}
      </div>
    );
  }
  return (
    <div className="social-preview-image">
      {imageUrl ? (
        <AuthImage
          src={imageUrl}
          alt={alt}
          loading="eager"
          placeholder="media"
          onLoad={onMediaLoad}
        />
      ) : (
        <ImageSkeleton variant="media" />
      )}
    </div>
  );
}
