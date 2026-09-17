import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { isPage, isDashboardSection, sectionPath } from "@/lib/routes";
export default async function Page({ params }: { params: Promise<{ locale: string; view: string }> }) {
  const { locale, view } = await params;
  if (!isLocale(locale) || !isPage(view)) notFound();
  if (view !== "overview" && isDashboardSection(view)) redirect(sectionPath(locale, view));
  // Keep the dashboard mounted across locale changes to preserve form drafts.
  return null;
}
