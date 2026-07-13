import "./ImageSkeleton.css";

/** Facebook-style shimmer placeholder while images load. */
export default function ImageSkeleton({ variant = "media", className = "" }) {
  return (
    <span
      className={`image-skeleton image-skeleton--${variant} ${className}`.trim()}
      aria-hidden
    >
      <span className="image-skeleton__shimmer" />
    </span>
  );
}
