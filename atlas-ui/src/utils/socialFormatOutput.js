export const CANONICAL_FORMAT_PLATFORM = "instagram";
export const SHARED_FORMAT_ASPECT = "1080 / 1350";
export const SHARED_FORMAT_WIDTH = 1080;
export const SHARED_FORMAT_HEIGHT = 1350;
export const SHARED_FORMAT_LABEL = "All channels (1080×1350)";

export function formatDimensionsLabel(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "";
  return `${Math.round(w)}×${Math.round(h)}`;
}
export const PLATFORM_ORDER = ["facebook", "instagram", "linkedin"];
export const FORMAT_EXPORT_POLICY = "contain_blur_v4";
export const CROP_EXPORT_POLICY = "center_crop_v1";
export const TEMPLATE_EXPORT_POLICY = "template_stack_cover_v15";

export function pickCanonicalFormatOutput(outputs) {
  if (!Array.isArray(outputs) || outputs.length === 0) return null;
  const sorted = [...outputs].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.key) - PLATFORM_ORDER.indexOf(b.key)
  );
  return sorted.find((o) => o.key === CANONICAL_FORMAT_PLATFORM) || sorted[0];
}

export function placeholderFormatOutput({ branded = false } = {}) {
  const filename = branded ? "base_ig_1080x1350.png" : "ig_1080x1350.png";
  return {
    key: CANONICAL_FORMAT_PLATFORM,
    label: SHARED_FORMAT_LABEL,
    filename,
    width: 1080,
    height: 1350,
  };
}
