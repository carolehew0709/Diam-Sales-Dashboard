"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useI18n } from "./i18n-provider";
import { ImportReviewControls } from "./import-review-controls";
import { ManualAdjustmentPanel } from "./manual-adjustment-panel";
import { entities } from "@/lib/entities";
import { canEdit } from "@/lib/permissions";
import type { ImportBatch, User } from "@/lib/types";
export function ImportPortal({
  currentUser,
  onClose,
  onPublished,
}: {
  currentUser: User;
  onClose: () => void;
  onPublished: () => void;
  writable: boolean;
}) {
  const { tr, display, locale } = useI18n();
  const [mode, setMode] = useState<"upload" | "manual" | "history" | "review">(
    "upload",
  );
  const [batches, setBatches] = useState<ImportBatch[]>([]),
    [review, setReview] = useState<ImportBatch | null>(null);
  const [pending, setPending] = useState(false),
    [historyLoading, setHistoryLoading] = useState(true),
    [error, setError] = useState("");
  const [canWrite, setCanWrite] = useState<boolean | null>(null);
  const [publicationRevision, setPublicationRevision] = useState(0);
  const [salesPeriods, setSalesPeriods] = useState<
    { entityId: string; year: number; week: number }[]
  >([]);
  const running = useRef(false),
    panel = useRef<HTMLElement>(null);
  const editable = entities.some((e) => canEdit(currentUser, e));
  async function load() {
    setHistoryLoading(true);
    try {
      const r = await fetch("/api/import/batches?summary=1"),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      setBatches(j.batches);
    } catch (e) {
      setError(
        e instanceof TypeError ? tr("import.loadError") : (e as Error).message,
      );
    } finally {
      setHistoryLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const controller = new AbortController();
    void fetch("/api/import/status", { signal: controller.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error);
        if (!controller.signal.aborted) {
          setCanWrite(j.storage.writable);
          setSalesPeriods(j.salesPeriods);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof TypeError ? tr("import.requestError") : e.message,
          );
      });
    return () => controller.abort();
  }, [publicationRevision]);
  useEffect(() => {
    if (mode === "review") panel.current?.focus({ preventScroll: true });
  }, [review?.id, mode]);
  function show(batch: ImportBatch) {
    setReview(batch);
    setMode("review");
    setError("");
  }
  async function openBatch(id: string) {
    setPending(true);
    setError("");
    try {
      const r = await fetch("/api/import/batches?id=" + encodeURIComponent(id)),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      show(j.batch);
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
  async function upload(file: File) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const r = await fetch("/api/import/analyze", {
          method: "POST",
          body: form,
        }),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      show(j.batch);
      await load();
    } catch (e) {
      setError(
        e instanceof TypeError
          ? tr("import.requestError")
          : (e as Error).message,
      );
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return (
    <section className="apac-workspace import-workspace">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{tr("import.center")}</p>
          <h1>{tr("import.title")}</h1>
          <p>{tr("review.steps")}</p>
        </div>
        <button className="apac-button" onClick={onClose}>
          {tr("common.backDashboard")}
        </button>
      </div>
      <div
        className="import-mode-tabs"
        role="group"
        aria-label={tr("import.center")}
      >
        {(["upload", "manual", "history"] as const).map((m) => (
          <button
            className="apac-button"
            key={m}
            disabled={pending}
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
          >
            {tr(
              m === "upload"
                ? "import.upload"
                : m === "manual"
                  ? "adjust.title"
                  : "import.revisions",
            )}
          </button>
        ))}
      </div>
      {canWrite === null && <p role="status">{tr("intake.checkStorage")}</p>}
      {canWrite === false && (
        <p className="apac-notice">{tr("import.storage")}</p>
      )}
      {error && (
        <p className="ui-feedback error" role="alert">
          {display(error)}
        </p>
      )}
      {pending && (
        <p className="ui-feedback" role="status">
          <LoaderCircle size={16} className="ui-spinner" />
          {tr("import.analyzing")}
        </p>
      )}
      {mode === "upload" && (
        <section className="panel">
          <h2>{tr("import.upload")}</h2>
          <p>{tr("intake.supported")}</p>
          <p className="muted">{tr("intake.independent")}</p>
          <label className="upload-zone">
            {tr("import.choose")}
            <input
              type="file"
              accept=".xlsx"
              disabled={canWrite !== true || pending || !editable}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </label>
        </section>
      )}
      {mode === "manual" && (
        <ManualAdjustmentPanel
          user={currentUser}
          writable={canWrite === true}
          salesPeriods={salesPeriods}
          onCreated={(b) => {
            show(b);
            void load();
          }}
        />
      )}
      {mode === "review" && review && (
        <section
          className="panel review-panel"
          ref={panel}
          tabIndex={-1}
          aria-label={tr("import.reviewStep")}
        >
          <h2>{review.fileName}</h2>
          <p>
            {review.entityIds
              .map((id) => entities.find((e) => e.id === id)?.code ?? id)
              .join(" / ")}{" "}
            · {display(review.sourceType)} ·{" "}
            {new Date(review.submittedAt).toLocaleString(locale)}
          </p>
          {review.teamActualData && (
            <p>
              {tr("teamActual.importSummary", {
                year: review.teamActualData.year,
                month: review.teamActualData.month,
                count: review.teamActualData.rows.length,
              })}
            </p>
          )}
          <ImportReviewControls
            key={review.id + review.status}
            batch={review}
            user={currentUser}
            writable={canWrite === true}
            onComplete={(b) => {
              setReview(b);
              setPublicationRevision((v) => v + 1);
              onPublished();
            }}
          />
        </section>
      )}
      {mode === "history" && (
        <section className="panel">
          <h2>{tr("import.revisions")}</h2>
          <p>{tr("intake.restoreHelp")}</p>
          {historyLoading ? (
            <p role="status">{tr("import.historyLoading")}</p>
          ) : !batches.length ? (
            <p>{tr("import.empty")}</p>
          ) : (
            batches.map((b) => (
              <button
                key={b.id}
                className="batch-row"
                disabled={pending}
                onClick={() => void openBatch(b.id)}
              >
                <strong>{b.fileName}</strong>
                <span>
                  {b.entityIds
                    .map((id) => entities.find((e) => e.id === id)?.code ?? id)
                    .join(" / ")}
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
          <button
            className="apac-button"
            disabled={historyLoading}
            onClick={() => void load()}
          >
            {tr("common.retry")}
          </button>
        </section>
      )}
    </section>
  );
}
