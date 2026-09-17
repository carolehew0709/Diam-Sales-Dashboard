import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { pagePath } from "@/lib/routes";
export default async function LocalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(pagePath(locale, "overview"));
}
