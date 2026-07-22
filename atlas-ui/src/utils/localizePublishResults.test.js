import { localizePublishResultsMarkdown } from "./localizePublishResults";

function tFr(key) {
  const fr = {
    "publish.resultsHeading": "Résultats de publication :",
    "publish.statusLabel": "Statut",
    "publish.posted": "Publié",
    "publish.failed": "Échoué",
    "publish.postIdLabel": "Id du post",
    "publish.errorLabel": "Erreur",
    "publish.skippedNotSelected": "Ignoré — non sélectionné",
    "publish.skippedNotConnected": "Ignoré — non connecté",
  };
  return fr[key] ?? key;
}

describe("localizePublishResultsMarkdown", () => {
  it("localizes labels and keeps post id values", () => {
    const md = [
      "Publish results:",
      "",
      "## Facebook",
      "- Status: Posted",
      "- Post id: 1133562339847461_122101782825386852",
      "",
    ].join("\n");

    const out = localizePublishResultsMarkdown(md, tFr);
    expect(out).toContain("Résultats de publication :");
    expect(out).toContain("## Facebook");
    expect(out).toContain("- Statut: Publié");
    expect(out).toContain("- Id du post: 1133562339847461_122101782825386852");
  });

  it("localizes skipped and error lines without changing error body", () => {
    const md = [
      "Publish results:",
      "",
      "## LinkedIn",
      "- Status: Skipped — not connected",
      "",
      "## Instagram",
      "- Status: Failed",
      "- Error: billing_hard_limit_reached",
      "",
    ].join("\n");

    const out = localizePublishResultsMarkdown(md, tFr);
    expect(out).toContain("- Statut: Ignoré — non connecté");
    expect(out).toContain("- Statut: Échoué");
    expect(out).toContain("- Erreur: billing_hard_limit_reached");
  });
});
