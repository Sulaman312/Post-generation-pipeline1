import { useEffect, useState } from "react";
import * as api from "../../services/api";
import { useLocale } from "../../context/LocaleContext";
import { PIPELINE_IDS } from "../../constants/pipelines";
import {
  SOCIAL_ADDITIONAL_DETAILS_MAX,
  SOCIAL_POST_IDEA_MAX,
} from "../../constants/socialFormLimits";
import { socialRunTitle } from "../../utils/socialRunTopic";
import FormCharCounter from "../shared/FormCharCounter";
import CaptionLanguageField from "../run/CaptionLanguageField";
import RunLocationField from "../run/RunLocationField";
import "./WorkspaceForm.css";

const EMPTY = () => ({
  paragraph: "",
  additional_details: "",
  caption_language: "en",
});

export default function ManualSocialForm({ client, onOpenRun, onCreated }) {
  const { t } = useLocale();
  const [fields, setFields] = useState(EMPTY);
  const [useLocation, setUseLocation] = useState(false);
  const [locationValue, setLocationValue] = useState("");
  const [clientDefaultLocation, setClientDefaultLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getClientLocation(client)
      .then(({ location, hasLocation }) => {
        if (cancelled) return;
        const defaultLoc = (location || "").trim();
        setClientDefaultLocation(defaultLoc);
        setUseLocation(hasLocation);
        setLocationValue(hasLocation ? defaultLoc : "");
      })
      .catch(() => {
        if (!cancelled) {
          setUseLocation(false);
          setLocationValue("");
          setClientDefaultLocation("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const paragraph = (fields.paragraph || "").trim();
    if (creating || !paragraph) return;

    if (useLocation && !(locationValue || "").trim()) {
      setLocationError(t("form.locationRequired"));
      return;
    }

    const topic = socialRunTitle(
      {
        paragraph,
        additional_details: (fields.additional_details || "").trim(),
      },
      ""
    );
    setCreating(true);
    setError(null);
    setLocationError(null);

    try {
      const result = await api.createRun(client, topic, {
        pipeline_id: PIPELINE_IDS.SOCIAL,
        manual_inputs: {
          paragraph,
          additional_details: (fields.additional_details || "").trim(),
          caption_language: fields.caption_language === "fr" ? "fr" : "en",
        },
        use_location: useLocation,
        location_value: useLocation ? (locationValue || "").trim() : "",
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

  const paragraph = (fields.paragraph || "").trim();
  const locationReady = !useLocation || Boolean((locationValue || "").trim());
  const canSubmit = Boolean(paragraph) && locationReady;

  return (
    <form className="workspace-form-form" onSubmit={handleSubmit}>
      <div className="workspace-form-field workspace-form-field--wide workspace-form-field--idea">
        <label className="label" htmlFor="msf-paragraph">
          {t("form.postIdea")}
          <span className="workspace-form-req" aria-hidden>
            {" "}
            *
          </span>
          <span className="visually-hidden"> {t("common.required")}</span>
        </label>
        <textarea
          id="msf-paragraph"
          className="textarea workspace-form-textarea--idea"
          rows={6}
          value={fields.paragraph}
          onChange={(ev) => setField("paragraph", ev.target.value)}
          disabled={creating}
          placeholder={t("form.ideaPlaceholder")}
          maxLength={SOCIAL_POST_IDEA_MAX}
          required
          aria-describedby="msf-paragraph-counter"
        />
        <FormCharCounter
          id="msf-paragraph-counter"
          value={fields.paragraph}
          max={SOCIAL_POST_IDEA_MAX}
        />
      </div>

      <div className="workspace-form-field workspace-form-field--wide workspace-form-field--details">
        <label className="label" htmlFor="msf-details">
          {t("form.additionalDetails")}{" "}
          <span className="workspace-form-optional">{t("common.optional")}</span>
        </label>
        <textarea
          id="msf-details"
          className="textarea workspace-form-textarea--details"
          rows={2}
          value={fields.additional_details}
          onChange={(ev) => setField("additional_details", ev.target.value)}
          disabled={creating}
          placeholder={t("form.detailsPlaceholderLong")}
          maxLength={SOCIAL_ADDITIONAL_DETAILS_MAX}
          aria-describedby="msf-details-counter"
        />
        <FormCharCounter
          id="msf-details-counter"
          value={fields.additional_details}
          max={SOCIAL_ADDITIONAL_DETAILS_MAX}
        />
      </div>

      <div className="workspace-form-settings">
        <div className="workspace-form-settings-row">
          <div className="workspace-form-setting-card">
            <CaptionLanguageField
              idPrefix="msf-caption-lang"
              value={fields.caption_language}
              onChange={(value) => setField("caption_language", value)}
              disabled={creating}
              embedded
              compact
            />
          </div>
          <div className="workspace-form-setting-card workspace-form-setting-card--location">
            <RunLocationField
              idPrefix="msf"
              useLocation={useLocation}
              locationValue={locationValue}
              defaultLocation={clientDefaultLocation}
              onUseLocationChange={(next) => {
                setUseLocation(next);
                if (locationError) setLocationError(null);
              }}
              onLocationValueChange={(value) => {
                setLocationValue(value);
                if (locationError) setLocationError(null);
              }}
              disabled={creating}
              embedded
              compact
              locationRequired={useLocation}
            />
          </div>
        </div>
        {locationError ? (
          <p className="workspace-form-error workspace-form-location-error" role="alert">
            {locationError}
          </p>
        ) : null}
      </div>

      <div className="workspace-form-actions">
        <button
          type="submit"
          className="btn btn-primary workspace-form-submit"
          disabled={!canSubmit || creating}
        >
          {creating ? (
            <>
              <span className="spinner spinner-light" /> {t("form.creatingRun")}
            </>
          ) : (
            t("form.createSocialRun")
          )}
        </button>
        {error ? (
          <span className="workspace-form-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
