"use client";
import { useI18n } from "@/components/i18n-provider";
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
  const { tr, display, locale } = useI18n();
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
      setMessage(tr("import.loadError"));
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
      setMessage(tr("import.published"));
      onPublished();
    }
  };
  return (
    <section className="apac-workspace">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{tr("import.center")}</p>
          <h1>{tr("import.title")}</h1>
          <p>{tr("import.subtitle")}</p>
        </div>
        <button className="apac-button" onClick={onClose}>
          {tr("common.backDashboard")}
        </button>
      </div>
      {!writable && <p className="apac-notice">{tr("import.storage")}</p>}
      <div className="dashboard-grid dashboard-grid-secondary">
        <section className="panel">
          <p className="panel-kicker">{tr("import.excelStep")}</p>
          <h2>{tr("import.upload")}</h2>
          <p className="muted">{tr("import.workbookNote")}</p>
          <label className="upload-zone">
            {tr("import.choose")}
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
          <p className="panel-kicker">{tr("import.manualUnit")}</p>
          <h2>{tr("import.period")}</h2>
          <div className="form-grid">
            <label>
              {tr("common.entity")}
              <select
                value={form.entityId}
                onChange={(e) => setForm({ ...form, entityId: e.target.value })}
              >
                {editable.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} · {display(e.description)}
                  </option>
                ))}
              </select>
            </label>
            {[
              ["week", tr("import.isoWeek")],
              ["month", tr("import.month")],
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
            <p className="panel-kicker">{tr("import.manualStep")}</p>
            <h2>{tr("import.planning")}</h2>
            <p>{tr("import.zeroNote")}</p>
          </div>
        </div>
        <div className="form-grid">
          {[
            ["turnoverExternal", tr("import.ytdExternal")],
            ["turnoverGroup", tr("import.ytdGroup")],
            ["monthTurnoverExternal", tr("import.mtdExternal")],
            ["monthTurnoverGroup", tr("import.mtdGroup")],
            ["monthEstimateExternal", tr("import.estimateExternal")],
            ["monthEstimateGroup", tr("import.estimateGroup")],
            ["annualBudget", tr("import.budget2026")],
            ["prospect", tr("import.prospect2026")],
            ["nextAnnualBudget", tr("import.budget2027")],
            ["nextProspect", tr("import.prospect2027")],
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
            {tr("import.sourceNote")}
            <input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </label>
        </div>
        <div className="panel-heading">
          <h2>{tr("import.orderbook")}</h2>
          <button
            className="apac-button"
            onClick={() => setLines([...lines, emptyLine()])}
          >
            {tr("import.addLine")}
          </button>
        </div>
        {!lines.length && <p className="muted">{tr("import.noLines")}</p>}
        {lines.map((line, index) => (
          <fieldset className="order-entry" key={index}>
            <legend>{tr("order.number", { number: index + 1 })}</legend>
            <div className="form-grid">
              {(["product", "customer", "total2026", "total2027"] as const).map(
                (key) => (
                  <label key={key}>
                    {display(key)}
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
                {tr("filters.type")}
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
                  <option value="External">{tr("common.external")}</option>
                  <option value="Group">{tr("common.group")}</option>
                </select>
              </label>
              <button
                className="apac-button"
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
              >
                {tr("import.remove")}
              </button>
            </div>
            {(["monthly2026", "monthly2027"] as const).map((key) => (
              <div className="allocation" key={key}>
                <strong>
                  {tr("order.allocation", { year: key.slice(-4) })}
                </strong>
                <div>
                  {months.map((m, i) => (
                    <label key={m}>
                      {display(m)}
                      <input
                        aria-label={tr("order.input", {
                          number: index + 1,
                          month: display(m),
                          year: key.slice(-4),
                        })}
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
          {tr("import.analyze")}
        </button>
      </section>
      {review && (
        <section className="panel review-panel">
          <p className="panel-kicker">{tr("import.reviewStep")}</p>
          <h2>{review.fileName}</h2>
          <p>
            {tr("import.summary", {
              snapshots: review.snapshots.length,
              lines: review.lines.length,
              status: display(review.status),
            })}
          </p>
          <div className="table-wrap">
            <table className="bu-table">
              <thead>
                <tr>
                  <th>{tr("common.entity")}</th>
                  <th>{tr("common.week")}</th>
                  <th>{tr("import.ytdExternalShort")}</th>
                  <th>{tr("import.ytdGroupShort")}</th>
                  <th>{tr("metric.prospect")}</th>
                  <th>{tr("common.source")}</th>
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
                <b>
                  {f.severity === "error"
                    ? tr("common.error")
                    : tr("common.review")}
                  :
                </b>{" "}
                {display(f.message)}
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
                {tr("import.ack")}
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
                {tr("import.publish")}
              </button>
            </>
          )}
        </section>
      )}
      {message && (
        <p className="apac-notice" role="status">
          {display(message)}
        </p>
      )}
      <section className="panel">
        <p className="panel-kicker">{tr("import.history")}</p>
        <h2>{tr("import.revisions")}</h2>
        {!batches.length ? (
          <p>{tr("import.empty")}</p>
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
                {display(b.status)}
                {b.revision
                  ? ` · ${tr("notes.revision", { revision: b.revision })}`
                  : ""}
              </span>
              <small>{new Date(b.submittedAt).toLocaleString(locale)}</small>
            </button>
          ))
        )}
      </section>
    </section>
  );
}
