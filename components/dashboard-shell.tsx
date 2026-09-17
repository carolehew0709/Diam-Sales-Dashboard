"use client";
import { useI18n } from "@/components/i18n-provider";
import Image from "next/image";
import Link from "next/link";
import { pagePath, type Page } from "@/lib/routes";
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
  const query = new URLSearchParams(
    Object.entries(filters).map(([k, v]) => [k, String(v)]),
  );
  return (
    <>
      <header className="topbar">
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
              <Link key={id} href={pagePath(locale, id as Page)} aria-current={page === id ? "page" : undefined}>
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
