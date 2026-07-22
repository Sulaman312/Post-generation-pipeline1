import SegmentedPillToggle from "./SegmentedPillToggle";
import { useLocale } from "../../context/LocaleContext";
import "./LanguageToggle.css";

export default function LanguageToggle({ compact = false, className = "" }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className={`language-toggle${compact ? " language-toggle--compact" : ""}${className ? ` ${className}` : ""}`}>
      {!compact ? (
        <span className="language-toggle-label" id="ui-language-label">
          {t("ui.language")}
        </span>
      ) : null}
      <SegmentedPillToggle
        value={locale}
        onChange={setLocale}
        ariaLabel={t("ui.language")}
        className="language-toggle-pills"
        options={[
          { value: "en", label: t("ui.english") },
          { value: "fr", label: t("ui.french") },
        ]}
      />
    </div>
  );
}
