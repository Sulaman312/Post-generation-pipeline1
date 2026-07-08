import "./RunLocationField.css";

export default function RunLocationField({
  useLocation,
  locationValue,
  defaultLocation = "",
  onUseLocationChange,
  onLocationValueChange,
  disabled = false,
  idPrefix = "loc",
}) {
  const inputId = `${idPrefix}-value`;
  const toggleId = `${idPrefix}-toggle`;
  const clientDefault = (defaultLocation || "").trim();

  function handleToggleChange(checked) {
    onUseLocationChange?.(checked);
    if (checked && !(locationValue || "").trim() && clientDefault) {
      onLocationValueChange?.(clientDefault);
    }
  }

  return (
    <div className="run-location-field">
      <div className="run-location-field-head">
        <label className="run-location-toggle" htmlFor={toggleId}>
          <input
            id={toggleId}
            type="checkbox"
            className="run-location-toggle-input"
            checked={Boolean(useLocation)}
            onChange={(ev) => handleToggleChange(ev.target.checked)}
            disabled={disabled}
          />
          <span className="run-location-toggle-track" aria-hidden />
          <span className="run-location-toggle-label">Use location</span>
        </label>
      </div>
      {useLocation ? (
        <div className="run-location-value">
          <p className="run-location-hint muted">
            City or region for this post — not a street address.
          </p>
          <div className="workspace-form-field workspace-form-field--wide">
          <label className="label" htmlFor={inputId}>
            Location text
          </label>
          <input
            id={inputId}
            type="text"
            className="input"
            value={locationValue || ""}
            onChange={(ev) => onLocationValueChange?.(ev.target.value)}
            disabled={disabled}
            placeholder="e.g. Lausanne and surrounding areas"
            maxLength={500}
          />
          </div>
        </div>
      ) : null}
    </div>
  );
}
