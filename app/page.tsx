import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { pagePath } from "@/lib/routes";
export default async function IndexPage() {
  const locale = (await cookies()).get("diam_locale")?.value;
  redirect(pagePath(isLocale(locale) ? locale : "en", "overview"));
}
