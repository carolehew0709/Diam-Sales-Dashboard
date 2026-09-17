"use client";
import { useI18n } from "@/components/i18n-provider";
import { useState } from "react";
import { canManageUsers } from "@/lib/permissions";
import type { User } from "@/lib/types";
export function AccountMenu({
  user,
  onAdmin,
  onLogout,
}: {
  user: User;
  onAdmin: () => void;
  onLogout: () => void;
}) {
  const { tr, display } = useI18n();
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
          {canManageUsers(user) && (
            <button
              onClick={() => {
                setOpen(false);
                onAdmin();
              }}
            >
              {tr("account.manage")}
            </button>
          )}
          <button onClick={onLogout}>{tr("account.signOut")}</button>
        </div>
      )}
    </div>
  );
}
