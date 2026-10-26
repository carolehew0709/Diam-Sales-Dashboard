"use client";
import { approved2026Budgets } from "@/lib/annual-budgets";
import { useI18n } from "@/components/i18n-provider";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { entities } from "@/lib/entities";
import { canEdit, canPublish } from "@/lib/permissions";
import { formatK, months } from "@/lib/dashboard";
import type { ImportBatch, User } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n";
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
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [fileName, setFileName] = useState("");
  const [operation, setOperation] = useState<"analyze" | "publish">("analyze");
  const requestRunning = useRef(false);
  const reviewPanel = useRef<HTMLElement>(null);
  const focusReview = useRef(false);
  useEffect(() => {
    if (!review || !focusReview.current) return;
    focusReview.current = false;
    reviewPanel.current?.focus({ preventScroll: true });
    reviewPanel.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [review]);
  const load = async () => {
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const j = await (await fetch("/api/import/batches")).json();
      if (j.ok) setBatches(j.batches);
      else setHistoryError(true);
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const request = async (url: string, init: RequestInit) => {
    if (requestRunning.current) return;
    requestRunning.current = true;
    setOperation(url.endsWith("/publish") ? "publish" : "analyze");
    setBusy(true);
    setMessage("");
    try {
      const j = await (await fetch(url, init)).json();
      if (!j.ok) throw new Error(j.error);
      focusReview.current = true;
      setReview(j.batch);
      setAck(false);
      await load();
      return j;
    } catch (e) {
      setMessage(
        e instanceof TypeError
          ? tr("import.requestError")
          : (e as Error).message,
      );
    } finally {
      requestRunning.current = false;
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
      {(busy || message) && (
        <div className="import-feedback ui-feedback" role="status">
          {busy ? (
            <>
              <LoaderCircle
                className="ui-spinner"
                size={16}
                aria-hidden="true"
              />
              {tr("import.working")}
            </>
          ) : (
            display(message)
          )}
        </div>
      )}
      <div className="dashboard-grid dashboard-grid-secondary">
        <section className="panel">
          <p className="panel-kicker">{tr("import.excelStep")}</p>
          <h2>{tr("import.upload")}</h2>
          <p className="muted">{tr("import.workbookNote")}</p>
          <p className="muted">{tr("graphics.importNote")}</p>
          <label className="upload-zone">
            {tr("import.choose")}
            <input
              type="file"
              accept=".xlsx"
              disabled={!writable || busy || !editable.length}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFileName(f.name);
                  const body = new FormData();
                  body.append("file", f);
                  void request("/api/import/analyze", { method: "POST", body });
                }
                e.target.value = "";
              }}
            />
          </label>
          {fileName && (
            <p className="import-file-name">
              {tr("import.selectedFile", { name: fileName })}
            </p>
          )}
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
                  value={
                    key === "annualBudget"
                      ? (approved2026Budgets[form.entityId] ??
                        form.annualBudget)
                      : form[key as keyof typeof form]
                  }
                  readOnly={
                    key === "annualBudget" &&
                    approved2026Budgets[form.entityId] !== undefined
                  }
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
                value={
                  key === "annualBudget"
                    ? (approved2026Budgets[form.entityId] ?? form.annualBudget)
                    : form[key as keyof typeof form]
                }
                readOnly={
                  key === "annualBudget" &&
                  approved2026Budgets[form.entityId] !== undefined
                }
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          {approved2026Budgets[form.entityId] !== undefined && (
            <p className="wide muted">{tr("import.fixedBudget")}</p>
          )}
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
          {busy && operation === "analyze" && (
            <LoaderCircle className="ui-spinner" size={15} aria-hidden="true" />
          )}
          {tr(
            busy && operation === "analyze"
              ? "import.analyzing"
              : "import.analyze",
          )}
        </button>
      </section>
      {review && (
        <section
          ref={reviewPanel}
          tabIndex={-1}
          className="panel review-panel"
          aria-label={tr("import.reviewStep")}
        >
          <p className="panel-kicker">{tr("import.reviewStep")}</p>
          <h2>{review.fileName}</h2>
          {!review.customerAnalysis && (
            <p>
              {tr("import.summary", {
                snapshots: review.snapshots.length,
                lines: review.lines.length,
                status: display(review.status),
              })}
            </p>
          )}
          {review.receivables?.length ? (
            <p>
              {tr("ar.reviewRows", { count: review.receivables.length })} ·{" "}
              {tr("ar.reviewCurrency")}
            </p>
          ) : null}
          {review.customerAnalysis && (
            <div className="graphic-import-review">
              <p>
                <strong>
                  {tr("graphics.monthlySource", {
                    month: review.customerAnalysis.month,
                  })}
                </strong>{" "}
                · {review.customerAnalysis.sourceLabel} · {tr("regions.China")}{" "}
                (DEHK + DCP + DDC) · kEUR
              </p>
              <table className="bu-table">
                <thead>
                  <tr>
                    <th>{tr("common.customer")}</th>
                    <th className="numeric">
                      {review.customerAnalysis.priorYear}
                    </th>
                    <th className="numeric">{review.customerAnalysis.year}</th>
                    <th>{tr("common.source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {review.customerAnalysis.customers.map((c) => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td className="numeric">{formatK(c.prior)}</td>
                      <td className="numeric">{formatK(c.current)}</td>
                      <td>
                        {review.customerAnalysis!.customerSheet} · {c.sourceRow}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>{tr("graphics.customerRule")}</p>
            </div>
          )}
          {!review.customerAnalysis && (
            <div className="table-wrap">
              <table className="bu-table">
                <thead>
                  {review.receivables?.length ? (
                    <tr>
                      <th>{tr("common.entity")}</th>
                      <th>{tr("ar.column.date")}</th>
                      <th>{tr("ar.customer")}</th>
                      <th>{tr("team.label")}</th>
                      <th>{tr("ar.column.amount")}</th>
                      <th>{tr("common.source")}</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>{tr("common.entity")}</th>
                      <th>{tr("common.week")}</th>
                      <th>{tr("import.ytdExternalShort")}</th>
                      <th>{tr("import.ytdGroupShort")}</th>
                      <th>{tr("metric.prospect")}</th>
                      <th>{tr("common.source")}</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {review.receivables?.slice(0, 20).map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.entityId === "dhk"
                          ? "DEHK"
                          : r.entityId === "ddc"
                            ? "DDC"
                            : "—"}
                      </td>
                      <td>{r.invoiceDate ?? r.receivedDate}</td>
                      <td>{r.customer}</td>
                      <td>{r.salesTeam || tr("team.unassigned")}</td>
                      <td>
                        {formatK(r.amount)} {r.currency}
                      </td>
                      <td>
                        {r.sourceSheet} · {r.sourceRow}
                      </td>
                    </tr>
                  ))}
                  {review.snapshots.map((s) => (
                    <tr key={`${s.entityId}:${s.week}`}>
                      <td>
                        {entities.find((entity) => entity.id === s.entityId)
                          ?.code ?? s.entityId.toUpperCase()}
                      </td>
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
          )}
          <ul className="findings-list">
            {review.findings.map((f, i) => (
              <li key={i}>
                <b>
                  {f.severity === "error"
                    ? tr("common.error")
                    : tr("common.review")}
                  :
                </b>{" "}
                {f.code
                  ? tr(f.code as MessageKey, f.params)
                  : display(f.message)}
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
                {busy && operation === "publish" && (
                  <LoaderCircle
                    className="ui-spinner"
                    size={15}
                    aria-hidden="true"
                  />
                )}
                {tr(
                  busy && operation === "publish"
                    ? "import.publishing"
                    : "import.publish",
                )}
              </button>
            </>
          )}
        </section>
      )}
      <section className="panel">
        <p className="panel-kicker">{tr("import.history")}</p>
        <h2>{tr("import.revisions")}</h2>
        {historyLoading && (
          <p className="ui-feedback" role="status">
            {tr("import.historyLoading")}
          </p>
        )}
        {historyError && (
          <div className="ui-feedback error" role="alert">
            {tr("import.loadError")}
            <button
              className="apac-button"
              disabled={busy}
              onClick={() => void load()}
            >
              {tr("common.retry")}
            </button>
          </div>
        )}
        {!batches.length && !historyLoading && !historyError ? (
          <p>{tr("import.empty")}</p>
        ) : (
          batches.map((b) => (
            <button
              className="batch-row"
              key={b.id}
              disabled={busy}
              aria-pressed={review?.id === b.id}
              onClick={() => {
                focusReview.current = true;
                setReview(b);
                setAck(false);
                if (review === b) {
                  focusReview.current = false;
                  reviewPanel.current?.focus({ preventScroll: true });
                  reviewPanel.current?.scrollIntoView({
                    block: "start",
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                  });
                }
              }}
            >
              <strong>{b.fileName}</strong>
              <span>
                {b.entityIds
                  .map(
                    (id) =>
                      entities.find((entity) => entity.id === id)?.code ??
                      id.toUpperCase(),
                  )
                  .join(", ")}
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
