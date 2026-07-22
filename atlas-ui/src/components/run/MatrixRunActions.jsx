import { useState } from "react";
import { useLocale } from "../../context/LocaleContext";

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
  const { t } = useLocale();
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
  const topicLabel = articleTopic?.trim() || t("matrix.untitled", { noun });
  const archiveLabel = showRestore
    ? t("matrix.restore", { noun })
    : t("matrix.archive", { noun });
  const deleteLabel = t("matrix.delete", { noun });

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
      <div className="matrix-action-buttons" role="group" aria-label={t("matrix.runActions")}>
        <button
          type="button"
          className="matrix-action-btn"
          disabled={disabled || busy}
          onClick={() => runAction("archive")}
        >
          {archiveLabel}
        </button>
        <button
          type="button"
          className="matrix-action-btn matrix-action-btn--danger"
          disabled={disabled || busy}
          onClick={() => runAction("delete")}
        >
          {deleteLabel}
        </button>
      </div>
    </div>
  );
}
