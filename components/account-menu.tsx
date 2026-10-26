"use client";
import { useI18n } from "@/components/i18n-provider";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  LogOut,
  Settings2,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { pagePath, sectionPath } from "@/lib/routes";
import { canEdit, canManageUsers, canView } from "@/lib/permissions";
import { entities } from "@/lib/entities";
import type { User } from "@/lib/types";

export function AccountMenu({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => Promise<void>;
}) {
  const { tr, display, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const signingOut = useRef(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const signOut = async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    setBusy(true);
    setError(false);
    try {
      await onLogout();
    } catch {
      setError(true);
    } finally {
      signingOut.current = false;
      setBusy(false);
    }
  };
  return (
    <div
      className="apac-account"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="account-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className="account-avatar" aria-hidden="true">
          {user.name.trim().slice(0, 1).toUpperCase()}
        </span>
        <span className="account-trigger-name">{user.name}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          className="account-popover"
          aria-label={tr("account.label")}
        >
          <div className="account-identity">
            <strong>{user.name}</strong>
            <small>{user.email}</small>
            <span className="account-role">
              <ShieldCheck size={13} aria-hidden="true" />
              {display(user.role)} · {display(user.region)}
            </span>
          </div>
          <details className="account-permissions">
            <summary>{tr("account.permissions")}</summary>
            <div>
              {entities
                .filter((entity) => canView(user, entity))
                .map((entity) => (
                  <p key={entity.id}>
                    <strong>{entity.code}</strong>
                    <span>
                      {tr(
                        canEdit(user, entity)
                          ? "account.viewEdit"
                          : "common.view",
                      )}
                    </span>
                  </p>
                ))}
            </div>
            {!entities.some((entity) => canView(user, entity)) && (
              <p>{tr("common.noAccess")}</p>
            )}
          </details>
          <nav className="account-page-links" aria-label={tr("nav.area")}>
            <Link
              href={pagePath(locale, "home")}
              onClick={() => setOpen(false)}
            >
              {tr("nav.home")}
            </Link>
            <Link
              href={pagePath(locale, "overview")}
              onClick={() => setOpen(false)}
            >
              {tr("nav.overview")}
            </Link>
            <Link
              href={sectionPath(locale, "analysis")}
              onClick={() => setOpen(false)}
            >
              {tr("nav.analysis")}
            </Link>
            <Link
              href={sectionPath(locale, "business-units")}
              onClick={() => setOpen(false)}
            >
              {tr("nav.entities")}
            </Link>
            <Link
              href={sectionPath(locale, "management-checks")}
              onClick={() => setOpen(false)}
            >
              {tr("nav.checks")}
            </Link>
          </nav>
          {canManageUsers(user) && (
            <Link
              className="account-action"
              href={pagePath(locale, "admin")}
              onClick={() => setOpen(false)}
            >
              <Settings2 size={15} aria-hidden="true" />
              {tr("account.manage")}
            </Link>
          )}
          <button
            className="account-action account-signout"
            disabled={busy}
            onClick={() => void signOut()}
          >
            {busy ? (
              <LoaderCircle
                className="ui-spinner"
                size={15}
                aria-hidden="true"
              />
            ) : (
              <LogOut size={15} aria-hidden="true" />
            )}
            {tr(busy ? "account.signingOut" : "account.signOut")}
          </button>
          {error && (
            <p className="ui-feedback error" role="alert">
              {tr("account.signOutError")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
