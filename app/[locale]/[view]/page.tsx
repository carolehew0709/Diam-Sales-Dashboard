import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { isPage } from "@/lib/routes";
export default async function Page({ params }: { params: Promise<{ locale: string; view: string }> }) {
  const { locale, view } = await params;
  if (!isLocale(locale) || !isPage(view)) notFound();
  // Keep the dashboard mounted across locale changes to preserve form drafts.
  return null;
}
