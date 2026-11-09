import test from "node:test";
import assert from "node:assert/strict";
import * as X from "xlsx";
import { parseDdcAging } from "../lib/ddc-aging-parser";
import { orderDimensionColumns } from "../lib/order-dimensions";
import { reviewedPublish } from "./review-helper";
test("W45 explicit Team/Brands and single-Nov header resolve left dimensions", () => {
  assert.deepEqual(
    orderDimensionColumns(
      { B23: { v: "Team" }, C23: { v: "Brands" }, D23: { v: "Nov" } } as any,
      22,
      3,
    ),
    { team: 1, product: 2, shifted: true },
  );
  assert.deepEqual(orderDimensionColumns({ C23: { v: "Nov" } } as any, 22, 3), {
    team: 0,
    product: 1,
    shifted: true,
  });
});
function book(overrides: Record<string, unknown> = {}) {
  const wb = X.utils.book_new(),
    row = Array(20).fill(null);
  Object.assign(row, {
    2: "迪亚姆展示设备（昆山）有限公司",
    5: "Client",
    6: "人民币",
    9: "INV-1",
    10: "2026-09-01",
    11: "2026-10-01",
    12: 30,
    16: 123,
    17: "Team",
  });
  for (const [k, v] of Object.entries(overrides)) row[Number(k)] = v;
  X.utils.book_append_sheet(
    wb,
    X.utils.aoa_to_sheet([
      [
        "序号",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "最后到期日",
        null,
        null,
        null,
        null,
        "余额",
      ],
      row,
    ]),
    "sheet1",
  );
  return X.write(wb, { type: "buffer", bookType: "xlsx" });
}
test("DDC ledger preserves currency, exact source aging, and explicit Entity-only scope", () => {
  const p = parseDdcAging(book(), "DDC-20261031.xlsx")!;
  assert.deepEqual(p.replacementEntityIds, ["ddc"]);
  assert.equal(p.records[0].asOfDate, "2026-10-31");
  assert.equal(p.records[0].aging, "1-30");
  assert.equal(p.records[0].amount, 123);
  assert.equal(p.records[0].customerType, "Unclassified");
  assert.equal(p.records[0].currency, "RMB");
});
test("DDC ledger rejects foreign organization/currency/missing balance rather than dropping rows", () => {
  for (const o of [{ 2: "Other" }, { 6: "USD" }, { 16: null }])
    assert.throws(() => parseDdcAging(book(o), "DDC-20261031.xlsx"));
  const p = parseDdcAging(
    book({ 12: null, 13: 10, 16: -2 }),
    "DDC-20261031.xlsx",
  )!;
  assert.equal(p.records[0].aging, "not-due");
  assert.equal(p.records[0].amount, -2);
});
test("scoped DDC publication preserves DEHK invoices and shared receipts", async () => {
  const fs = await import("node:fs/promises"),
    os = await import("node:os"),
    path = await import("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "diam-w45-")),
    file = path.join(dir, "state.json");
  process.env.DIAM_DATA_PATH = file;
  const actor: any = {
    id: "admin",
    role: "superadmin",
    name: "QA",
    email: "qa@example.test",
    region: "APAC",
    crossRegionView: false,
    permissions: {},
  };
  const record = parseDdcAging(book(), "DDC-20261031.xlsx")!.records[0];
  const old = [
    { ...record, id: "hk", entityId: "dhk" },
    {
      ...record,
      id: "payment",
      entityId: "china-payments",
      category: "unknown",
    },
    { ...record, id: "old-ddc" },
  ];
  await fs.writeFile(
    file,
    JSON.stringify({
      version: 2,
      revision: 1,
      users: [actor],
      snapshots: [],
      lines: [],
      batches: [],
      audit: [],
      receivables: old,
    }),
  );
  try {
    const { repository } = await import("../lib/repository");
    const batch: any = {
      id: "ddc-update",
      fileName: "DDC.xlsx",
      sourceType: "Excel",
      status: "review",
      entityIds: ["ddc"],
      submittedBy: "admin",
      submittedAt: "2026-11-09",
      snapshots: [],
      lines: [],
      sheets: [],
      findings: [],
      receivables: [record],
      receivablesKind: "aging",
      receivablesEntityIds: ["ddc"],
    };
    await repository.createImportBatch(batch, actor);
    await reviewedPublish(repository, batch.id, actor);
    const state = await repository.read();
    assert.deepEqual(
      state.receivables!.filter((r) => r.entityId !== "ddc"),
      old.filter((r) => r.entityId !== "ddc"),
    );
    assert.equal(
      state.receivables!.filter((r) => r.entityId === "ddc").length,
      1,
    );
    assert.equal(
      (await reviewedPublish(repository, batch.id, actor)).revision,
      2,
    );
  } finally {
    await fs.unlink(file);
    await fs.rmdir(dir);
    delete process.env.DIAM_DATA_PATH;
  }
});
