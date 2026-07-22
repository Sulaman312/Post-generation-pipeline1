import SegmentedPillToggle from "../shared/SegmentedPillToggle";
import { useLocale } from "../../context/LocaleContext";
import "./CaptionLanguageField.css";

export default function CaptionLanguageField({
  value = "en",
  onChange,
  disabled = false,
  idPrefix = "caption-lang",
  embedded = false,
  compact = false,
}) {
  const { t } = useLocale();
  const selected = value === "fr" ? "fr" : "en";
  const langLabel = selected === "fr" ? t("lang.french") : t("lang.english");

  return (
    <div
      className={`caption-language-field${
        embedded ? " caption-language-field--embedded" : ""
      }${compact ? " caption-language-field--compact" : ""}`}
    >
      <div className="caption-language-field-top">
        <span className="caption-language-title" id={`${idPrefix}-label`}>
          {t("form.captionLanguage")}
        </span>
        <SegmentedPillToggle
          className="caption-language-pill"
          ariaLabel={t("form.captionLanguage")}
          value={selected}
          disabled={disabled}
          options={[
            { value: "en", label: t("lang.english") },
            { value: "fr", label: t("lang.french") },
          ]}
          onChange={onChange}
        />
      </div>
      {!compact ? (
        <p className="caption-language-hint muted">
          {t("form.captionLanguageHint", { lang: langLabel })}
        </p>
      ) : null}
    </div>
  );
}
