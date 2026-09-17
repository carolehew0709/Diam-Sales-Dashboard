"use client";
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
            {user.role} · {user.region}
          </small>
          <details>
            <summary>My permissions</summary>
            {Object.entries(user.permissions).map(([id, p]) => (
              <p key={id}>
                {id.toUpperCase()}: {p.join(", ") || "No access"}
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
              Accounts & permissions
            </button>
          )}
          <button onClick={onLogout}>Sign out</button>
        </div>
      )}
    </div>
  );
}
