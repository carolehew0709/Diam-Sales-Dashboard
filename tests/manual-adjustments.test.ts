import test from "node:test";
import assert from "node:assert/strict";
import { createAdjustment } from "../lib/manual-adjustments";
import {
  previewImport,
  publishReviewed,
  previewRestore,
  restoreReviewed,
} from "../lib/import-review";
import { ensureGovernance } from "../lib/governance";
import { getDashboardSnapshot, defaultFilters } from "../lib/dashboard";
import { emptySnapshot } from "../lib/workbook-parser";
import type { Store, User, ImportBatch } from "../lib/types";
import type { ReceivableRecord } from "../lib/receivables-types";
const admin: User = {
  id: "admin",
  name: "Admin",
  email: "admin@example.test",
  role: "superadmin",
  region: "APAC",
  crossRegionView: false,
  permissions: {},
  sessionVersion: 1,
};
const editor: User = {
  ...admin,
  id: "editor",
  role: "editor",
  permissions: { ddi: ["view", "edit"] },
};
function state(): Store {
  const s = emptySnapshot("ddi", 2026, 44, 10, "source.xlsx", "W44");
  s.turnover = { external: 100, group: 0 };
  s.orderbook = { external: 20, group: 0 };
  s.monthTurnover = { external: 5, group: 0 };
  s.monthEstimate = { external: 5, group: 0 };
  return ensureGovernance({
    version: 2,
    revision: 1,
    users: [admin, editor],
    snapshots: [s, { ...s, week: 43, turnover: { external: 90, group: 0 } }],
    lines: [],
    batches: [],
    audit: [],
    receivables: [],
  });
}
const record: ReceivableRecord = {
  id: "invoice",
  entityId: "dhk",
  category: "invoice",
  customer: "Client",
  subCustomer: "",
  salesTeam: "Elly Team",
  pic: "PIC",
  invoiceNumber: "INV-1",
  invoiceDate: "2026-01-01",
  receivedDate: null,
  dueDate: "2026-01-31",
  asOfDate: "2026-02-28",
  terms: 30,
  overdueDays: 28,
  aging: "1-30",
  sourceAging: "1-30",
  customerType: "External",
  amount: 500,
  currency: "EUR",
  note: "",
  sourceFile: "private.xlsx",
  sourceSheet: "DEHK OVERDUE",
  sourceRow: 2,
};
function publish(s: Store, b: ImportBatch, actor = admin) {
  const p = previewImport(s, b);
  return publishReviewed(s, b, actor, {
    ...p,
    reason: "Reviewed requested adjustment",
  });
}
test("employee proposes Sales correction, only Super Admin publishes; source and previous weeks remain unchanged", () => {
  const s = state(),
    raw = structuredClone(s.snapshots),
    b = createAdjustment(s, editor, {
      kind: "correction",
      entityId: "ddi",
      year: 2026,
      weeks: [44],
      salesType: "all",
      metric: "sales",
      value: 120,
      reason: "Confirmed sales adjustment",
    });
  s.batches.push(b);
  assert.throws(() => publish(s, b, editor), /not permitted|Super Admin/);
  const preview = previewImport(s, b);
  assert.equal(preview.options[0].reportingAfter[0].sales, 120);
  publish(s, b);
  assert.equal(
    getDashboardSnapshot(s, admin, { ...defaultFilters, region: "India" })
      .totals.sales,
    120,
  );
  assert.deepEqual(s.snapshots, raw);
  assert.equal(
    getDashboardSnapshot(s, admin, {
      ...defaultFilters,
      region: "India",
      week: 43,
    }).totals.sales,
    90,
  );
  const restore = previewRestore(s, b);
  restoreReviewed(
    s,
    b,
    admin,
    restore.reviewVersion,
    "Undo confirmed adjustment",
  );
  assert.equal(
    getDashboardSnapshot(s, admin, { ...defaultFilters, region: "India" })
      .totals.sales,
    100,
  );
  assert.deepEqual(s.snapshots, raw);
});
test("manual budget updates policy only, does not divide monthly amounts or overwrite team sources", () => {
  const s = state(),
    b = createAdjustment(s, editor, {
      kind: "budget",
      entityId: "ddi",
      year: 2026,
      total: 1234,
      reason: "Approved annual budget",
    });
  s.batches.push(b);
  publish(s, b);
  const d = getDashboardSnapshot(s, admin, {
    ...defaultFilters,
    region: "India",
  });
  assert.equal(d.totals.budget, 1234);
  assert.ok(d.totals.monthly.every((m) => m.budget === null));
  const p = previewRestore(s, b);
  restoreReviewed(s, b, admin, p.reviewVersion, "Restore budget version");
  assert.equal(
    getDashboardSnapshot(s, admin, { ...defaultFilters, region: "India" })
      .totals.budget,
    10667,
  );
});
test("AR adjustment preserves untouched fields, negative amounts, currency and source; supports restore", () => {
  const s = state();
  s.receivables = [
    structuredClone(record),
    { ...record, id: "other", entityId: "ddc", currency: "RMB", amount: 1000 },
  ];
  const before = structuredClone(s.receivables);
  const b = createAdjustment(s, admin, {
    kind: "ar",
    recordId: "invoice",
    patch: { amount: -25 },
    reason: "Credit note adjustment",
  });
  s.batches.push(b);
  const p = previewImport(s, b);
  assert.equal(p.options[0].recordChanges[0].field, "amount");
  publish(s, b);
  assert.equal(s.receivables[0].id, "other");
  assert.equal(s.receivables[1].amount, -25);
  assert.equal(s.receivables[1].currency, "EUR");
  assert.equal(s.receivables[1].sourceFile, record.sourceFile);
  const restore = previewRestore(s, b);
  restoreReviewed(s, b, admin, restore.reviewVersion, "Undo AR adjustment");
  assert.deepEqual(
    [...s.receivables].sort((a, b) => a.id.localeCompare(b.id)),
    before.sort((a, b) => a.id.localeCompare(b.id)),
  );
});
test("AR rejects stale requests, unauthorized Entity, currency edits and invalid dates", () => {
  const s = state();
  s.receivables = [structuredClone(record)];
  assert.throws(
    () =>
      createAdjustment(s, editor, {
        kind: "ar",
        recordId: "invoice",
        patch: { amount: 1 },
        reason: "Unauthorized test",
      }),
    /scope/,
  );
  for (const patch of [{ currency: "RMB" }, { invoiceDate: "2026-02-31" }])
    assert.throws(() =>
      createAdjustment(s, admin, {
        kind: "ar",
        recordId: "invoice",
        patch,
        reason: "Invalid field test",
      }),
    );
  const b = createAdjustment(s, admin, {
    kind: "ar",
    recordId: "invoice",
    patch: { amount: 1 },
    reason: "Current record test",
  });
  s.receivables[0].amount = 600;
  assert.throws(() => previewImport(s, b), /changed/);
});
test("overlapping full AR import blocks restoration of an earlier row correction", () => {
  const s = state();
  s.receivables = [structuredClone(record)];
  const b = createAdjustment(s, admin, {
    kind: "ar",
    recordId: "invoice",
    patch: { amount: 5 },
    reason: "Invoice adjustment",
  });
  s.batches.push(b);
  publish(s, b);
  s.batches.push({
    ...b,
    id: "later-full",
    revision: 99,
    adjustedRecordId: undefined,
    publication: undefined,
  });
  assert.throws(() => previewRestore(s, b), /later publication/);
});
test("restoration includes reviewed team reference and leaves other Entity sources unchanged", () => {
  const s = state(),
    old = structuredClone(s.snapshots.find((s) => s.week === 43)!);
  s.retainedTeamSource = { snapshots: [old], lines: [], retainedAt: "initial" };
  const prior = structuredClone(s.retainedTeamSource),
    b: ImportBatch = {
      id: "team-publication",
      fileName: "W44.xlsx",
      sourceType: "Excel",
      status: "review",
      entityIds: ["ddi"],
      submittedBy: admin.id,
      submittedAt: "2026-11-05",
      findings: [],
      snapshots: [{ ...old, week: 44, turnover: { external: 250, group: 0 } }],
      lines: [],
      sheets: [],
      updateTeamReporting: true,
    };
  s.batches.push(b);
  publish(s, b);
  assert.ok(s.retainedTeamSource.snapshots.some((s) => s.week === 44));
  const p = previewRestore(s, b);
  restoreReviewed(s, b, admin, p.reviewVersion, "Restore team publication");
  assert.deepEqual(s.retainedTeamSource.snapshots, prior.snapshots);
  assert.equal(s.snapshots.find((s) => s.week === 44)!.turnover.external, 100);
});
test("manual dates recalculate aging from source reporting date only, amount edits preserve source aging", () => {
  const s = state();
  s.receivables = [{ ...record, overdueDays: 27 }];
  const amount = createAdjustment(s, admin, {
    kind: "ar",
    recordId: record.id,
    patch: { amount: 0 },
    reason: "Zero balance confirmed",
  });
  assert.equal(amount.receivables![0].overdueDays, 27);
  const date = createAdjustment(s, admin, {
    kind: "ar",
    recordId: record.id,
    patch: { dueDate: "2026-04-01" },
    reason: "Agreed due date change",
  });
  assert.equal(date.receivables![0].aging, "not-due");
  assert.equal(date.receivables![0].asOfDate, record.asOfDate);
});

