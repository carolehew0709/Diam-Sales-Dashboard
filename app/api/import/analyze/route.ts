import {parseTeamActualWorkbook} from "@/lib/team-actual-parser";
import { selectImportWeeks } from "@/lib/import-scope";
import { randomUUID } from "node:crypto";
import { api, ApiError, currentUser, sameOrigin } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { parseDashboardWorkbook } from "@/lib/workbook-parser";
import { parseReceivablesWorkbook } from "@/lib/receivables-parser";
import { parseCustomerAnalysisWorkbook } from "@/lib/customer-analysis-parser";
import type { ImportBatch } from "@/lib/types";
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const user = await currentUser();
    if (!["superadmin", "region_admin", "editor"].includes(user.role))
      throw new ApiError(403, "Import access required");
    if (Number(request.headers.get("content-length")) > 12 * 1024 * 1024)
      throw new ApiError(413, "Workbook exceeds 12 MB");
    const form = await request.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !/\.xlsx$/i.test(file.name) ||
      file.size > 12 * 1024 * 1024
    )
      throw new ApiError(400, "Choose an .xlsx workbook up to 12 MB");
    let parsed: Pick<ImportBatch, "snapshots" | "lines" | "sheets" | "findings" | "receivables" | "receivablesKind" | "customerAnalysis" | "teamActualData">;
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      parsed = parseTeamActualWorkbook(bytes, file.name) ?? parseCustomerAnalysisWorkbook(bytes, file.name) ?? parseDashboardWorkbook(bytes, file.name);
      if (!parsed.teamActualData && !parsed.customerAnalysis && !parsed.snapshots.length) {
        const ar = parseReceivablesWorkbook(bytes, file.name, { paymentEntityId: "china-payments" });
        parsed = { snapshots: [], lines: [], sheets: ar.sheets, findings: ar.findings, receivables: ar.records, receivablesKind: ar.sourceKind };
      }
    } catch {
      throw new ApiError(400, "Workbook could not be parsed");
    }
    if (parsed.teamActualData && form.get("weeks") !== null) throw new ApiError(400,"Week selection is not available for monthly team actuals");
    parsed = selectImportWeeks(parsed, form.get("weeks"));
    const teamSelection=form.get('teamReporting');
    if(teamSelection==='selected' && parsed.lines.some(l=>l.salesTeam && (/^[-+]?\d+(\.\d+)?$/.test(l.salesTeam) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test(l.salesTeam))))throw new ApiError(400,'Team column contains amounts or month headers; review the workbook layout before publishing');
    if(teamSelection!==null && (teamSelection!=='selected'||!parsed.snapshots.length||parsed.customerAnalysis||parsed.receivables||parsed.teamActualData))throw new ApiError(400,'Team Prospect review requires weekly sales data');
    const batch = await repository.createImportBatch(
      {
        id: randomUUID(),
        updateTeamReporting:teamSelection==='selected',
        fileName: file.name,
        sourceType: "Excel",
        status: "review",
        entityIds: parsed.teamActualData ? [...new Set(parsed.teamActualData.rows.map(r=>r.entityId))] : parsed.customerAnalysis ? parsed.customerAnalysis.entityIds : parsed.receivables ? ["dhk", "ddc"] : [...new Set(parsed.snapshots.map((s) => s.entityId))],
        submittedBy: user.id,
        submittedAt: new Date().toISOString(),
        ...parsed,
      },
      user,
    );
    return { ok: true, batch };
  });
}
