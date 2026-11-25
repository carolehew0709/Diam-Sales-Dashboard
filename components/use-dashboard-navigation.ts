"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isDashboardSection, sectionPath, type Page } from "@/lib/routes";
import type { Locale } from "@/lib/i18n";

export function useDashboardNavigation(page: Page, locale: Locale) {
  const header = useRef<HTMLElement>(null);
  const router = useRouter();
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () => {
      document.documentElement.style.setProperty(
        "--dashboard-header-height",
        `${element.getBoundingClientRect().height}px`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [page]);

  useEffect(() => {
    if (page !== "overview") return;
    let pending: MutationObserver | undefined;
    const followLegacyLink = () => {
      pending?.disconnect();
      const section = window.location.hash.slice(1);
      if (!isDashboardSection(section)) return;
      if (section !== "overview" && section !== "analysis" && section !== "business-units") {
        router.replace(sectionPath(locale, section));
        window.scrollTo({ top: 0, behavior: "instant" });
        return;
      }
      const locate = () => {
        const element = document.getElementById(section);
        if (!element) return false;
        element.scrollIntoView({ block: "start" });
        return true;
      };
      if (!locate()) {
        pending = new MutationObserver(() => {
          if (locate()) pending?.disconnect();
        });
        pending.observe(document.body, { subtree: true, childList: true });
      }
    };
    followLegacyLink();
    window.addEventListener("hashchange", followLegacyLink);
    return () => {
      pending?.disconnect();
      window.removeEventListener("hashchange", followLegacyLink);
    };
  }, [page, locale, router]);

  return header;
}
