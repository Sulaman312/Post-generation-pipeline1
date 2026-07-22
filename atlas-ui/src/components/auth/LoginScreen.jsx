import { useState } from "react";
import { APP_BRAND_NAME, APP_LOGO } from "../../constants/brand";
import { APP_PROJECT_MODE } from "../../constants/appProject";
import { useLocale } from "../../context/LocaleContext";
import LanguageToggle from "../shared/LanguageToggle";
import * as api from "../../services/api";
import "./LoginScreen.css";

function IconEye(props) {
  return (
    <svg
      className="login-password-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff(props) {
  return (
    <svg
      className="login-password-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.2 18.2 0 0 1-4.1 5.2" />
      <path d="M6.1 6.1C3.4 8.1 2 12 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4.9-1.2" />
    </svg>
  );
}

export default function LoginScreen({ onLoggedIn }) {
  const { t } = useLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const productName =
    APP_PROJECT_MODE === "article"
      ? t("product.name.article")
      : APP_PROJECT_MODE === "social"
        ? t("product.name.social")
        : t("product.name.default");
  const productTagline =
    APP_PROJECT_MODE === "article"
      ? t("product.tagline.article")
      : APP_PROJECT_MODE === "social"
        ? t("product.tagline.social")
        : t("product.tagline.default");

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const data = await api.login(username.trim(), password);
      onLoggedIn?.(data?.user || { username: username.trim().toLowerCase() });
    } catch (e) {
      setError(e?.message || t("login.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-language-bar">
        <LanguageToggle className="login-language" />
      </div>
      <div className="login-card">
        <div className="login-brand">
          <img className="login-brand-logo" src={APP_LOGO} alt={APP_BRAND_NAME} />
          <div>
            <h1 className="login-title">{productName}</h1>
            <p className="login-subtitle">{productTagline}</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span className="login-label">{t("login.username")}</span>
            <input
              type="text"
              className="input"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              required
            />
          </label>

          <label className="login-field">
            <span className="login-label">{t("login.password")}</span>
            <div className="login-password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                className="input login-password-input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                disabled={busy}
                aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                aria-pressed={showPassword}
              >
                {showPassword ? <IconEye /> : <IconEyeOff />}
              </button>
            </div>
          </label>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? t("login.signingIn") : t("login.signIn")}
          </button>
        </form>
      </div>
    </div>
  );
}
