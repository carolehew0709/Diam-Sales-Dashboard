"use client";
import { useEffect, useState } from "react";
import { entities } from "@/lib/entities";
import { canEdit, canPublish } from "@/lib/permissions";
import { formatK, months } from "@/lib/dashboard";
import type { ImportBatch, User } from "@/lib/types";
const emptyLine = () => ({
  product: "",
  customer: "",
  customerType: "External",
  total2026: "0",
  total2027: "0",
  monthly2026: Array(12).fill("0") as string[],
  monthly2027: Array(12).fill("0") as string[],
});
export function ImportPortal({
  currentUser,
  onClose,
  onPublished,
  writable,
}: {
  currentUser: User;
  onClose: () => void;
  onPublished: () => void;
  writable: boolean;
}) {
  const editable = entities.filter((e) => canEdit(currentUser, e));
  const [form, setForm] = useState({
    entityId: editable[0]?.id ?? "",
    year: "2026",
    week: "36",
    month: "9",
    turnoverExternal: "",
    turnoverGroup: "",
    monthTurnoverExternal: "",
    monthTurnoverGroup: "",
    monthEstimateExternal: "",
    monthEstimateGroup: "",
    prospect: "",
    nextProspect: "",
    annualBudget: "",
    nextAnnualBudget: "",
    source: "",
  });
  const [lines, setLines] = useState<ReturnType<typeof emptyLine>[]>([]),
    [batches, setBatches] = useState<ImportBatch[]>([]),
    [review, setReview] = useState<ImportBatch | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [ack, setAck] = useState(false);
  const load = async () => {
    try {
      const j = await (await fetch("/api/import/batches")).json();
      if (j.ok) setBatches(j.batches);
      else setMessage(j.error);
    } catch {
      setMessage("Unable to load review batches");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const request = async (url: string, init: RequestInit) => {
    setBusy(true);
    setMessage("");
    try {
      const j = await (await fetch(url, init)).json();
      if (!j.ok) throw new Error(j.error);
      setReview(j.batch);
      setAck(false);
      await load();
      return j;
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = () =>
    request("/api/import/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, lines }),
    });
  const publish = async () => {
    const j = await request("/api/import/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: review?.id, acknowledge: ack }),
    });
    if (j) {
      setMessage(
        "Snapshot published. Dashboard and exports now read this revision.",
      );
      onPublished();
    }
  };
  return (
    <section className="apac-workspace">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Weekly import center</p>
          <h1>Review and publish data</h1>
          <p>
            Validate entity workbooks or manual entries, review source
            limitations, then publish.
          </p>
        </div>
        <button className="apac-button" onClick={onClose}>
          Back to dashboard
        </button>
      </div>
      {!writable && (
        <p className="apac-notice">
          Persistent storage is not configured. Import and publication are
          unavailable until a database is connected.
        </p>
      )}
      <div className="dashboard-grid dashboard-grid-secondary">
        <section className="panel">
          <p className="panel-kicker">Step 01 · Excel</p>
          <h2>Upload workbook</h2>
          <p className="muted">
            W1–W52 entity workbook or Global Follow Up. Original files are
            preserved.
          </p>
          <label className="upload-zone">
            Choose .xlsx workbook
            <input
              type="file"
              accept=".xlsx"
              disabled={!writable || busy || !editable.length}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const body = new FormData();
                  body.append("file", f);
                  void request("/api/import/analyze", { method: "POST", body });
                }
              }}
            />
          </label>
        </section>
        <section className="panel">
          <p className="panel-kicker">Manual submission · kEUR</p>
          <h2>Entity and reporting period</h2>
          <div className="form-grid">
            <label>
              Entity
              <select
                value={form.entityId}
                onChange={(e) => setForm({ ...form, entityId: e.target.value })}
              >
                {editable.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} · {e.description}
                  </option>
                ))}
              </select>
            </label>
            {[
              ["week", "ISO week"],
              ["month", "Reporting month"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Step 01 · Manual</p>
            <h2>Sales and annual planning</h2>
            <p>
              Enter zero only when confirmed; leave unavailable budgets and
              Prospect blank.
            </p>
          </div>
        </div>
        <div className="form-grid">
          {[
            ["turnoverExternal", "YTD invoiced · external"],
            ["turnoverGroup", "YTD invoiced · group"],
            ["monthTurnoverExternal", "MTD invoiced · external"],
            ["monthTurnoverGroup", "MTD invoiced · group"],
            ["monthEstimateExternal", "Full-month estimate · external"],
            ["monthEstimateGroup", "Full-month estimate · group"],
            ["annualBudget", "Annual Dashboard 2026"],
            ["prospect", "Prospect 2026"],
            ["nextAnnualBudget", "Annual Dashboard 2027"],
            ["nextProspect", "Prospect 2027"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                inputMode="decimal"
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="wide">
            Source note
            <input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </label>
        </div>
        <div className="panel-heading">
          <h2>Committed orderbook</h2>
          <button
            className="apac-button"
            onClick={() => setLines([...lines, emptyLine()])}
          >
            Add order line
          </button>
        </div>
        {!lines.length && (
          <p className="muted">
            No order lines. Submitting this state explicitly records zero
            committed orderbook.
          </p>
        )}
        {lines.map((line, index) => (
          <fieldset className="order-entry" key={index}>
            <legend>Order {index + 1}</legend>
            <div className="form-grid">
              {(["product", "customer", "total2026", "total2027"] as const).map(
                (key) => (
                  <label key={key}>
                    {key}
                    <input
                      value={line[key]}
                      onChange={(e) =>
                        setLines(
                          lines.map((l, i) =>
                            i === index ? { ...l, [key]: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  </label>
                ),
              )}
              <label>
                Sales type
                <select
                  value={line.customerType}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, i) =>
                        i === index
                          ? { ...l, customerType: e.target.value }
                          : l,
                      ),
                    )
                  }
                >
                  <option>External</option>
                  <option>Group</option>
                </select>
              </label>
              <button
                className="apac-button"
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
              >
                Remove line
              </button>
            </div>
            {(["monthly2026", "monthly2027"] as const).map((key) => (
              <div className="allocation" key={key}>
                <strong>{key.slice(-4)} allocation</strong>
                <div>
                  {months.map((m, i) => (
                    <label key={m}>
                      {m}
                      <input
                        aria-label={`Order ${index + 1} ${m} ${key.slice(-4)}`}
                        inputMode="decimal"
                        value={line[key][i]}
                        onChange={(e) =>
                          setLines(
                            lines.map((l, j) =>
                              j === index
                                ? {
                                    ...l,
                                    [key]: l[key].map((v, k) =>
                                      k === i ? e.target.value : v,
                                    ),
                                  }
                                : l,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        ))}
        <button
          className="apac-button primary"
          disabled={busy || !writable || !editable.length}
          onClick={() => void submit()}
        >
          Analyze manual submission
        </button>
      </section>
      {review && (
        <section className="panel review-panel">
          <p className="panel-kicker">Step 02 · Review</p>
          <h2>{review.fileName}</h2>
          <p>
            {review.snapshots.length} entity-week snapshots ·{" "}
            {review.lines.length} order lines · {review.status}
          </p>
          <div className="table-wrap">
            <table className="bu-table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Week</th>
                  <th>YTD external</th>
                  <th>YTD group</th>
                  <th>Prospect</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {review.snapshots.map((s) => (
                  <tr key={`${s.entityId}:${s.week}`}>
                    <td>{s.entityId.toUpperCase()}</td>
                    <td>W{s.week}</td>
                    <td>{formatK(s.turnover.external)}</td>
                    <td>{formatK(s.turnover.group)}</td>
                    <td>{formatK(s.prospect)}</td>
                    <td>{s.sourceSheet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="findings-list">
            {review.findings.map((f, i) => (
              <li key={i}>
                <b>{f.severity === "error" ? "Error" : "Review"}:</b>{" "}
                {f.message}
              </li>
            ))}
          </ul>
          {review.status === "review" && (
            <>
              <label className="acknowledge">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                I have reviewed the source limitations. Missing values remain
                visible.
              </label>
              <button
                className="apac-button primary"
                disabled={
                  busy ||
                  !writable ||
                  review.findings.some((f) => f.severity === "error") ||
                  (!ack && review.findings.length > 0) ||
                  !review.entityIds.every((id) =>
                    entities.some(
                      (e) => e.id === id && canPublish(currentUser, e),
                    ),
                  )
                }
                onClick={() => void publish()}
              >
                Publish reviewed snapshot
              </button>
            </>
          )}
        </section>
      )}
      {message && (
        <p className="apac-notice" role="status">
          {message}
        </p>
      )}
      <section className="panel">
        <p className="panel-kicker">Import history</p>
        <h2>Review batches and revisions</h2>
        {!batches.length ? (
          <p>No submissions yet.</p>
        ) : (
          batches.map((b) => (
            <button
              className="batch-row"
              key={b.id}
              onClick={() => {
                setReview(b);
                setAck(false);
              }}
            >
              <strong>{b.fileName}</strong>
              <span>
                {b.entityIds.map((id) => id.toUpperCase()).join(", ")}
              </span>
              <span>
                {b.status}
                {b.revision ? ` · revision ${b.revision}` : ""}
              </span>
              <small>{new Date(b.submittedAt).toLocaleString()}</small>
            </button>
          ))
        )}
      </section>
    </section>
  );
}
