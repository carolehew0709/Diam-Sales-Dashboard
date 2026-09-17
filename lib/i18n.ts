import en from "@/locales/en.json";
import zh from "@/locales/zh-CN.json";

export type Locale = "en" | "zh-CN";
export type MessageKey = keyof typeof en;
export type MessageParams = Record<string, string | number>;
export const messages: Record<Locale, Record<MessageKey, string>> = {
  en,
  "zh-CN": zh,
};
export const localeStorageKey = "diam.dashboard.locale";
export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh-CN";
}
export function translate(
  locale: Locale,
  key: MessageKey,
  params: MessageParams = {},
): string {
  return (messages[locale][key] ?? en[key]).replace(
    /\{(\w+)\}/g,
    (token, name: string) => String(params[name] ?? token),
  );
}

// Source notes and customer names are evidence, not interface copy. Unknown text stays intact.
export function displayText(locale: Locale, value: string): string {
  const codes: Record<string, MessageKey> = {
    superadmin: "roles.superadmin",
    region_admin: "roles.region_admin",
    editor: "roles.editor",
    viewer: "roles.viewer",
    audit_viewer: "roles.audit_viewer",
    view: "common.view",
    edit: "common.edit",
    all: "filters.allAvailable",
    external: "common.external",
    group: "common.group",
    product: "order.product",
    customer: "common.customer",
    total2026: "order.total2026",
    total2027: "order.total2027",
    香港外销: "entity.dhk",
    工厂内销: "entity.ddc",
    即将关闭的工厂: "entity.dcp",
  };
  if (codes[value]) return translate(locale, codes[value]);
  const entry = (Object.keys(en) as MessageKey[]).find(
    (key) => en[key] === value || zh[key] === value,
  );
  if (entry) return translate(locale, entry);
  // Existing API messages use English templates; only presentation is localized.
  for (const key of Object.keys(en) as MessageKey[]) {
    if (!key.startsWith("errors.") || !en[key].includes("{")) continue;
    const names: string[] = [];
    const escaped = en[key].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = escaped.replace(/\\\{(\w+)\\\}/g, (_, name: string) => {
      names.push(name);
      return "(.+?)";
    });
    const match = value.match(new RegExp(`^${pattern}$`));
    if (match)
      return translate(
        locale,
        key,
        Object.fromEntries(
          names.map((name, i) => [name, displayText(locale, match[i + 1])]),
        ),
      );
  }
  return value;
}
