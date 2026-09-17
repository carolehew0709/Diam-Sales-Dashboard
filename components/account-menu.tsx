"use client";
import { useI18n } from "@/components/i18n-provider";
import { useState } from "react";
import Link from "next/link";
import { pagePath, sectionPath } from "@/lib/routes";
import { canManageUsers } from "@/lib/permissions";
import type { User } from "@/lib/types";
export function AccountMenu({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const { tr, display, locale } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="apac-account">
      <button
        className="account-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {user.name} ▾
      </button>
      {open && (
        <div className="account-popover">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
          <small>
            {display(user.role)} · {display(user.region)}
          </small>
          <details>
            <summary>{tr("account.permissions")}</summary>
            {Object.entries(user.permissions).map(([id, p]) => (
              <p key={id}>
                {id.toUpperCase()}:{" "}
                {p.map(display).join(", ") || tr("common.noAccess")}
              </p>
            ))}
          </details>
          <nav className="account-page-links" aria-label={tr("nav.area")}>
            <Link href={pagePath(locale, "overview")} onClick={() => setOpen(false)}>{tr("nav.overview")}</Link>
            <Link href={sectionPath(locale, "analysis")} onClick={() => setOpen(false)}>{tr("nav.analysis")}</Link>
            <Link href={sectionPath(locale, "business-units")} onClick={() => setOpen(false)}>{tr("nav.entities")}</Link>
            <Link href={sectionPath(locale, "management-checks")} onClick={() => setOpen(false)}>{tr("nav.checks")}</Link>
            <Link href={pagePath(locale, "brand")} onClick={() => setOpen(false)}>{tr("nav.brand")}</Link>
          </nav>
          {canManageUsers(user) && (
            <Link href={pagePath(locale, "admin")}
              onClick={() => {
                setOpen(false);
              }}
            >
              {tr("account.manage")}
            </Link>
          )}
          <button onClick={onLogout}>{tr("account.signOut")}</button>
        </div>
      )}
    </div>
  );
}
