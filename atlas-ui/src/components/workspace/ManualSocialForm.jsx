import { useEffect, useState } from "react";
import * as api from "../../services/api";
import { PIPELINE_IDS } from "../../constants/pipelines";
import { socialRunTitle } from "../../utils/socialRunTopic";
import RunLocationField from "../run/RunLocationField";
import "./WorkspaceForm.css";

const EMPTY = () => ({
  paragraph: "",
  additional_details: "",
});

export default function ManualSocialForm({ client, onOpenRun, onCreated }) {
  const [fields, setFields] = useState(EMPTY);
  const [useLocation, setUseLocation] = useState(false);
  const [locationValue, setLocationValue] = useState("");
  const [clientDefaultLocation, setClientDefaultLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

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

  const canSubmit = Boolean((fields.paragraph || "").trim());

  return (
    <form className="workspace-form-form" onSubmit={handleSubmit}>
      <div className="workspace-form-field workspace-form-field--wide workspace-form-field--idea">
        <label className="label" htmlFor="msf-paragraph">
          Post idea
        </label>
        <textarea
          id="msf-paragraph"
          className="textarea workspace-form-textarea--idea"
          rows={6}
          value={fields.paragraph}
          onChange={(ev) => setField("paragraph", ev.target.value)}
          disabled={creating}
          placeholder="Describe your post in a short paragraph — message, audience, tone, season, call to action, etc."
          required
        />
      </div>

      <div className="workspace-form-field workspace-form-field--wide workspace-form-field--details">
        <label className="label" htmlFor="msf-details">
          Additional details{" "}
          <span className="workspace-form-optional">(optional)</span>
        </label>
        <textarea
          id="msf-details"
          className="textarea workspace-form-textarea--details"
          rows={2}
          value={fields.additional_details}
          onChange={(ev) => setField("additional_details", ev.target.value)}
          disabled={creating}
          placeholder="Anything extra — links, hashtags, offers, brand notes…"
        />
      </div>

      <RunLocationField
        idPrefix="msf"
        useLocation={useLocation}
        locationValue={locationValue}
        defaultLocation={clientDefaultLocation}
        onUseLocationChange={setUseLocation}
        onLocationValueChange={setLocationValue}
        disabled={creating}
      />

      <div className="workspace-form-actions">
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
          <span className="workspace-form-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
