import { isLocale, type Locale, type MessageKey } from "./i18n";
export const salesPages = [
  "overview",
  "sales-team",
  "customer",
  "management-checks",
] as const;
export type SalesPage = (typeof salesPages)[number];
export const salesPageLabels: Record<SalesPage, MessageKey> = {
  overview: "nav.overview",
  "sales-team": "team.label",
  customer: "common.customer",
  "management-checks": "nav.checks",
};
export const pages = [
  "home",
  ...salesPages,
  "ar-aging",
  "pipeline",
  "sales-operations",
  "quotation",
  "analysis",
  "business-units",
  "imports",
  "admin",
  "login",
] as const;
export type Page = (typeof pages)[number];
export function isSalesPage(value: unknown): value is SalesPage {
  return typeof value === "string" && salesPages.includes(value as SalesPage);
}
export const dashboardSections = [
  "overview",
  "analysis",
  "business-units",
  "sales-team-section",
  "customer-section",
  "management-checks",
] as const;
export type DashboardSection = (typeof dashboardSections)[number];
export function isDashboardSection(value: string): value is DashboardSection {
  return dashboardSections.includes(value as DashboardSection);
}
export function sectionPath(locale: Locale, section: DashboardSection) {
  if (section === "sales-team-section") return pagePath(locale, "sales-team");
  if (section === "customer-section") return pagePath(locale, "customer");
  if (isSalesPage(section)) return pagePath(locale, section);
  return `${pagePath(locale, "overview")}#${section}`;
}
export function isPage(value: unknown): value is Page {
  return typeof value === "string" && pages.includes(value as Page);
}
export function pagePath(locale: Locale, page: Page) {
  return `/${locale}/${page}`;
}
export function parsePagePath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 2 || !isLocale(parts[0]) || !isPage(parts[1]))
    return null;
  return { locale: parts[0], page: parts[1] };
}
// Every sign-in starts at the workspace, including stale login links with next.
export function loginDestination(locale: Locale): string {
  return pagePath(locale, "home");
}
export function switchLanguagePath(path: string, locale: Locale) {
  const url = new URL(path, "https://dashboard.invalid");
  const route = parsePagePath(url.pathname);
  if (route?.page === "login") url.searchParams.delete("next");
  return pagePath(locale, route?.page ?? "home") + url.search + url.hash;
}
