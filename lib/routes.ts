import { isLocale, type Locale } from "./i18n";
export const pages = ["overview", "analysis", "business-units", "management-checks", "imports", "admin", "brand", "login"] as const;
export type Page = (typeof pages)[number];
export const dashboardSections = ["overview", "analysis", "business-units", "management-checks"] as const;
export type DashboardSection = (typeof dashboardSections)[number];
export function isDashboardSection(value: string): value is DashboardSection {
  return dashboardSections.includes(value as DashboardSection);
}
export function sectionPath(locale: Locale, section: DashboardSection) {
  return `${pagePath(locale, "overview")}#${section}`;
}
export function isPage(value: unknown): value is Page {
  return typeof value === "string" && pages.includes(value as Page);
}
export function pagePath(locale: Locale, page: Page) { return `/${locale}/${page}`; }
export function parsePagePath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 2 || !isLocale(parts[0]) || !isPage(parts[1])) return null;
  return { locale: parts[0], page: parts[1] };
}
export function loginDestination(value: string | null, locale: Locale): string {
  const fallback = pagePath(locale, "overview");
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, "https://dashboard.invalid");
    const route = parsePagePath(url.pathname);
    if (url.origin !== "https://dashboard.invalid" || !route || route.page === "login") return fallback;
    return pagePath(locale, route.page) + url.search + url.hash;
  } catch { return fallback; }
}
export function switchLanguagePath(path: string, locale: Locale) {
  const url = new URL(path, "https://dashboard.invalid");
  const route = parsePagePath(url.pathname);
  if (url.searchParams.has("next")) url.searchParams.set("next", loginDestination(url.searchParams.get("next"), locale));
  return pagePath(locale, route?.page ?? "overview") + url.search + url.hash;
}
