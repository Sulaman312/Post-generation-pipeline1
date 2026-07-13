import { useEffect, useState } from "react";
import * as api from "../../services/api";
import {
  SOCIAL_ADDITIONAL_DETAILS_MAX,
  SOCIAL_POST_IDEA_MAX,
} from "../../constants/socialFormLimits";
import {
  captionLanguageFromManual,
  captionLanguageLabel,
  parseSocialPostBlocks,
  socialAdditionalDetails,
  socialPostParagraph,
} from "../../utils/socialRunTopic";
import FormCharCounter from "../shared/FormCharCounter";
import CaptionLanguageField from "./CaptionLanguageField";
import RunLocationField from "./RunLocationField";
import "../workspace/WorkspaceForm.css";
import "./SocialRunInputPanel.css";
import "./RunLocationField.css";

function FormattedPostIdea({ text }) {
  const blocks = parseSocialPostBlocks(text);
  return (
    <div className="social-run-idea-formatted">
      {blocks.map((block, i) => {
        if (block.type === "blank") {
          return <div key={i} className="social-run-idea-gap" aria-hidden />;
        }
        if (block.type === "title") {
          return (
            <h3 key={i} className="social-run-idea-title">
              {block.text}
            </h3>
          );
        }
        if (block.type === "subhead") {
          return (
            <div key={i} className="social-run-idea-subhead">
              {block.text}
            </div>
          );
        }
        if (block.type === "check") {
          return (
            <div key={i} className="social-run-idea-check">
              <span className="social-run-idea-check-mark" aria-hidden>
                ✓
              </span>
              <span>{block.text.replace(/^✓\s*/, "")}</span>
            </div>
          );
        }
        return (
          <p key={i} className="social-run-idea-line">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export default function SocialRunInputPanel({
  client,
  runId,
  manualInputs,
  useLocation = false,
  locationValue = "",
  onSaved,
  toast,
}) {
  const paragraph = socialPostParagraph(manualInputs);
  const details = socialAdditionalDetails(manualInputs);
  const captionLanguage = captionLanguageFromManual(manualInputs);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState({
    paragraph: paragraph || "",
    additional_details: details || "",
    caption_language: captionLanguage,
    use_location: Boolean(useLocation),
    location_value: locationValue || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [clientDefaultLocation, setClientDefaultLocation] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getClientLocation(client)
      .then(({ location }) => {
        if (!cancelled) setClientDefaultLocation((location || "").trim());
      })
      .catch(() => {
        if (!cancelled) setClientDefaultLocation("");
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    if (!editing) {
      setFields({
        paragraph: socialPostParagraph(manualInputs) || "",
        additional_details: socialAdditionalDetails(manualInputs) || "",
        caption_language: captionLanguageFromManual(manualInputs),
        use_location: Boolean(useLocation),
        location_value: locationValue || "",
      });
    }
  }, [manualInputs, useLocation, locationValue, editing]);

  async function handleSave(e) {
    e?.preventDefault?.();
    const nextParagraph = (fields.paragraph || "").trim();
    if (!nextParagraph || saving) return;

    if (fields.use_location && !(fields.location_value || "").trim()) {
      setLocationError("Enter a city or region when location is on.");
      return;
    }

    setSaving(true);
    setError(null);
    setLocationError(null);
    try {
      await api.updateSocialRunManualInputs(client, runId, {
        paragraph: nextParagraph,
        additional_details: (fields.additional_details || "").trim(),
        caption_language: fields.caption_language === "fr" ? "fr" : "en",
      });
      await api.updateRunLocation(client, runId, {
        use_location: Boolean(fields.use_location),
        location_value: fields.use_location
          ? (fields.location_value || "").trim()
          : "",
      });
      setEditing(false);
      onSaved?.();
      toast?.("Post settings saved.", { variant: "success", duration: 3000 });
    } catch (err) {
      const msg = err?.message || String(err);
      setError(msg);
      toast?.(msg, { variant: "error", duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setFields({
      paragraph: socialPostParagraph(manualInputs) || "",
      additional_details: socialAdditionalDetails(manualInputs) || "",
      caption_language: captionLanguageFromManual(manualInputs),
      use_location: Boolean(useLocation),
      location_value: locationValue || "",
    });
    setEditing(false);
    setError(null);
    setLocationError(null);
  }

  const paragraphReady = Boolean((fields.paragraph || "").trim());
  const locationReady =
    !fields.use_location || Boolean((fields.location_value || "").trim());
  const canSave = paragraphReady && locationReady;

  return (
    <div className="run-artifact-shell social-run-input-shell">
      <div className="run-artifact-card social-run-input-card">
        <div className="social-run-input-head">
          <div>
            <div className="run-input-topic-eyebrow">Post idea · this run</div>
          </div>
          {!editing ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm social-run-input-edit-btn"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          ) : null}
        </div>

        {editing ? (
          <form className="social-run-input-form" onSubmit={handleSave}>
            <div className="workspace-form-field workspace-form-field--wide workspace-form-field--idea">
              <label className="label" htmlFor="sri-paragraph">
                Post idea
                <span className="workspace-form-req" aria-hidden>
                  {" "}
                  *
                </span>
                <span className="visually-hidden"> (required)</span>
              </label>
              <textarea
                id="sri-paragraph"
                className="textarea workspace-form-textarea--idea"
                rows={8}
                value={fields.paragraph}
                onChange={(ev) =>
                  setFields((f) => ({ ...f, paragraph: ev.target.value }))
                }
                disabled={saving}
                maxLength={SOCIAL_POST_IDEA_MAX}
                required
                aria-describedby="sri-paragraph-counter"
              />
              <FormCharCounter
                id="sri-paragraph-counter"
                value={fields.paragraph}
                max={SOCIAL_POST_IDEA_MAX}
              />
            </div>
            <div className="workspace-form-field workspace-form-field--wide workspace-form-field--details">
              <label className="label" htmlFor="sri-details">
                Additional details{" "}
                <span className="workspace-form-optional">(optional)</span>
              </label>
              <textarea
                id="sri-details"
                className="textarea workspace-form-textarea--details"
                rows={3}
                value={fields.additional_details}
                onChange={(ev) =>
                  setFields((f) => ({
                    ...f,
                    additional_details: ev.target.value,
                  }))
                }
                disabled={saving}
                placeholder="Hashtags, links, offers, brand notes…"
                maxLength={SOCIAL_ADDITIONAL_DETAILS_MAX}
                aria-describedby="sri-details-counter"
              />
              <FormCharCounter
                id="sri-details-counter"
                value={fields.additional_details}
                max={SOCIAL_ADDITIONAL_DETAILS_MAX}
              />
            </div>
            <div className="workspace-form-settings">
              <div className="workspace-form-settings-row">
                <div className="workspace-form-setting-card">
                  <CaptionLanguageField
                    idPrefix="sri-caption-lang"
                    value={fields.caption_language}
                    onChange={(value) =>
                      setFields((f) => ({ ...f, caption_language: value }))
                    }
                    disabled={saving}
                    embedded
                    compact
                  />
                </div>
                <div className="workspace-form-setting-card workspace-form-setting-card--location">
                  <RunLocationField
                    idPrefix="sri"
                    useLocation={fields.use_location}
                    locationValue={fields.location_value}
                    defaultLocation={clientDefaultLocation}
                    onUseLocationChange={(checked) => {
                      setFields((f) => ({ ...f, use_location: checked }));
                      if (locationError) setLocationError(null);
                    }}
                    onLocationValueChange={(value) => {
                      setFields((f) => ({ ...f, location_value: value }));
                      if (locationError) setLocationError(null);
                    }}
                    disabled={saving}
                    embedded
                    compact
                    locationRequired={fields.use_location}
                  />
                </div>
              </div>
              {locationError ? (
                <p
                  className="workspace-form-error workspace-form-location-error"
                  role="alert"
                >
                  {locationError}
                </p>
              ) : null}
            </div>
            {error ? (
              <p className="workspace-form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="social-run-input-form-actions">
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={saving || !canSave}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="run-artifact-body social-run-input-body">
            {paragraph ? (
              <FormattedPostIdea text={paragraph} />
            ) : (
              <p className="muted">(no post idea)</p>
            )}

            <section
              className="social-run-details-section"
              aria-label="Additional details"
            >
              <div className="run-input-topic-eyebrow social-run-details-eyebrow">
                Additional details
                {!details ? (
                  <span className="workspace-form-optional"> · none</span>
                ) : null}
              </div>
              {details ? (
                <FormattedPostIdea text={details} />
              ) : (
                <p className="social-run-details-empty muted">
                  No extra details were added when this run was created.
                </p>
              )}
            </section>

            <section className="social-run-details-section" aria-label="Caption language">
              <div className="run-input-topic-eyebrow social-run-details-eyebrow">
                Caption language
              </div>
              <p className="social-run-idea-line">
                {captionLanguageLabel(captionLanguage)}
              </p>
            </section>

            <section className="social-run-details-section" aria-label="Location">
              <div className="run-input-topic-eyebrow social-run-details-eyebrow">
                City or region
              </div>
              {useLocation && (locationValue || "").trim() ? (
                <p className="social-run-idea-line">{locationValue}</p>
              ) : (
                <p className="social-run-details-empty muted">
                  Location off for this run.
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
