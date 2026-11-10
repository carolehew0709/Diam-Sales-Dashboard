"use client";
import { WalletCards } from "lucide-react";
import type { ReceivablesView } from "@/lib/receivables";
import { useI18n } from "./i18n-provider";
import styles from "./receivables-source-dates.module.css";

export function ReceivablesSourceDates({
  data,
  loading,
}: {
  data: Pick<
    ReceivablesView,
    "invoiceSourceDates" | "latestReceiptDate"
  > | null;
  loading: boolean;
}) {
  const { tr } = useI18n();
  return (
    <div className={`ar-asof ${styles.card}`}>
      <WalletCards size={22} aria-hidden="true" />
      <div className={styles.body}>
        <p className={styles.title}>{tr("ar.dataDates")}</p>
        {data && (data.invoiceSourceDates.length || data.latestReceiptDate) ? (
          <dl className={styles.rows}>
            {data.invoiceSourceDates.map((source) => (
              <div className={styles.row} key={source.entityId}>
                <dt>
                  {tr("ar.entityAgingDate", { entity: source.entityCode })}
                </dt>
                <dd>
                  {source.dates.map((date, i) => (
                    <time key={date} dateTime={date}>
                      {i ? " / " : ""}
                      {date}
                    </time>
                  ))}
                </dd>
              </div>
            ))}
            {data.latestReceiptDate && (
              <div className={styles.row}>
                <dt>{tr("ar.latestReceiptDate")}</dt>
                <dd>
                  <time dateTime={data.latestReceiptDate}>
                    {data.latestReceiptDate}
                  </time>
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <span>{loading ? tr("ar.loadingShort") : "—"}</span>
        )}
      </div>
    </div>
  );
}
