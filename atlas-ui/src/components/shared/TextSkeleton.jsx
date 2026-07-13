import "./ImageSkeleton.css";

const WIDTHS = {
  body: ["100%", "100%", "92%", "86%", "64%"],
  title: ["88%", "62%"],
  caption: ["96%", "92%", "78%", "55%"],
  meta: ["48%"],
};

/** Facebook-style shimmer lines while text content loads. */
export default function TextSkeleton({ lines = 3, variant = "body", className = "" }) {
  const preset = WIDTHS[variant] || WIDTHS.body;
  const count = Math.max(1, lines);

  return (
    <div className={`text-skeleton text-skeleton--${variant} ${className}`.trim()} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="text-skeleton__line"
          style={{ width: preset[index % preset.length] }}
        />
      ))}
    </div>
  );
}
