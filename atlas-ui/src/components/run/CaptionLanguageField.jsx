import SegmentedPillToggle from "../shared/SegmentedPillToggle";
import "./CaptionLanguageField.css";

export default function CaptionLanguageField({
  value = "en",
  onChange,
  disabled = false,
  idPrefix = "caption-lang",
  embedded = false,
  compact = false,
}) {
  const selected = value === "fr" ? "fr" : "en";

  return (
    <div
      className={`caption-language-field${
        embedded ? " caption-language-field--embedded" : ""
      }${compact ? " caption-language-field--compact" : ""}`}
    >
      <div className="caption-language-field-top">
        <span className="caption-language-title" id={`${idPrefix}-label`}>
          Caption language
        </span>
        <SegmentedPillToggle
          className="caption-language-pill"
          ariaLabel="Caption language"
          value={selected}
          disabled={disabled}
          options={[
            { value: "en", label: "English" },
            { value: "fr", label: "French" },
          ]}
          onChange={onChange}
        />
      </div>
      {!compact ? (
        <p className="caption-language-hint muted">
          Captions will be written in{" "}
          <strong>{selected === "fr" ? "French" : "English"}</strong>.
        </p>
      ) : null}
    </div>
  );
}
