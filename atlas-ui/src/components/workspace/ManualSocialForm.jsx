import { useState } from "react";
import * as api from "../../services/api";
import { PIPELINE_IDS } from "../../constants/pipelines";
import { socialRunTitle } from "../../utils/socialRunTopic";
import "./ManualArticleForm.css";

const EMPTY = () => ({
  paragraph: "",
  additional_details: "",
});

export default function ManualSocialForm({ client, onOpenRun, onCreated }) {
  const [fields, setFields] = useState(EMPTY);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const paragraph = (fields.paragraph || "").trim();
    if (creating || !paragraph) return;

    const topic = socialRunTitle(
      {
        paragraph,
        additional_details: (fields.additional_details || "").trim(),
      },
      ""
    );
    setCreating(true);
    setError(null);

    try {
      const result = await api.createRun(client, topic, {
        pipeline_id: PIPELINE_IDS.SOCIAL,
        manual_inputs: {
          paragraph,
          additional_details: (fields.additional_details || "").trim(),
        },
      });
      const newId = result?.run_id;
      setFields(EMPTY());
      onCreated?.();
      if (newId) onOpenRun?.(newId);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setCreating(false);
    }
  }

  const canSubmit = Boolean((fields.paragraph || "").trim());

  return (
    <form className="manual-article-form" onSubmit={handleSubmit}>
      <div className="manual-article-field manual-article-field--wide manual-article-field--idea">
        <label className="label" htmlFor="msf-paragraph">
          Post idea
        </label>
        <textarea
          id="msf-paragraph"
          className="textarea manual-article-textarea--idea"
          rows={6}
          value={fields.paragraph}
          onChange={(ev) => setField("paragraph", ev.target.value)}
          disabled={creating}
          placeholder="Describe your post in a short paragraph — message, audience, tone, season, call to action, etc."
          required
        />
      </div>

      <div className="manual-article-field manual-article-field--wide manual-article-field--details">
        <label className="label" htmlFor="msf-details">
          Additional details{" "}
          <span className="manual-article-optional">(optional)</span>
        </label>
        <textarea
          id="msf-details"
          className="textarea manual-article-textarea--details"
          rows={2}
          value={fields.additional_details}
          onChange={(ev) => setField("additional_details", ev.target.value)}
          disabled={creating}
          placeholder="Anything extra — links, hashtags, offers, location, brand notes…"
        />
      </div>

      <div className="manual-article-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!canSubmit || creating}
        >
          {creating ? (
            <>
              <span className="spinner spinner-light" /> Creating run…
            </>
          ) : (
            <>+ Create social run</>
          )}
        </button>
        {error ? (
          <span className="manual-article-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
