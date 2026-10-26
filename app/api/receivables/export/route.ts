import { ApiError, currentUser } from "@/lib/auth";
import { repository } from "@/lib/repository";
import {
  getReceivables,
  hasReceivablesAccess,
  receivablesFiltersFrom,
} from "@/lib/receivables";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!hasReceivablesAccess(user))
      throw new ApiError(403, "Access to DEHK or DDC is required");
    const data = getReceivables(
      await repository.read(),
      user,
      receivablesFiltersFrom(new URL(request.url)),
    );
    // Prevent spreadsheet formula execution in source-provided text cells.
    const cell = (value: unknown) => {
      const text = String(value ?? "");
      return `"${(typeof value === "string" && /^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
    };
    const rows: unknown[][] = [
      [
        "Category",
        "Entity",
        "Invoice date",
        "Received date",
        "Invoice",
        "Customer",
        "Sales Team",
        "PIC",
        "Amount",
        "Currency",
        "Aging",
        "As of",
        "Source",
        "Sheet",
        "Row",
      ],
    ];
    for (const r of [...data.rows, ...data.payments])
      rows.push([
        r.category,
        r.entityId === "dhk"
          ? "DEHK"
          : r.entityId === "ddc"
            ? "DDC"
            : "China shared receipts",
        r.invoiceDate,
        r.receivedDate,
        r.invoiceNumber,
        r.customer,
        r.salesTeam,
        r.pic,
        r.amount,
        r.currency,
        r.sourceAging || r.aging,
        r.asOfDate,
        r.sourceFile,
        r.sourceSheet,
        r.sourceRow,
      ]);
    return new Response(
      "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="diam-ar-aging.csv"',
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return Response.json(
      {
        ok: false,
        error: status === 500 ? "Export failed" : (error as Error).message,
      },
      { status },
    );
  }
}
