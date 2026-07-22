/**
 * Rewrites English publish-artifact labels for UI locale.
 * Leaves platform names, post ids, and error message bodies unchanged.
 */
export function localizePublishResultsMarkdown(md, t) {
  if (!md || typeof md !== "string" || typeof t !== "function") return md;
  return md
    .replace(/^Publish results:\s*$/m, t("publish.resultsHeading"))
    .replace(
      /^- Status: Posted\s*$/gm,
      `- ${t("publish.statusLabel")}: ${t("publish.posted")}`
    )
    .replace(
      /^- Status: Failed\s*$/gm,
      `- ${t("publish.statusLabel")}: ${t("publish.failed")}`
    )
    .replace(
      /^- Status: Skipped — not selected\s*$/gm,
      `- ${t("publish.statusLabel")}: ${t("publish.skippedNotSelected")}`
    )
    .replace(
      /^- Status: Skipped — not connected\s*$/gm,
      `- ${t("publish.statusLabel")}: ${t("publish.skippedNotConnected")}`
    )
    .replace(/^- Post id:\s*/gm, `- ${t("publish.postIdLabel")}: `)
    .replace(/^- Error:\s*/gm, `- ${t("publish.errorLabel")}: `);
}
