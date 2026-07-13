import ToggleSwitch from "../shared/ToggleSwitch";
import LocationValueInput from "./LocationValueInput";
import { looksLikeStreetAddress } from "../../utils/clientLocation";
import "./RunLocationField.css";

export default function RunLocationField({
  useLocation,
  locationValue,
  defaultLocation = "",
  onUseLocationChange,
  onLocationValueChange,
  disabled = false,
  idPrefix = "loc",
  embedded = false,
  compact = false,
  locationRequired = false,
}) {
  const switchId = `${idPrefix}-use-location`;
  const inputId = `${idPrefix}-value`;
  const clientDefault = (defaultLocation || "").trim();
  const enabled = Boolean(useLocation);

  function handleSwitchChange(next) {
    onUseLocationChange?.(next);
    if (next && !(locationValue || "").trim() && clientDefault) {
      onLocationValueChange?.(clientDefault);
    }
  }

  return (
    <div
      className={`run-location-field${
        embedded ? " run-location-field--embedded" : ""
      }${compact ? " run-location-field--compact" : ""}${
        enabled ? " run-location-field--enabled" : ""
      }`}
    >
      <div className="run-location-field-top">
        <span className="run-location-title" id={`${idPrefix}-location-label`}>
          Location in captions
        </span>
        <ToggleSwitch
          id={switchId}
          checked={enabled}
          disabled={disabled}
          ariaLabel="Include location in captions"
          onChange={handleSwitchChange}
        />
      </div>

      {!compact && !enabled ? (
        <p className="run-location-hint muted">
          Location is off for this post.
        </p>
      ) : null}

      {compact && !enabled ? (
        <p className="run-location-hint muted run-location-hint--compact">
          Off — captions will not mention geography.
        </p>
      ) : null}

      {enabled ? (
        <div
          className={`run-location-value${
            compact ? " run-location-value--compact" : ""
          }`}
        >
          {compact ? (
            <LocationValueInput
              id={inputId}
              value={locationValue}
              onChange={onLocationValueChange}
              disabled={disabled}
              required={locationRequired}
              showStreetWarning
            />
          ) : (
            <div className="workspace-form-field workspace-form-field--wide run-location-input-wrap">
              <LocationValueInput
                id={inputId}
                value={locationValue}
                onChange={onLocationValueChange}
                disabled={disabled}
                required={locationRequired}
                showStreetWarning={!looksLikeStreetAddress(clientDefault)}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
