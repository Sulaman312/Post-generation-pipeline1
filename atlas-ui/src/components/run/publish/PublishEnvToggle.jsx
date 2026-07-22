import { useLocale } from "../../../context/LocaleContext";

export default function PublishEnvToggle({ env, availability, switching, onChange }) {
  const { t } = useLocale();
  const liveAvailable = Boolean(availability?.live);

  return (
    <div className="ppc-env" role="group" aria-label={t("publish.env")}>
      <div
        className={`ppc-env-toggle${switching ? " ppc-env-toggle--busy" : ""}`}
        data-env={env}
      >
        <button
          type="button"
          className={`ppc-env-btn ppc-env-btn--test${
            env === "test" ? " ppc-env-btn--active" : ""
          }`}
          disabled={switching || env === "test"}
          aria-pressed={env === "test"}
          onClick={() => onChange("test")}
        >
          <span className="ppc-env-dot" aria-hidden />
          <span>{t("publish.test")}</span>
        </button>
        <button
          type="button"
          className={`ppc-env-btn ppc-env-btn--live${
            env === "live" ? " ppc-env-btn--active" : ""
          }`}
          disabled={switching || !liveAvailable || env === "live"}
          aria-pressed={env === "live"}
          title={
            !liveAvailable
              ? "Add META_LIVE_<WORKSPACE>_* / LINKEDIN_LIVE_<WORKSPACE>_* to .env to enable"
              : undefined
          }
          onClick={() => onChange("live")}
        >
          <span className="ppc-env-dot" aria-hidden />
          <span>{t("publish.live")}</span>
          {!liveAvailable ? (
            <span className="ppc-env-lock" aria-hidden>
              <svg viewBox="0 0 16 16" fill="none">
                <rect
                  x="4"
                  y="7"
                  width="8"
                  height="6"
                  rx="1.2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M5.8 7V5.6a2.2 2.2 0 0 1 4.4 0V7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