test("clearing an AR date clears derived aging without changing source evidence or other fields", () => {
  const s = state();
  s.receivables = [structuredClone(record)];
  const b = createAdjustment(s, admin, {
    kind: "ar",
    recordId: record.id,
    patch: { dueDate: null },
    reason: "Due date requires confirmation",
  });
  assert.deepEqual(b.receivables![0], {
    ...record,
    dueDate: null,
    overdueDays: null,
    aging: "unclassified",
  });
});

test("every requested Sales correction week must have a published source", () => {
  assert.throws(
    () =>
      createAdjustment(state(), editor, {
        kind: "correction",
        entityId: "ddi",
        year: 2026,
        weeks: [44, 45],
        salesType: "all",
        metric: "sales",
        value: 120,
        reason: "Do not apply to an absent week",
      }),
    /No published source/,
  );
});

test("unrelated Entity aging and shared payments do not prevent restoring an AR adjustment", () => {
  const s = state();
  const ddc = { ...record, id: "ddc-invoice", entityId: "ddc" };
  s.receivables = [structuredClone(record), ddc];
  const original = createAdjustment(s, admin, {
    kind: "ar",
    recordId: record.id,
    patch: { amount: 450 },
    reason: "Reviewed DEHK invoice correction",
  });
  s.batches.push(original);
  publish(s, original);
  const later: ImportBatch = {
    id: "later-ddc",
    fileName: "DDC.xlsx",
    sourceType: "Excel",
    status: "review",
    entityIds: ["ddc"],
    submittedBy: admin.id,
    submittedAt: "2026-11-09",
    snapshots: [],
    lines: [],
    sheets: [],
    findings: [],
    receivablesKind: "aging",
    receivablesEntityIds: ["ddc"],
    receivables: [{ ...ddc, amount: 123 }],
  };
  s.batches.push(later);
  publish(s, later);
  const payment: ImportBatch = {
    ...later,
    status: "review",
    publication: undefined,
    revision: undefined,
    id: "later-payments",
    entityIds: ["dhk", "ddc"],
    receivablesKind: "payments",
    receivablesEntityIds: undefined,
    receivables: [
      {
        ...record,
        id: "payment",
        entityId: "china-payments",
        category: "unknown",
        amount: 10,
      },
    ],
  };
  s.batches.push(payment);
  publish(s, payment);
  const preview = previewRestore(s, original);
  restoreReviewed(
    s,
    original,
    admin,
    preview.reviewVersion,
    "Restore only the DEHK invoice",
  );
  assert.equal(s.receivables.find((r) => r.id === record.id)!.amount, 500);
  assert.equal(s.receivables.find((r) => r.id === ddc.id)!.amount, 123);
  assert.equal(s.receivables.find((r) => r.id === "payment")!.amount, 10);
});

test("a later full aging publication overlaps an earlier Entity-scoped publication", () => {
  const s = state();
  const ddc = { ...record, id: "ddc-invoice", entityId: "ddc" };
  s.receivables = [structuredClone(record), ddc];
  const scoped: ImportBatch = {
    id: "ddc-source",
    fileName: "DDC.xlsx",
    sourceType: "Excel",
    status: "review",
    entityIds: ["ddc"],
    submittedBy: admin.id,
    submittedAt: "2026-11-09",
    snapshots: [],
    lines: [],
    sheets: [],
    findings: [],
    receivablesKind: "aging",
    receivablesEntityIds: ["ddc"],
    receivables: [{ ...ddc, amount: 123 }],
  };
  s.batches.push(scoped);
  publish(s, scoped);
  const full: ImportBatch = {
    ...scoped,
    status: "review",
    publication: undefined,
    revision: undefined,
    id: "full-source",
    entityIds: ["dhk", "ddc"],
    receivablesEntityIds: undefined,
    receivables: [
      { ...record, amount: 600 },
      { ...ddc, amount: 123 },
    ],
  };
  s.batches.push(full);
  publish(s, full);
  assert.throws(() => previewRestore(s, scoped), /later publication/);
});
