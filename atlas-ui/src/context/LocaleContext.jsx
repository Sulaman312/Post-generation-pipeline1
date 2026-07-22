import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "../i18n/en.json";
import fr from "../i18n/fr.json";

const STORAGE_KEY = "cf-ui-locale";
const DICTS = { en, fr };

const LocaleContext = createContext({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

function readStoredLocale() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "fr" || raw === "en") return raw;
  } catch {
    /* ignore */
  }
  return "en";
}

function interpolate(template, vars = {}) {
  if (!template || typeof template !== "string") return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    vars[name] != null ? String(vars[name]) : ""
  );
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(readStoredLocale);

  const setLocale = useCallback((next) => {
    const value = next === "fr" ? "fr" : "en";
    setLocaleState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const t = useCallback(
    (key, vars) => {
      const dict = DICTS[locale] || DICTS.en;
      const fallback = DICTS.en[key];
      const raw = dict[key] ?? fallback ?? key;
      return interpolate(raw, vars);
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** Translate a pipeline step label by key; falls back to the contract label. */
export function useStepLabel() {
  const { t } = useLocale();
  return useCallback(
    (step) => {
      if (!step) return "";
      const key = `steps.${step.key}`;
      const translated = t(key);
      if (translated && translated !== key) return translated;
      return step.label || step.matrixLabel || step.key || "";
    },
    [t]
  );
}
