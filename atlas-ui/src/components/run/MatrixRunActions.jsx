import { useState } from "react";

/**
 * Run actions — panel (edit toolbar) or compact dropdown menu items.
 */
export default function MatrixRunActions({
  articleTopic = "",
  itemNoun = "article",
  showTopic = true,
  showRestore = false,
  disabled = false,
  variant = "panel",
  onArchive,
  onDelete,
}) {
  const [busy, setBusy] = useState(false);

  async function runAction(action) {
    if (disabled || busy) return;
    setBusy(true);
    try {
      if (action === "archive") {
        await onArchive?.();
      } else if (action === "delete") {
        await onDelete?.();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  const noun = String(itemNoun || "article").trim() || "article";
  const topicLabel = articleTopic?.trim() || `Untitled ${noun}`;
  const archiveLabel = showRestore ? `Restore ${noun}` : `Archive ${noun}`;
  const deleteLabel = `Delete ${noun}`;

  if (variant === "menu") {
    return (
      <>
        <div className="matrix-input-menu-divider" role="separator" />
        <button
          type="button"
          className="matrix-input-menu-item"
          disabled={disabled || busy}
          onClick={() => runAction("archive")}
        >
          {archiveLabel}
        </button>
        <button
          type="button"
          className="matrix-input-menu-item matrix-input-menu-item--danger"
          disabled={disabled || busy}
          onClick={() => runAction("delete")}
        >
          {deleteLabel}
        </button>
      </>
    );
  }

  return (
    <div className="matrix-action-panel">
      {showTopic ? (
        <p className="matrix-action-topic" title={topicLabel}>
          {topicLabel}
        </p>
      ) : null}
      <div className="matrix-action-buttons" role="group" aria-label={`Actions for ${topicLabel}`}>
        <button
          type="button"
          className="matrix-action-btn"
          disabled={disabled || busy}
          onClick={() => runAction("archive")}
        >
          {showRestore ? `Restore ${noun}` : `Archive ${noun}`}
        </button>
        <button
          type="button"
          className="matrix-action-btn matrix-action-btn--danger"
          disabled={disabled || busy}
          onClick={() => runAction("delete")}
        >
          Delete {noun}
        </button>
      </div>
    </div>
  );
}
