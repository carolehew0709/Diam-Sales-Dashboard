"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { switchLanguagePath } from "@/lib/routes";
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
  const pathname = usePathname();
  const router = useRouter();
  const segment = pathname.split("/")[1];
  const locale: Locale = isLocale(segment) ? segment : "en";
  useEffect(() => {
    document.documentElement.lang = locale;
    document.cookie = `diam_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    router.push(switchLanguagePath(window.location.pathname + window.location.search + window.location.hash, next), { scroll: false });
    try {
      localStorage.setItem(localeStorageKey, next);
    } catch {
      /* Optional preference persistence. */
    }
  }, [router]);
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
