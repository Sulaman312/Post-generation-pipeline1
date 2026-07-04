import Markdown from "../shared/Markdown";
import { PIPELINE_MARKDOWN_CLASS } from "../../constants/markdownPreview";

/**
 * Structured preview when available; otherwise full markdown.
 */
export default function ArtifactFormattedPreview({
  structured = null,
  content = "",
  showFullSource = false,
}) {
  const hasStructured = Boolean(structured);
  const hasContent = Boolean(String(content || "").trim());

  if (!hasStructured && !hasContent) {
    return <div className="empty-state">empty artifact</div>;
  }

  if (!hasStructured) {
    return <Markdown text={content} className={PIPELINE_MARKDOWN_CLASS} />;
  }

  return (
    <div className="artifact-formatted-stack">
      {structured}
      {showFullSource && hasContent ? (
        <section className="artifact-formatted-source" aria-label="Full artifact">
          <div className="artifact-formatted-source-label">Full artifact</div>
          <Markdown text={content} className={PIPELINE_MARKDOWN_CLASS} />
        </section>
      ) : null}
    </div>
  );
}
