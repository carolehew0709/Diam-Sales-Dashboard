"use client";
import { useI18n } from "@/components/i18n-provider";
import Image from "next/image";
import Link from "next/link";
import {
  isSalesPage,
  pagePath,
  salesPageLabels,
  salesPages,
  type Page,
} from "@/lib/routes";
import { useDashboardNavigation } from "./use-dashboard-navigation";
import { FileUp, House } from "lucide-react";
import type { User } from "@/lib/types";
import { AccountMenu } from "./account-menu";
import { LanguageSwitcher } from "./language-switcher";
import { hasReceivablesAccess } from "@/lib/receivables";
import { hasPipelineAccess } from "@/lib/pipeline";
import { canAccessModule, canExportData } from "@/lib/permissions";
import { ExportAccess } from "./export-access";
import styles from "./dashboard-shell.module.css";
export function DashboardShell({
  user,
  onLogout,
  page,
  salesExport,
  children,
}: {
  user: User;
  onLogout: () => Promise<void>;
  page: Page;
  salesExport?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { tr, locale } = useI18n();
  const header = useDashboardNavigation(page, locale);
  const onSalesPage = isSalesPage(page);
  const salesAccess = canAccessModule(user, "overview");
  const quotation = page === "quotation";
  const pipeline = page === "pipeline";
  const salesOps = page === "sales-operations";
  const standalone = quotation || pipeline || salesOps;
  return (
    <ExportAccess.Provider value={canExportData(user)}>
      <header
        className={`topbar dashboard-header ${styles.header} ${page === "home" || standalone ? "home-header" : ""}`}
        ref={header}
      >
        <div className="brand">
          <Link
            className="brand-home"
            href={pagePath(locale, "home")}
            aria-label={tr("home.title")}
          >
            <Image
              className="brand-logo"
              src="/diam-logo.png"
              width={92}
              height={30}
              alt="DIAM"
            />
          </Link>
          <span className="brand-divider" />
        </div>
        <nav
          className={`product-switcher ${styles.modules}`}
          aria-label={tr("nav.area")}
        >
          <Link
            href={pagePath(locale, "home")}
            aria-current={page === "home" ? "page" : undefined}
          >
            <House size={13} aria-hidden="true" /> {tr("nav.home")}
          </Link>
          {salesAccess && <Link
            href={pagePath(locale, "overview")}
            aria-current={onSalesPage ? "page" : undefined}
          >
            {tr("nav.performance")}
          </Link>}
          {hasReceivablesAccess(user) && (
            <Link
              href={pagePath(locale, "ar-aging")}
              scroll={false}
              onNavigate={() =>
                window.scrollTo({ top: 0, behavior: "instant" })
              }
              aria-current={page === "ar-aging" ? "page" : undefined}
            >
              {tr("ar.nav")}
            </Link>
          )}
          {quotation && canAccessModule(user, "quotation") && (
            <Link href={pagePath(locale, "quotation")} aria-current="page">
              {tr("quote.title")}
            </Link>
          )}
          {hasPipelineAccess(user) && (
            <Link
              href={pagePath(locale, "pipeline")}
              aria-current={pipeline ? "page" : undefined}
            >
              {tr("pipeline.title")}
            </Link>
          )}
          {canAccessModule(user, "sales-operations") && <Link
            href={pagePath(locale, "sales-operations")}
            aria-current={salesOps ? "page" : undefined}
          >
            {tr("nav.salesOperations")}
          </Link>}
        </nav>
        {onSalesPage && salesAccess && (
          <nav className="topnav" aria-label={tr("nav.performance")}>
            <span className="topnav-links">
              {salesPages.map((destination) => (
                <Link
                  key={destination}
                  href={pagePath(locale, destination)}
                  scroll={false}
                  aria-current={page === destination ? "page" : undefined}
                  onNavigate={() => {
                    if (page !== destination) window.scrollTo({ top: 0, behavior: "instant" });
                  }}
                >
                  {tr(salesPageLabels[destination])}
                </Link>
              ))}
            </span>
          </nav>
        )}
        <div className="topbar-actions">
          {page !== "home" &&
            !standalone &&
            ["superadmin", "region_admin", "editor"].includes(user.role) && (
              <Link
                className="import-data"
                href={
                  pagePath(locale, "imports") +
                  `?from=${page === "ar-aging" || onSalesPage ? page : "overview"}`
                }
                title={tr("nav.import")}
                aria-label={tr("nav.import")}
              >
                <FileUp size={15} />
                <span>{tr("nav.import")}</span>
              </Link>
            )}
          {salesExport}
          <AccountMenu user={user} onLogout={onLogout} />
          <LanguageSwitcher />
        </div>
      </header>
      {children}
    </ExportAccess.Provider>
  );
}
