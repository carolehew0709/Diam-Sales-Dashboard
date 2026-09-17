"use client";
import { useEffect, useRef, useState } from "react";
import { dashboardSections, isDashboardSection, type DashboardSection, type Page } from "@/lib/routes";
import type { Locale } from "@/lib/i18n";

export function useDashboardNavigation(page: Page, locale: Locale) {
  const header = useRef<HTMLElement>(null);
  const [active, setActive] = useState<DashboardSection>("overview");
  useEffect(() => {
    if (!header.current) return;
    const measure = () => document.documentElement.style.setProperty("--dashboard-header-height", `${header.current!.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (page !== "overview") return;
    let pending: MutationObserver | undefined;
    let frame = 0;
    let requested: DashboardSection | null = null;
    const updateActive = () => {
      const offset = (header.current?.getBoundingClientRect().bottom ?? 120) + 24;
      let current: DashboardSection = "overview";
      for (const id of dashboardSections) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= offset) current = id;
      }
      // Short final sections cannot always align with the top of the viewport.
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = requested ?? "management-checks";
      setActive(current);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActive);
    };
    const followHash = () => {
      pending?.disconnect();
      const id = window.location.hash.slice(1);
      if (!isDashboardSection(id)) { updateActive(); return; }
      requested = id;
      const locate = () => {
        const element = document.getElementById(id);
        if (!element) return false;
        element.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
        setActive(id);
        return true;
      };
      // Dashboard data may arrive after the route and its fragment are loaded.
      if (!locate()) {
        pending = new MutationObserver(() => { if (locate()) pending?.disconnect(); });
        pending.observe(document.body, { childList: true, subtree: true });
      }
    };
    followHash();
    const manualScroll = () => { requested = null; onScroll(); };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) manualScroll();
    };
    window.addEventListener("wheel", manualScroll, { passive: true });
    window.addEventListener("touchmove", manualScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("hashchange", followHash);
    window.addEventListener("popstate", followHash);
    return () => {
      pending?.disconnect();
      window.removeEventListener("wheel", manualScroll);
      window.removeEventListener("touchmove", manualScroll);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("hashchange", followHash);
      window.removeEventListener("popstate", followHash);
    };
  }, [page, locale]);
  return { header, active };
}
