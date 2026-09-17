"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  displayText,
  isLocale,
  localeStorageKey,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
} from "@/lib/i18n";

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  tr: (key: MessageKey, params?: MessageParams) => string;
  display: (value: string) => string;
};
const Context = createContext<I18n | null>(null);
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(localeStorageKey);
      if (isLocale(saved)) updateLocale(saved);
    } catch {
      /* Language switching also works when browser storage is blocked. */
    }
    const sync = (event: StorageEvent) => {
      if (event.key === localeStorageKey && isLocale(event.newValue))
        updateLocale(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    try {
      localStorage.setItem(localeStorageKey, next);
    } catch {
      /* Optional preference persistence. */
    }
  }, []);
  const tr = useCallback(
    (key: MessageKey, params?: MessageParams) => translate(locale, key, params),
    [locale],
  );
  const display = useCallback(
    (value: string) => displayText(locale, value),
    [locale],
  );
  return (
    <Context.Provider value={{ locale, setLocale, tr, display }}>
      {children}
    </Context.Provider>
  );
}
export function useI18n() {
  const context = useContext(Context);
  if (!context) throw new Error("I18nProvider is required");
  return context;
}
