export default function PublishEnvToggle({ env, availability, switching, onChange }) {
  const liveAvailable = Boolean(availability?.live);

  return (
    <div className="ppc-env" role="group" aria-label="Publishing environment">
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
          <span>Test</span>
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
          <span>Live</span>
          {!liveAvailable ? (
            <span className="ppc-env-lock" aria-hidden>
              <svg viewBox="0 0 16 16" fill="none">
                <path
                  d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <rect
                  x="4"
                  y="7"
                  width="8"
                  height="6"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              </svg>
            </span>
          ) : null}
        </button>
        {switching ? <span className="ppc-env-busy" aria-hidden /> : null}
      </div>
    </div>
  );
}
