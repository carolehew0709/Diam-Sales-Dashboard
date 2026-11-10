"use client";
import { useEffect, useState } from "react";
import { useI18n } from "./i18n-provider";
import type { ImportBatch, User } from "@/lib/types";
import type { previewImport, previewRestore } from "@/lib/import-review";
import { entities } from "@/lib/entities";
import { summarizeReceipts } from "@/lib/receivables";
import { ReceiptBalances } from "./receipt-balances";
import { isMessageKey } from "@/lib/i18n";
type Preview = ReturnType<typeof previewImport>;
type Restore = ReturnType<typeof previewRestore>;
export function ImportReviewControls({
  batch,
  user,
  writable,
  onComplete,
}: {
  batch: ImportBatch;
  user: User;
  writable: boolean;
  onComplete: (batch: ImportBatch) => void;
}) {
  const { tr, display } = useI18n();
  const scopeLabel = (scope: string) => {
    const parts = scope.split(":");
    if (parts[0] === "sales")
      return `${entities.find((e) => e.id === parts[1])?.code ?? parts[1]} · ${parts[2]} · W${parts[3]}`;
    if (parts[0] === "policy")
      return `${entities.find((e) => e.id === parts[2])?.code ?? parts[2]} · ${parts[3]}${parts[1] === "correction" ? ` · W${parts[4]} · ${display(parts[5])}` : ""}`;
    if (parts[0] === "ar-row") return tr("adjust.record");
    if (parts[0] === "ar")
      return `${tr(parts[1] === "aging" ? "ar.nav" : "ar.payments")}${parts[2] ? ` · ${entities.find((e) => e.id === parts[2])?.code ?? parts[2]}` : ""}`;
    if (parts[0] === "customer")
      return `${tr("common.customer")} · ${parts[1]}`;
    return tr("teamActual.sectionTitle");
  };
  const [preview, setPreview] = useState<Preview | null>(null);
  const [restore, setRestore] = useState<Restore | null>(null);
  const [history, setHistory] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(batch.status === "review");
  const [error, setError] = useState("");
  async function call(route: string, body: object) {
    const response = await fetch(`/api/import/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: batch.id, ...body }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }
  useEffect(() => {
    if (batch.status !== "review") return;
    const controller = new AbortController();
    setPending(true);
    fetch("/api/import/preview", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: batch.id }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        if (!controller.signal.aborted) setPreview(j.preview);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof TypeError ? tr("import.requestError") : e.message,
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [batch.id, batch.status, tr]);
  async function refresh(
    selectedScopes?: string[],
    updateTeamReporting?: boolean,
  ) {
    setPending(true);
    setError("");
    try {
      setPreview(
        (await call("preview", { selectedScopes, updateTeamReporting }))
          .preview,
      );
    } catch (e) {
      setError(
        e instanceof TypeError
          ? tr("import.requestError")
          : (e as Error).message,
      );
      setPreview(null);
    } finally {
      setPending(false);
    }
  }
  const canPublish = batch.adjustment
    ? user.role === "superadmin"
    : ["superadmin", "region_admin"].includes(user.role);
  return (
    <section aria-busy={pending} className="import-difference">
      <h3>{tr("review.steps")}</h3>
      {batch.adjustment && <p>{tr("adjust.noAllocation")}</p>}
      {batch.adjustedRecordId && (
        <p className="apac-notice">{tr("adjust.arReview")}</p>
      )}
      <p>
        {batch.fileName} · {batch.templateVersion ?? tr("review.legacy")} ·{" "}
        {batch.fingerprint?.slice(0, 12)}
      </p>
      {error && (
        <p role="alert" className="ui-feedback error">
          {display(error)}
        </p>
      )}
      {batch.status === "review" && (
        <>
          <button
            className="apac-button"
            disabled={pending}
            onClick={() => void refresh(preview?.selectedScopes)}
          >
            {tr("review.refresh")}
          </button>
          <label>
            <input
              type="checkbox"
              checked={history}
              onChange={(e) => setHistory(e.target.checked)}
            />
            {tr("review.history")}
          </label>
          <p>{tr("review.rangeHelp")}</p>
          {preview && (
            <>
              {!!batch.snapshots.length && !batch.adjustment && (
                <label>
                  <input
                    type="checkbox"
                    disabled={pending}
                    checked={preview.updateTeamReporting}
                    onChange={(e) => {
                      setPreview({
                        ...preview,
                        updateTeamReporting: e.target.checked,
                      });
                      void refresh(
                        preview.selectedScopes.length
                          ? preview.selectedScopes
                          : undefined,
                        e.target.checked,
                      );
                    }}
                  />
                  {tr("team.reviewUpload")}
                </label>
              )}
              {preview.options.flatMap((o) => o.recordChanges).length > 0 && (
                <table className="bu-table">
                  <thead>
                    <tr>
                      <th>{tr("adjust.field")}</th>
                      <th>{tr("review.before")}</th>
                      <th>{tr("review.after")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.options
                      .flatMap((o) => o.recordChanges)
                      .map((c) => (
                        <tr key={c.field}>
                          <td>
                            {tr(
                              `adjust.field.${c.field}` as Parameters<
                                typeof tr
                              >[0],
                            )}
                          </td>
                          <td>{String(c.before ?? "—")}</td>
                          <td>{String(c.after ?? "—")}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              <p>
                {batch.receivablesKind ? tr("ar.reviewCurrency") : preview.unit}{" "}
                · {tr("review.independent")}
              </p>
              {batch.receivablesKind && !batch.adjustedRecordId && (
                <p className="apac-notice">
                  {tr(
                    batch.receivablesKind === "aging"
                      ? batch.receivablesEntityIds?.length
                        ? "review.replaceScopedAging"
                        : "review.replaceAging"
                      : "review.replacePayments",
                  )}
                </p>
              )}
              {batch.receivablesKind === "payments" && (
                <ReceiptBalances
                  rows={summarizeReceipts(batch.receivables ?? [])}
                  caption={tr("review.receiptSummary")}
                />
              )}
              <h4>{tr("review.raw")}</h4>
              <div className="table-wrap">
                <table className="bu-table">
                  <thead>
                    <tr>
                      <th>{tr("review.range")}</th>
                      <th>{tr("review.before")}</th>
                      <th>{tr("review.after")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.options
                      .filter(
                        (o) =>
                          !o.historical ||
                          history ||
                          preview.selectedScopes.includes(o.scope),
                      )
                      .map((o) => (
                        <tr key={o.scope}>
                          <td>
                            <label>
                              <input
                                type="checkbox"
                                disabled={pending || !o.changed}
                                checked={preview.selectedScopes.includes(
                                  o.scope,
                                )}
                                onChange={(e) => {
                                  const selected = e.target.checked
                                    ? [...preview.selectedScopes, o.scope]
                                    : preview.selectedScopes.filter(
                                        (k) => k !== o.scope,
                                      );
                                  setPreview({
                                    ...preview,
                                    selectedScopes: selected,
                                  });
                                  void refresh(selected);
                                }}
                              />
                              {scopeLabel(o.scope)}
                            </label>
                            {!o.changed && (
                              <small>{tr("review.unchanged")}</small>
                            )}
                          </td>
                          {[o.before, o.after].map((v, i) => (
                            <td key={i}>
                              {Object.entries(v)
                                .filter(([k]) =>
                                  batch.adjustment
                                    ? false
                                    : batch.receivablesKind
                                      ? [
                                          "arRecords",
                                          "arEUR",
                                          "arRMB",
                                          "arUSD",
                                          "pendingReceipts",
                                        ].includes(k)
                                      : batch.teamActualData
                                        ? [
                                            "teamRows",
                                            "teamSales",
                                            "teamBudget",
                                          ].includes(k)
                                        : batch.customerAnalysis
                                          ? [
                                              "customerMonths",
                                              "customerCurrent",
                                            ].includes(k)
                                          : ![
                                              "arRecords",
                                              "arEUR",
                                              "arRMB",
                                              "arUSD",
                                              "pendingReceipts",
                                              "customerMonths",
                                              "customerCurrent",
                                              "teamRows",
                                              "teamSales",
                                              "teamBudget",
                                            ].includes(k),
                                )
                                .map(([k, n]) => (
                                  <div key={k}>
                                    {tr(
                                      `review.metric.${k}` as Parameters<
                                        typeof tr
                                      >[0],
                                    )}
                                    :{" "}
                                    {n === null
                                      ? "—"
                                      : n.toLocaleString(undefined, {
                                          maximumFractionDigits: 5,
                                        })}
                                  </div>
                                ))}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {preview.options
                .filter(
                  (o) =>
                    preview.selectedScopes.includes(o.scope) &&
                    o.reportingAfter.length,
                )
                .map((o) => (
                  <details key={o.scope} open>
                    <summary>
                      {scopeLabel(o.scope)} · {tr("review.reporting")}
                    </summary>
                    <div className="table-wrap">
                      <table className="bu-table">
                        <thead>
                          <tr>
                            <th>{tr("review.range")}</th>
                            <th>{tr("review.before")}</th>
                            <th>{tr("review.after")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.reportingAfter.map((v) => (
                            <tr key={`${v.year}:${v.salesType}`}>
                              <td>
                                {v.year} · {display(v.salesType)}
                              </td>
                              {[
                                o.reportingBefore.find(
                                  (b) =>
                                    b.year === v.year &&
                                    b.salesType === v.salesType,
                                ),
                                v,
                              ].map((n, i) => (
                                <td key={i}>
                                  {n
                                    ? (
                                        [
                                          "sales",
                                          "prospect",
                                          "additionalP1",
                                          "annual",
                                          "monthly",
                                          "budget",
                                          "coverage",
                                          "gap",
                                        ] as const
                                      ).map((k) => (
                                        <div key={k}>
                                          {tr(`review.metric.${k}`)}:{" "}
                                          {n[k] === null
                                            ? "—"
                                            : k === "coverage"
                                              ? `${(n[k]! * 100).toFixed(2)}%`
                                              : n[k]!.toLocaleString(
                                                  undefined,
                                                  { maximumFractionDigits: 5 },
                                                )}
                                        </div>
                                      ))
                                    : tr("review.noSource")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <details>
                      <summary>{tr("review.evidence")}</summary>
                      {Object.entries(o.reportingAfter[0].evidence).map(
                        ([k, v]) => (
                          <p key={k}>
                            {k}: {v}
                          </p>
                        ),
                      )}
                    </details>
                  </details>
                ))}
              <ul>
                {preview.findings.map((f, i) => (
                  <li key={i}>
                    {display(f.severity)}:{" "}
                    {f.code && isMessageKey(f.code)
                      ? tr(f.code, f.params)
                      : display(f.message)}
                  </li>
                ))}
              </ul>
              <label>
                {tr("review.reason")}
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                className="apac-button primary"
                disabled={
                  pending ||
                  !writable ||
                  !canPublish ||
                  !preview.selectedScopes.length ||
                  preview.findings.some((f) => f.severity === "error") ||
                  (preview.findings.some((f) => f.severity === "review") &&
                    reason.trim().length < 5)
                }
                onClick={async () => {
                  setPending(true);
                  setError("");
                  try {
                    const j = await call("publish", {
                      selectedScopes: preview.selectedScopes,
                      reviewVersion: preview.reviewVersion,
                      reason,
                    });
                    onComplete(j.batch);
                  } catch (e) {
                    setError(
                      e instanceof TypeError
                        ? tr("import.requestError")
                        : (e as Error).message,
                    );
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {tr(pending ? "import.publishing" : "import.publish")}
              </button>
            </>
          )}
        </>
      )}
      {batch.status === "published" &&
        batch.publication &&
        user.role === "superadmin" && (
          <>
            <button
              className="apac-button"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setError("");
                try {
                  setRestore((await call("restore", {})).result);
                } catch (e) {
                  setError(
                    e instanceof TypeError
                      ? tr("import.requestError")
                      : (e as Error).message,
                  );
                  setRestore(null);
                } finally {
                  setPending(false);
                }
              }}
            >
              {tr("review.restorePreview")}
            </button>
            {restore && (
              <div>
                <div className="table-wrap">
                  <table className="bu-table">
                    <thead>
                      <tr>
                        <th>{tr("review.range")}</th>
                        <th>{tr("review.before")}</th>
                        <th>{tr("review.after")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restore.ranges.map((r) => (
                        <tr key={r.scope}>
                          <td>{scopeLabel(r.scope)}</td>
                          {[r.before, r.after].map((v, i) => (
                            <td key={i}>
                              {Object.entries(v).map(([k, n]) => (
                                <div key={k}>
                                  {tr(
                                    `review.metric.${k}` as Parameters<
                                      typeof tr
                                    >[0],
                                  )}
                                  : {n ?? "—"}
                                </div>
                              ))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label>
                  {tr("review.reason")}
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className="apac-button"
                  disabled={pending || reason.trim().length < 5}
                  onClick={async () => {
                    setPending(true);
                    setError("");
                    try {
                      onComplete(
                        (
                          await call("restore", {
                            reviewVersion: restore.reviewVersion,
                            reason,
                          })
                        ).result,
                      );
                    } catch (e) {
                      setError(
                        e instanceof TypeError
                          ? tr("import.requestError")
                          : (e as Error).message,
                      );
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  {tr("review.restore")}
                </button>
              </div>
            )}
          </>
        )}
      {batch.status !== "review" && (
        <>
          <p role="status">
            {tr("review.result")} {display(batch.status)} · {batch.revision}
          </p>
          {batch.publication && (
            <div className="publication-summary">
              <h4>{tr("review.range")}</h4>
              <ul>
                {batch.publication.scopes.map((scope) => (
                  <li key={scope}>{scopeLabel(scope)}</li>
                ))}
              </ul>
              {batch.publication.reason && <p>{batch.publication.reason}</p>}
              {batch.publishedAt && (
                <p className="muted">
                  {new Date(batch.publishedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
