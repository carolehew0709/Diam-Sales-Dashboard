"use client";
import { useI18n } from "@/components/i18n-provider";
import Image from "next/image";
import Link from "next/link";
import { pagePath, sectionPath, type DashboardSection, type Page } from "@/lib/routes";
import { useDashboardNavigation } from "./use-dashboard-navigation";
import { Download, FileUp } from "lucide-react";
import type { Filters, User } from "@/lib/types";
import { AccountMenu } from "./account-menu";
import { LanguageSwitcher } from "./language-switcher";
export function DashboardShell({
  user,
  filters,
  onLogout,
  page,
  children,
}: {
  user: User;
  filters: Filters;
  onLogout: () => void;
  page: Page;
  children: React.ReactNode;
}) {
  const { tr, locale } = useI18n();
  const { header, active } = useDashboardNavigation(page, locale);
  const query = new URLSearchParams(
    Object.entries(filters).map(([k, v]) => [k, String(v)]),
  );
  return (
    <>
      <header className="topbar dashboard-header" ref={header}>
        <div className="brand">
          <Link className="brand-home" href={pagePath(locale, "overview")}>
            <Image
              className="brand-logo"
              src="/diam-logo.png"
              width={92}
              height={30}
              alt="DIAM"
            />
          </Link>
          <span className="brand-divider" />
          <nav className="product-switcher" aria-label={tr("nav.area")}>
            <Link href={pagePath(locale, "overview")} aria-current={page !== "brand" ? "page" : undefined}>
              {tr("nav.performance")}
            </Link>
            <Link href={pagePath(locale, "brand")} aria-current={page === "brand" ? "page" : undefined}>{tr("nav.brand")}</Link>
          </nav>
        </div>
        <nav className="topnav">
          <span className="topnav-links">
            {[
              ["overview", tr("nav.overview")],
              ["analysis", tr("nav.analysis")],
              ["business-units", tr("nav.entities")],
              ["management-checks", tr("nav.checks")],
            ].map(([id, label]) => (
              <Link key={id} href={sectionPath(locale, id as DashboardSection)} scroll={false}
                aria-current={page === "overview" && active === id ? "location" : undefined}
                onClick={(event) => {
                  if (page !== "overview" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                  event.preventDefault();
                  if (window.location.hash !== `#${id}`) window.history.pushState(null, "", sectionPath(locale, id as DashboardSection));
                  window.dispatchEvent(new HashChangeEvent("hashchange"));
                }}>
                {label}
              </Link>
            ))}
          </span>
        </nav>
        <div className="topbar-actions">
          {["superadmin", "region_admin", "editor"].includes(user.role) && (
            <Link
              className="import-data"
              href={pagePath(locale, "imports")}
              title={tr("nav.import")}
              aria-label={tr("nav.import")}
            >
              <FileUp size={15} />
              <span>{tr("nav.import")}</span>
            </Link>
          )}
          <a
            className="excel-export"
            href={`/api/export?${query}`}
            title={tr("nav.export")}
            aria-label={tr("nav.export")}
          >
            <Download size={15} />
            <span>{tr("nav.export")}</span>
          </a>
          <AccountMenu user={user} onLogout={onLogout} />
          <LanguageSwitcher />
        </div>
      </header>
      {children}
    </>
  );
}
