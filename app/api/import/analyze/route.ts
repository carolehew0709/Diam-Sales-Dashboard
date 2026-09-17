import { randomUUID } from "node:crypto";
import { api, ApiError, currentUser, sameOrigin } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { parseDashboardWorkbook } from "@/lib/workbook-parser";
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
    let parsed;
    try {
      parsed = parseDashboardWorkbook(
        Buffer.from(await file.arrayBuffer()),
        file.name,
      );
    } catch {
      throw new ApiError(400, "Workbook could not be parsed");
    }
    const batch = await repository.createImportBatch(
      {
        id: randomUUID(),
        fileName: file.name,
        sourceType: "Excel",
        status: "review",
        entityIds: [...new Set(parsed.snapshots.map((s) => s.entityId))],
        submittedBy: user.id,
        submittedAt: new Date().toISOString(),
        ...parsed,
      },
      user,
    );
    return { ok: true, batch };
  });
}
