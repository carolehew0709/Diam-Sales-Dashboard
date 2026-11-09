"use client";
import { useEffect, useState } from "react";
import { useI18n } from "./i18n-provider";
import { entities } from "@/lib/entities";
import { canEdit } from "@/lib/permissions";
import type { ImportBatch, User } from "@/lib/types";
import type { ReceivableRecord } from "@/lib/receivables-types";
import { agingBuckets } from "@/lib/receivables";

export function ManualAdjustmentPanel({
  user,
  writable,
  onCreated,
  salesPeriods,
}: {
  user: User;
  writable: boolean;
  onCreated: (batch: ImportBatch) => void;
  salesPeriods: { entityId: string; year: number; week: number }[];
}) {
  const { tr, display } = useI18n(),
    editable = entities.filter((e) => canEdit(user, e));
  const [kind, setKind] = useState("correction"),
    [entity, setEntity] = useState(editable[0]?.id ?? ""),
    [year, setYear] = useState(""),
    [week, setWeek] = useState("");
  useEffect(() => {
    const period = salesPeriods.find((period) => period.entityId === entity);
    setYear(period ? String(period.year) : "");
    setWeek(period ? String(period.week) : "");
  }, [entity, salesPeriods]);
  const [metric, setMetric] = useState("sales"),
    [salesType, setType] = useState("all"),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState("");
  const [externalBudget, setExternalBudget] = useState(""),
    [groupBudget, setGroupBudget] = useState("");
  const [search, setSearch] = useState(""),
    [records, setRecords] = useState<ReceivableRecord[]>([]),
    [record, setRecord] = useState<ReceivableRecord | null>(null),
    [field, setField] = useState("amount"),
    [value, setValue] = useState("");
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function find() {
    setPending(true);
    setError("");
    try {
      const r = await fetch(
          "/api/import/adjustments?q=" + encodeURIComponent(search),
        ),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      setRecords(j.records);
      if (!j.records.length) setError(tr("adjust.none"));
    } catch (e) {
      setError(
        e instanceof TypeError
          ? tr("import.requestError")
          : (e as Error).message,
      );
    } finally {
      setPending(false);
    }
  }
  async function submit() {
    setPending(true);
    setError("");
    try {
      if (
        kind !== "ar" &&
        (amount.trim() === "" || !Number.isFinite(Number(amount)))
      )
        throw Error(tr("adjust.amountRequired"));
      if (
        kind === "ar" &&
        field === "amount" &&
        (value.trim() === "" || !Number.isFinite(Number(value)))
      )
        throw Error(tr("adjust.amountRequired"));
      const body =
        kind === "ar"
          ? {
              kind,
              recordId: record?.id,
              patch: {
                [field]:
                  field === "amount"
                    ? Number(value)
                    : field.endsWith("Date") && !value
                      ? null
                      : value,
              },
              reason,
            }
          : {
              kind,
              entityId: entity,
              year: Number(year),
              weeks: [Number(week)],
              salesType,
              metric,
              value: Number(amount),
              total: Number(amount),
              external:
                externalBudget.trim() === "" ? null : Number(externalBudget),
              group: groupBudget.trim() === "" ? null : Number(groupBudget),
              reason,
            };
      const r = await fetch("/api/import/adjustments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      onCreated(j.batch);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? tr("import.requestError")
          : (e as Error).message,
      );
    } finally {
      setPending(false);
    }
  }
  const fields =
    record?.category === "invoice"
      ? [
          "amount",
          "invoiceDate",
          "dueDate",
          "asOfDate",
          "aging",
          "customer",
          "salesTeam",
          "pic",
        ]
      : ["amount", "receivedDate", "customer", "salesTeam", "pic"];
  function chooseField(next: string, r = record) {
    setField(next);
    setValue(r?.[next as keyof ReceivableRecord]?.toString() ?? "");
  }
  return (
    <section className="panel manual-adjustments" aria-busy={pending}>
      <h2>{tr("adjust.title")}</h2>
      <p>{tr("adjust.rule")}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-grid">
          <label>
            {tr("adjust.kind")}
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setError("");
              }}
            >
              <option value="correction">{tr("adjust.sales")}</option>
              <option value="budget">{tr("metric.budget")}</option>
              <option value="ar">{tr("ar.nav")}</option>
            </select>
          </label>
          {kind !== "ar" ? (
            <>
              <label>
                {tr("common.entity")}
                <select
                  value={entity}
                  onChange={(e) => setEntity(e.target.value)}
                >
                  {editable.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("filters.years")}
                <input
                  type="number"
                  min="2000"
                  max="2099"
                  required
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </label>
              {kind === "correction" && (
                <>
                  <label>
                    {tr("common.week")}
                    <input
                      type="number"
                      min="1"
                      max="53"
                      required
                      value={week}
                      onChange={(e) => setWeek(e.target.value)}
                    />
                  </label>
                  <label>
                    {tr("adjust.metric")}
                    <select
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                    >
                      <option value="sales">{tr("metric.salesDate")}</option>
                      <option value="orderbook">{tr("metric.ob")}</option>
                      <option value="prospect">{tr("metric.prospect")}</option>
                      <option value="annual">{tr("metric.baseOB")}</option>
                    </select>
                  </label>
                  <label>
                    {tr("filters.type")}
                    <select
                      value={salesType}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="all">{tr("filters.allSales")}</option>
                      <option value="external">{tr("common.external")}</option>
                      <option value="group">{tr("common.group")}</option>
                    </select>
                  </label>
                </>
              )}
              <label>
                {tr("adjust.newAmount")} (kEUR)
                <input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <p className="muted">{tr("adjust.noAllocation")}</p>
              {kind === "budget" && (
                <>
                  <label>
                    {tr("common.external")} (kEUR)
                    <input
                      inputMode="decimal"
                      value={externalBudget}
                      onChange={(e) => setExternalBudget(e.target.value)}
                    />
                  </label>
                  <label>
                    {tr("common.group")} (kEUR)
                    <input
                      inputMode="decimal"
                      value={groupBudget}
                      onChange={(e) => setGroupBudget(e.target.value)}
                    />
                  </label>
                </>
              )}
            </>
          ) : (
            <>
              <label>
                {tr("adjust.search")}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="apac-button"
                disabled={pending || !search.trim()}
                onClick={() => void find()}
              >
                {tr("adjust.find")}
              </button>
              <label>
                {tr("adjust.record")}
                <select
                  value={record?.id ?? ""}
                  onChange={(e) => {
                    const r =
                      records.find((r) => r.id === e.target.value) ?? null;
                    setRecord(r);
                    chooseField("amount", r);
                  }}
                >
                  <option value="">{tr("adjust.choose")}</option>
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.invoiceNumber || r.id} · {r.customer} · {r.amount}{" "}
                      {r.currency}
                    </option>
                  ))}
                </select>
              </label>
              {record && (
                <>
                  <p className="muted">
                    {record.sourceFile} · {record.sourceSheet} ·{" "}
                    {record.sourceRow} · {record.currency}
                  </p>
                  <label>
                    {tr("adjust.field")}
                    <select
                      value={field}
                      onChange={(e) => chooseField(e.target.value)}
                    >
                      {fields.map((k) => (
                        <option key={k} value={k}>
                          {tr(`adjust.field.${k}` as Parameters<typeof tr>[0])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    {tr("review.before")}:{" "}
                    {record[field as keyof ReceivableRecord]?.toString() ?? "—"}
                  </p>
                  <label>
                    {tr("review.after")}
                    {field === "aging" ? (
                      <select
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                      >
                        {agingBuckets.map((v) => (
                          <option key={v} value={v}>
                            {display(v)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.endsWith("Date") ? "date" : "text"}
                        required={!field.endsWith("Date")}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                      />
                    )}
                  </label>
                </>
              )}
            </>
          )}
          <label className="wide">
            {tr("review.reason")}
            <textarea
              required
              minLength={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="ui-feedback error">
            {display(error)}
          </p>
        )}
        <button
          className="apac-button primary"
          disabled={
            pending ||
            !writable ||
            !editable.length ||
            reason.trim().length < 5 ||
            (kind === "ar" && !record)
          }
        >
          {tr("adjust.submit")}
        </button>
      </form>
    </section>
  );
}
