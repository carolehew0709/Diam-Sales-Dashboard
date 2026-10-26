"use client";
import { useI18n } from "@/components/i18n-provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Plus, Search, ShieldCheck } from "lucide-react";
import { entities } from "@/lib/entities";
import { canEdit, canView } from "@/lib/permissions";
import type { User } from "@/lib/types";

type Draft = { user: User; password: string };
const newUser = (): User => ({
  id: "",
  name: "",
  email: "",
  role: "viewer",
  region: "APAC",
  crossRegionView: false,
  permissions: {},
});
export function AdminPanel({ onClose }: { onClose: () => void }) {
  const { tr, display } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const savingRef = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/admin/users", { signal });
        const result = await response.json();
        if (!response.ok || !result.ok)
          throw new Error(result.error || tr("admin.loadError"));
        if (signal?.aborted) return;
        setUsers(result.users);
        setSelected((current) => current ?? result.users[0]?.id ?? null);
      } catch (error) {
        if (!signal?.aborted)
          setLoadError(
            error instanceof TypeError
              ? tr("admin.loadError")
              : (error as Error).message,
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [tr],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const original = users.find((user) => user.id === selected);
  const draft = selected === null ? undefined : drafts[selected];
  const active = draft?.user ?? original;
  const password = draft?.password ?? "";
  const dirty =
    !!active &&
    (password !== "" ||
      JSON.stringify(active) !== JSON.stringify(original ?? newUser()));
  const edit = (patch: Partial<User>, nextPassword = password) => {
    if (!active || selected === null) return;
    setDrafts((current) => ({
      ...current,
      [selected]: { user: { ...active, ...patch }, password: nextPassword },
    }));
    setFeedback(null);
  };
  const select = (id: string) => {
    setSelected(id);
    setFeedback(null);
  };
  const add = () => {
    setDrafts((current) =>
      current.new
        ? current
        : { ...current, new: { user: newUser(), password: "" } },
    );
    select("new");
    requestAnimationFrame(() => nameInput.current?.focus());
  };
  const save = async () => {
    if (!active || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFeedback(null);
    const key = selected!;
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...active,
          name: active.name.trim(),
          email: active.email.trim(),
          ...(password ? { password } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(result.error || tr("admin.saveError"));
      setUsers((current) =>
        current.some((user) => user.id === result.user.id)
          ? current.map((user) =>
              user.id === result.user.id ? result.user : user,
            )
          : [...current, result.user],
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setSelected(result.user.id);
      setFeedback({ kind: "success", text: tr("admin.saved") });
    } catch (error) {
      setFeedback({
        kind: "error",
        text:
          error instanceof TypeError
            ? tr("admin.saveError")
            : (error as Error).message,
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const filtered = users.filter((user) =>
    `${user.name} ${user.email}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <section className="panel apac-workspace admin-workspace">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{tr("admin.access")}</p>
          <h2>{tr("account.manage")}</h2>
          <p className="muted">{tr("admin.intro")}</p>
        </div>
        <button className="apac-button" disabled={saving} onClick={onClose}>
          {tr("common.backDashboard")}
        </button>
      </div>
      <div className="admin-grid">
        <aside className="admin-directory" aria-label={tr("account.manage")}>
          <div className="admin-directory-heading">
            <strong>{tr("admin.accounts", { count: users.length })}</strong>
            <button
              className="apac-button"
              disabled={loading || saving || !!loadError}
              onClick={add}
            >
              <Plus size={14} aria-hidden="true" />
              {tr("admin.add")}
            </button>
          </div>
          <label className="admin-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("admin.search")}
              aria-label={tr("admin.search")}
            />
          </label>
          {loading && (
            <p className="ui-feedback" role="status">
              <LoaderCircle
                className="ui-spinner"
                size={15}
                aria-hidden="true"
              />
              {tr("admin.loading")}
            </p>
          )}
          {loadError && (
            <div className="ui-feedback error" role="alert">
              <p>{display(loadError)}</p>
              <button className="apac-button" onClick={() => void load()}>
                {tr("common.retry")}
              </button>
            </div>
          )}
          <div className="admin-user-list">
            {drafts.new && (
              <button
                className="user-row"
                disabled={saving}
                aria-pressed={selected === "new"}
                onClick={() => select("new")}
              >
                <span className="user-avatar">
                  <Plus size={18} aria-hidden="true" />
                </span>
                <span className="user-row-copy">
                  <strong>
                    {drafts.new.user.name || tr("admin.newAccount")}
                  </strong>
                  <small>{tr("admin.unsaved")}</small>
                </span>
              </button>
            )}
            {filtered.map((user) => (
              <button
                className="user-row"
                key={user.id}
                disabled={saving}
                aria-pressed={selected === user.id}
                onClick={() => select(user.id)}
              >
                <span className="user-avatar" aria-hidden="true">
                  {user.name.trim().slice(0, 1).toUpperCase()}
                </span>
                <span className="user-row-copy">
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                  <span className="user-role-label">
                    {display(user.role)}
                    {user.disabled ? ` · ${tr("admin.disabled")}` : ""}
                    {drafts[user.id] &&
                    (drafts[user.id].password ||
                      JSON.stringify(drafts[user.id].user) !==
                        JSON.stringify(user))
                      ? ` · ${tr("admin.unsaved")}`
                      : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {!loading && !loadError && !filtered.length && (
            <p className="muted">
              {tr(query ? "admin.noMatches" : "admin.empty")}
            </p>
          )}
          <p className="admin-draft-note">{tr("admin.draftNote")}</p>
        </aside>
        {active ? (
          <form
            className="admin-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="admin-editor-heading">
              <span className="user-avatar" aria-hidden="true">
                <ShieldCheck size={21} />
              </span>
              <div>
                <h3>{active.id ? active.name : tr("admin.newAccount")}</h3>
                <p className="muted">
                  {active.id ? active.email : tr("admin.newHint")}
                </p>
              </div>
              {dirty && (
                <span className="draft-badge">{tr("admin.unsaved")}</span>
              )}
            </div>
            <fieldset className="admin-fields" disabled={saving}>
              <legend className="sr-only">{tr("admin.details")}</legend>
              <div className="form-grid">
                <label>
                  {tr("common.name")}
                  <input
                    ref={nameInput}
                    required
                    value={active.name}
                    onChange={(event) => edit({ name: event.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label>
                  {tr("common.email")}
                  <input
                    type="email"
                    required
                    value={active.email}
                    onChange={(event) => edit({ email: event.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label>
                  {tr("common.role")}
                  <select
                    value={active.role}
                    onChange={(event) =>
                      edit({ role: event.target.value as User["role"] })
                    }
                  >
                    {(
                      [
                        "superadmin",
                        "region_admin",
                        "editor",
                        "viewer",
                        "audit_viewer",
                      ] as const
                    ).map((role) => (
                      <option key={role} value={role}>
                        {display(role)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr(active.id ? "admin.password" : "common.password")}
                  <input
                    type="password"
                    required={!active.id}
                    minLength={12}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => edit({}, event.target.value)}
                    aria-describedby="admin-password-hint"
                  />
                  <small id="admin-password-hint">
                    {tr("admin.passwordHint")}
                  </small>
                </label>
              </div>
              <div className="admin-scope-heading">
                <h3>{tr("admin.entityAccess")}</h3>
                <p className="muted">
                  {tr(
                    active.role === "superadmin"
                      ? "admin.superadminHint"
                      : active.role === "region_admin"
                        ? "admin.regionHint"
                        : active.role === "editor"
                          ? "admin.editorHint"
                          : "admin.viewerHint",
                  )}
                </p>
              </div>
              <div className="table-wrap">
                <table className="bu-table admin-permissions-table">
                  <thead>
                    <tr>
                      <th>{tr("common.entity")}</th>
                      <th>{tr("common.view")}</th>
                      <th>{tr("common.edit")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities.map((entity) => (
                      <tr key={entity.id}>
                        <td>
                          <strong>{entity.code}</strong>
                          <small>{display(entity.description)}</small>
                        </td>
                        {(["view", "edit"] as const).map((permission) => (
                          <td key={permission}>
                            <input
                              type="checkbox"
                              aria-label={`${entity.code} ${display(permission)}`}
                              checked={
                                permission === "view"
                                  ? canView(active, entity)
                                  : canEdit(active, entity)
                              }
                              disabled={
                                !!active.disabled ||
                                active.role === "superadmin" ||
                                (permission === "edit" &&
                                  !["region_admin", "editor"].includes(
                                    active.role,
                                  ))
                              }
                              onChange={(event) => {
                                const current =
                                  active.permissions[entity.id] ?? [];
                                const values = event.target.checked
                                  ? [
                                      ...new Set([
                                        ...current,
                                        permission,
                                        ...(permission === "edit"
                                          ? ["view" as const]
                                          : []),
                                      ]),
                                    ]
                                  : current.filter(
                                      (value) =>
                                        value !== permission &&
                                        (permission !== "view" ||
                                          value !== "edit"),
                                    );
                                edit({
                                  permissions: {
                                    ...active.permissions,
                                    [entity.id]: values,
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
              </div>
            </fieldset>
            <div className="admin-save-bar">
              <span
                role="status"
                className={`ui-feedback ${feedback?.kind ?? ""}`}
              >
                {feedback?.kind === "success" && (
                  <Check size={16} aria-hidden="true" />
                )}
                {feedback
                  ? display(feedback.text)
                  : dirty
                    ? tr("admin.pendingChanges")
                    : tr("admin.upToDate")}
              </span>
              <div>
                <button
                  type="button"
                  className="apac-button"
                  disabled={!dirty || saving}
                  onClick={() => {
                    setDrafts((current) => {
                      const next = { ...current };
                      if (selected === "new")
                        next.new = { user: newUser(), password: "" };
                      else delete next[selected!];
                      return next;
                    });
                    setFeedback(null);
                  }}
                >
                  {tr("admin.reset")}
                </button>
                <button
                  type="submit"
                  className="apac-button primary"
                  disabled={
                    saving ||
                    !dirty ||
                    !active.name.trim() ||
                    !active.email.trim()
                  }
                >
                  {saving && (
                    <LoaderCircle
                      className="ui-spinner"
                      size={15}
                      aria-hidden="true"
                    />
                  )}
                  {tr(saving ? "admin.saving" : "admin.save")}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="admin-empty">
            <ShieldCheck size={32} aria-hidden="true" />
            <h3>{tr("account.manage")}</h3>
            <p>{tr(loading ? "admin.loading" : "admin.selectAccount")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
