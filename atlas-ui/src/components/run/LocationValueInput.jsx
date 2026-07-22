import FormCharCounter from "../shared/FormCharCounter";
import { useLocale } from "../../context/LocaleContext";
import { looksLikeStreetAddress } from "../../utils/clientLocation";
import { SOCIAL_LOCATION_MAX } from "../../constants/socialFormLimits";

export const LOCATION_FIELD_LABEL = "City or region";
export const LOCATION_FIELD_HINT =
  "Used in captions when geography is relevant — a city, region, or service area, not a street address.";
export const LOCATION_FIELD_PLACEHOLDER = "e.g. Lausanne and Vaud";

export default function LocationValueInput({
  id,
  value,
  onChange,
  disabled = false,
  required = false,
  showStreetWarning = true,
}) {
  const { t } = useLocale();
  const streetLike = showStreetWarning && looksLikeStreetAddress(value);

  return (
    <div className="location-value-input">
      <label className="label" htmlFor={id}>
        {t("form.cityOrRegion")}
        {required ? (
          <>
            <span className="workspace-form-req" aria-hidden>
              {" "}
              *
            </span>
            <span className="visually-hidden"> {t("common.required")}</span>
          </>
        ) : null}
      </label>
      <input
        id={id}
        type="text"
        className="input"
        value={value || ""}
        onChange={(ev) => onChange?.(ev.target.value)}
        disabled={disabled}
        placeholder={t("form.locationPlaceholder")}
        maxLength={SOCIAL_LOCATION_MAX}
        required={required}
        aria-describedby={`${id}-hint${streetLike ? ` ${id}-street-warn` : ""} ${id}-counter`}
      />
      <p className="workspace-form-hint" id={`${id}-hint`}>
        {t("form.locationHint")}
      </p>
      {streetLike ? (
        <p className="location-value-street-warn" id={`${id}-street-warn`} role="status">
          {t("form.streetWarning")}
        </p>
      ) : null}
      <FormCharCounter id={`${id}-counter`} value={value} max={SOCIAL_LOCATION_MAX} />
    </div>
  );
}
