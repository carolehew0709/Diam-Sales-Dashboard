"use client";
import { useI18n } from "@/components/i18n-provider";
import { useEffect, useState } from "react";
import { entities } from "@/lib/entities";
import type { User } from "@/lib/types";
export function AdminPanel({ onClose }: { onClose: () => void }) {
  const { tr, display } = useI18n();
  const [users, setUsers] = useState<User[]>([]),
    [active, setActive] = useState<User | null>(null),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState("");
  const load = async () => {
    const r = await fetch("/api/admin/users");
    const j = await r.json();
    if (j.ok) setUsers(j.users);
    else setMessage(j.error);
  };
  useEffect(() => {
    void load();
  }, []);
  const save = async () => {
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...active, ...(password ? { password } : {}) }),
    });
    const j = await r.json();
    setMessage(j.ok ? tr("admin.saved") : j.error);
    if (j.ok) {
      setActive(j.user);
      setPassword("");
      void load();
    }
  };
  return (
    <section className="panel apac-workspace">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{tr("admin.access")}</p>
          <h2>{tr("account.manage")}</h2>
        </div>
        <button className="apac-button" onClick={onClose}>
          {tr("common.backDashboard")}
        </button>
      </div>
      <div className="admin-grid">
        <div>
          {users.map((u) => (
            <button
              className="user-row"
              key={u.id}
              onClick={() => {
                setActive(u);
                setPassword("");
              }}
            >
              <strong>{u.name}</strong>
              <small>{display(u.role)}</small>
            </button>
          ))}
          <button
            className="apac-button"
            onClick={() =>
              setActive({
                id: "",
                name: "",
                email: "",
                role: "viewer",
                region: "APAC",
                crossRegionView: false,
                permissions: {},
              })
            }
          >
            {tr("admin.add")}
          </button>
        </div>
        {active && (
          <div>
            <div className="form-grid">
              <label>
                {tr("common.name")}
                <input
                  value={active.name}
                  onChange={(e) =>
                    setActive({ ...active, name: e.target.value })
                  }
                />
              </label>
              <label>
                {tr("common.email")}
                <input
                  type="email"
                  value={active.email}
                  onChange={(e) =>
                    setActive({ ...active, email: e.target.value })
                  }
                />
              </label>
              <label>
                {tr("common.role")}
                <select
                  value={active.role}
                  onChange={(e) =>
                    setActive({
                      ...active,
                      role: e.target.value as User["role"],
                    })
                  }
                >
                  {[
                    "superadmin",
                    "region_admin",
                    "editor",
                    "viewer",
                    "audit_viewer",
                  ].map((r) => (
                    <option key={r} value={r}>
                      {display(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {active.id ? tr("admin.password") : tr("common.password")}
                <input
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </div>
            <table className="bu-table">
              <thead>
                <tr>
                  <th>{tr("common.entity")}</th>
                  <th>{tr("common.view")}</th>
                  <th>{tr("common.edit")}</th>
                </tr>
              </thead>
              <tbody>
                {entities.map((e) => (
                  <tr key={e.id}>
                    <td>{e.code}</td>
                    {(["view", "edit"] as const).map((p) => (
                      <td key={p}>
                        <input
                          type="checkbox"
                          aria-label={`${e.code} ${display(p)}`}
                          checked={
                            active.permissions[e.id]?.includes(p) ?? false
                          }
                          onChange={(event) => {
                            let values = active.permissions[e.id] ?? [];
                            values = event.target.checked
                              ? [
                                  ...new Set([
                                    ...values,
                                    p,
                                    ...(p === "edit" ? ["view" as const] : []),
                                  ]),
                                ]
                              : values.filter(
                                  (v) =>
                                    v !== p && (p !== "view" || v !== "edit"),
                                );
                            setActive({
                              ...active,
                              permissions: {
                                ...active.permissions,
                                [e.id]: values,
                              },
                            });
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="apac-button primary" onClick={() => void save()}>
              {tr("admin.save")}
            </button>
          </div>
        )}
      </div>
      {message && <p role="status">{display(message)}</p>}
    </section>
  );
}
