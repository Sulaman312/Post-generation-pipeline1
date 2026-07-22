/** Built-in workspace artifact titles/descriptions (UI chrome only). */
const BUILTIN_ARTIFACT_I18N = {
  "personas.md": {
    title: "artifacts.spec.personas.title",
    desc: "artifacts.spec.personas.desc",
  },
  "context.md": {
    title: "artifacts.spec.context.title",
    desc: "artifacts.spec.context.desc",
  },
  "brand_voice.md": {
    title: "artifacts.spec.brand_voice.title",
    desc: "artifacts.spec.brand_voice.desc",
  },
  "image_style.md": {
    title: "artifacts.spec.image_style.title",
    desc: "artifacts.spec.image_style.desc",
  },
};

/**
 * Localize built-in artifact card chrome. Custom artifacts keep their stored title/description.
 */
export function localizeArtifactSpec(spec, t) {
  if (!spec || typeof t !== "function") return spec;
  if (spec.custom) return spec;
  const keys = BUILTIN_ARTIFACT_I18N[spec.filename];
  if (!keys) return spec;
  return {
    ...spec,
    title: t(keys.title),
    description: t(keys.desc),
  };
}
