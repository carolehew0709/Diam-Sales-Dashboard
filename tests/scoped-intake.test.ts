import test from "node:test";
import assert from "node:assert/strict";
import * as X from "xlsx";
import { identifyWorkbook } from "../lib/workbook-intake";
import { parseReceivablesWorkbook } from "../lib/receivables-parser";
import {
  previewImport,
  publishReviewed,
  previewRestore,
  restoreReviewed,
} from "../lib/import-review";
import { availableReportingWeeks } from "../lib/reporting-period";
import { getDashboardSnapshot, defaultFilters } from "../lib/dashboard";
import { emptySnapshot } from "../lib/workbook-parser";
import type { Store, User, ImportBatch } from "../lib/types";
const admin: User = {
  id: "admin",
  name: "QA",
  email: "qa@example.test",
  role: "superadmin",
  region: "APAC",
  crossRegionView: false,
  permissions: {},
};
const employee: User = {
  ...admin,
  id: "dehk-editor",
  role: "editor",
  permissions: { dhk: ["view", "edit"] },
};
function arWorkbook(ids = ["dhk"], invalid = false, empty = false) {
  const wb = X.utils.book_new();
  for (const id of ids) {
    const header = Array(20).fill(null),
      row = Array(20).fill(null);
    Object.assign(header, {
      0: "Date",
      1: "InvoiceNumber",
      2: "Customer",
      13: "Terms",
      14: "Overdue",
      15: "Aging",
      [id === "dhk" ? 10 : 9]: invalid
        ? "Unknown amount"
        : id === "dhk"
          ? "Divers in EUR"
          : "Amount(CNY)",
    });
    Object.assign(row, {
      0: "2026-10-01",
      1: "QA-INV",
      2: "QA Customer",
      13: 30,
      14: 0,
      15: "Not Due",
      16: "External",
      [id === "dhk" ? 10 : 9]: -125.25,
    });
    X.utils.book_append_sheet(
      wb,
      X.utils.aoa_to_sheet([
        [...Array(14).fill(null), "2026-10-31"],
        header,
        ...(empty ? [] : [row]),
      ]),
      id === "dhk" ? "DEHK OVERDUE" : "DDC OVERDUE",
    );
  }
  return X.write(wb, { type: "buffer", bookType: "xlsx" });
}
function parsed(ids = ["dhk"]) {
  return parseReceivablesWorkbook(arWorkbook(ids), "QA.xlsx", {
    paymentEntityId: "china-payments",
  });
}
function state(): Store {
  return {
    version: 2,
    revision: 1,
    users: [admin, employee],
    snapshots: [],
    lines: [],
    batches: [],
    audit: [],
    receivables: [
      ...parsed(["dhk", "ddc"]).records.map((r) => ({ ...r, amount: 500 })),
      {
        ...parsed().records[0],
        id: "receipt",
        entityId: "china-payments",
        category: "advance",
        amount: 50,
      },
    ],
  };
}
function batch(ids = ["dhk"]): ImportBatch {
  const p = parsed(ids);
  return {
    id: "scope-import",
    fileName: "QA.xlsx",
    sourceType: "Excel",
    status: "review",
    entityIds: ids,
    submittedBy: employee.id,
    submittedAt: "2026-11-09",
    snapshots: [],
    lines: [],
    sheets: p.sheets,
    findings: p.findings,
    receivables: p.records,
    receivablesKind: p.sourceKind,
    receivablesEntityIds: p.replacementEntityIds,
  };
}
test("standard aging detects DEHK-only, DDC-only and combined scopes without inventing currencies", () => {
  for (const ids of [["dhk"], ["ddc"], ["dhk", "ddc"]]) {
    assert.equal(identifyWorkbook(arWorkbook(ids)), "aging");
    const p = parsed(ids);
    assert.deepEqual(p.replacementEntityIds, ids);
    assert.deepEqual(p.findings, []);
    assert.ok(
      p.records.every(
        (r) => r.amount === -125.25 && r.asOfDate === "2026-10-31",
      ),
    );
    assert.deepEqual(
      p.records.map((r) => r.currency),
      ids.map((id) => (id === "dhk" ? "EUR" : "RMB")),
    );
  }
});
test("single Entity AR review/publish/restore preserves other Entities, receipts and Sales; employee cannot publish", () => {
  for (const ids of [["dhk"], ["ddc"], ["dhk", "ddc"]]) {
    const s = state(),
      before = structuredClone(s),
      b = batch(ids);
    s.batches.push(b);
    const preview = previewImport(s, b);
    assert.deepEqual(
      preview.selectedScopes,
      ids.map((id) => `ar:aging:${id}`),
    );
    assert.throws(
      () => publishReviewed(s, b, employee, preview),
      /not permitted/,
    );
    const outOfScope = {
      ...employee,
      id: "india",
      permissions: { ddi: ["view", "edit"] },
    } as User;
    s.users.push(outOfScope);
    assert.throws(
      () => publishReviewed(s, b, outOfScope, preview),
      /not permitted/,
    );
    publishReviewed(s, b, admin, preview);
    assert.deepEqual(
      s.receivables!.filter((r) => !ids.includes(r.entityId)),
      before.receivables!.filter((r) => !ids.includes(r.entityId)),
    );
    assert.deepEqual(s.snapshots, before.snapshots);
    const restore = previewRestore(s, b);
    restoreReviewed(
      s,
      b,
      admin,
      restore.reviewVersion,
      "Restore the selected Entity source",
    );
    assert.deepEqual(
      s.receivables!.slice().sort((a, b) => a.id.localeCompare(b.id)),
      before.receivables!.slice().sort((a, b) => a.id.localeCompare(b.id)),
    );
  }
});
test("partial AR with unknown amount headers or no invoices blocks publication", () => {
  for (const bytes of [
    arWorkbook(["dhk"], true),
    arWorkbook(["dhk"], false, true),
  ]) {
    const p = parseReceivablesWorkbook(bytes, "QA.xlsx", {
      paymentEntityId: "china-payments",
    });
    assert.ok(p.findings.some((f) => f.severity === "error"));
    const s = state(),
      b = { ...batch(), findings: p.findings, receivables: p.records };
    s.batches.push(b);
    assert.throws(
      () => publishReviewed(s, b, admin, previewImport(s, b)),
      /validation errors/,
    );
  }
});
test("single Entity Sales publication preserves other Entities, old weeks, AR and users", () => {
  const s = state();
  s.snapshots = [
    emptySnapshot("dhk", 2026, 43, 10, "old.xlsx", "W43"),
    emptySnapshot("ddc", 2026, 44, 10, "other.xlsx", "W44"),
  ];
  const before = structuredClone(s),
    snapshot = emptySnapshot("dhk", 2026, 44, 10, "new.xlsx", "W44");
  snapshot.turnover.external = 100;
  const b: ImportBatch = {
    ...batch(),
    receivables: undefined,
    receivablesKind: undefined,
    receivablesEntityIds: undefined,
    snapshots: [snapshot],
    findings: [],
  };
  s.batches.push(b);
  const p = previewImport(s, b);
  publishReviewed(s, b, admin, p);
  assert.deepEqual(
    s.snapshots.filter((v) => v.week !== 44 || v.entityId !== "dhk"),
    before.snapshots,
  );
  assert.deepEqual(s.receivables, before.receivables);
  assert.deepEqual(s.users, before.users);
});
test("week navigation keeps full authorized history, applies Entity and actual fiscal year, and permits returning to newer weeks", () => {
  const s = state();
  s.snapshots = [
    emptySnapshot("dhk", 2026, 45, 11, "a", "W45"),
    emptySnapshot("dhk", 2026, 44, 10, "a", "W44"),
    emptySnapshot("ddc", 2026, 43, 10, "b", "W43"),
    emptySnapshot("ddi", 2026, 42, 10, "c", "W42"),
    emptySnapshot("dhk", 2025, 52, 12, "d", "W52"),
  ];
  assert.deepEqual(
    availableReportingWeeks(s, admin, defaultFilters),
    [45, 44, 43],
  );
  assert.deepEqual(
    availableReportingWeeks(s, employee, defaultFilters),
    [45, 44],
  );
  assert.deepEqual(
    availableReportingWeeks(s, admin, { ...defaultFilters, entity: "ddc" }),
    [43],
  );
  assert.deepEqual(
    availableReportingWeeks(s, admin, { ...defaultFilters, year: 2027 }),
    [45, 44, 43],
  );
  const historical = getDashboardSnapshot(s, admin, {
    ...defaultFilters,
    week: 43,
  });
  assert.deepEqual(historical.availableWeeks, [45, 44, 43]);
  assert.ok(historical.weeks.every((w) => w <= 43));
});
