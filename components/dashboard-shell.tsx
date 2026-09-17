"use client";
import { useI18n } from "@/components/i18n-provider";
import Image from "next/image";
import { Download, FileUp } from "lucide-react";
import type { Filters, User } from "@/lib/types";
import { AccountMenu } from "./account-menu";
import { LanguageSwitcher } from "./language-switcher";
export function DashboardShell({
  user,
  filters,
  onImport,
  onAdmin,
  onLogout,
  onBrand,
  onOverview,
  children,
}: {
  user: User;
  filters: Filters;
  onImport: () => void;
  onAdmin: () => void;
  onLogout: () => void;
  onBrand: () => void;
  onOverview: () => void;
  children: React.ReactNode;
}) {
  const { tr } = useI18n();
  const query = new URLSearchParams(
    Object.entries(filters).map(([k, v]) => [k, String(v)]),
  );
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <a className="brand-home" href="#overview" onClick={onOverview}>
            <Image
              className="brand-logo"
              src="/diam-logo.png"
              width={92}
              height={30}
              alt="DIAM"
            />
          </a>
          <span className="brand-divider" />
          <nav className="product-switcher" aria-label={tr("nav.area")}>
            <a href="#overview" aria-current="page" onClick={onOverview}>
              {tr("nav.performance")}
            </a>
            <button onClick={onBrand}>{tr("nav.brand")}</button>
          </nav>
        </div>
        <nav className="topnav">
          <span className="topnav-links">
            {[
              ["overview", tr("nav.overview")],
              ["analysis", tr("nav.analysis")],
              ["business-units", tr("nav.entities")],
              ["data-quality", tr("nav.checks")],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={onOverview}>
                {label}
              </a>
            ))}
          </span>
        </nav>
        <div className="topbar-actions">
          {["superadmin", "region_admin", "editor"].includes(user.role) && (
            <button
              className="import-data"
              onClick={onImport}
              title={tr("nav.import")}
              aria-label={tr("nav.import")}
            >
              <FileUp size={15} />
              <span>{tr("nav.import")}</span>
            </button>
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
          <AccountMenu user={user} onAdmin={onAdmin} onLogout={onLogout} />
          <LanguageSwitcher />
        </div>
      </header>
      {children}
    </>
  );
}
