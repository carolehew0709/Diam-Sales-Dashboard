"use client";
import type { summarizeReceipts } from "@/lib/receivables";
import { useI18n } from "./i18n-provider";

export function ReceiptBalances({
  rows,
  caption,
}: {
  rows: ReturnType<typeof summarizeReceipts>;
  caption: string;
}) {
  const { tr, locale } = useI18n();
  if (!rows.length) return null;
  const format = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <div className="table-wrap">
      <table className="bu-table receipt-balances">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{tr("ar.currency")}</th>
            {(["unknown", "advance", "pending", "total"] as const).map(
              (key) => (
                <th scope="col" className="numeric" key={key}>
                  {tr(
                    key === "total" ? "ar.receiptTotal" : `ar.category.${key}`,
                  )}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.currency}>
              <th scope="row">{row.currency}</th>
              {(["unknown", "advance", "pending", "total"] as const).map(
                (key) => (
                  <td className="numeric" key={key}>
                    <strong>{format.format(row[key].amount)}</strong>
                    <small>
                      {tr("ar.receiptCount", { count: row[key].count })}
                    </small>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
