"use client";
import Image from "next/image";
import { Download, FileUp } from "lucide-react";
import type { Filters, User } from "@/lib/types";
import { AccountMenu } from "./account-menu";
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
          <nav className="product-switcher" aria-label="Dashboard area">
            <a href="#overview" aria-current="page" onClick={onOverview}>
              Sales Performance
            </a>
            <button onClick={onBrand}>Sales by Brand (BO)</button>
          </nav>
        </div>
        <nav className="topnav">
          <span className="topnav-links">
            {[
              ["overview", "Executive overview"],
              ["analysis", "Analysis"],
              ["business-units", "Business Units Entities"],
              ["data-quality", "Management checks"],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={onOverview}>
                {label}
              </a>
            ))}
          </span>
        </nav>
        <div className="topbar-actions">
          {["superadmin", "region_admin", "editor"].includes(user.role) && (
            <button className="import-data" onClick={onImport}>
              <FileUp size={15} />
              <span>Import Data</span>
            </button>
          )}
          <a className="excel-export" href={`/api/export?${query}`}>
            <Download size={15} />
            <span>Export Excel</span>
          </a>
          <AccountMenu user={user} onAdmin={onAdmin} onLogout={onLogout} />
        </div>
      </header>
      {children}
    </>
  );
}
