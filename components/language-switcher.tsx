"use client";
import { Languages } from "lucide-react";
import { useI18n } from "./i18n-provider";

export function LanguageSwitcher() {
  const { locale, setLocale, tr } = useI18n();
  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={tr("language.label")}
    >
      <Languages size={16} aria-hidden="true" />
      <button
        type="button"
        lang="en"
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        {tr("language.en")}
      </button>
      <button
        type="button"
        lang="zh-CN"
        aria-pressed={locale === "zh-CN"}
        onClick={() => setLocale("zh-CN")}
      >
        {tr("language.zh")}
      </button>
    </div>
  );
}
