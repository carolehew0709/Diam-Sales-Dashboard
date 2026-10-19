import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import source from "../data/apac-dashboard.json";
import {
  agingBucket,
  excelDate,
  parseReceivablesWorkbook,
} from "../lib/receivables-parser";
import {
  defaultReceivablesFilters,
  getReceivables,
  hasReceivablesAccess,
} from "../lib/receivables";
import { defaultFilters, getDashboardSnapshot } from "../lib/dashboard";
import { salesTeamState } from "../lib/sales-teams";
import { reportingState } from "../lib/intercompany";
import type { OrderBookLine, Snapshot, Store, User } from "../lib/types";
const admin = {
  id: "ar-admin",
  name: "Test",
  email: "test@example.com",
  role: "superadmin",
  region: "APAC",
  crossRegionView: false,
  permissions: {},
} as User;
const india = {
  ...admin,
  id: "india",
  role: "editor",
  permissions: { ddi: ["view", "edit"] },
} as User;
const parse = (file: string) =>
  parseReceivablesWorkbook(fs.readFileSync(`Dashboard/${file}`), file, {
    paymentEntityId: "china-payments",
  });
const hasPrivateSources = [
  "DEHK+DDC OVERDUE.xlsx",
  "Unknown Payment.xlsx",
].every((file) => fs.existsSync(`Dashboard/${file}`));
const sourceTest = hasPrivateSources ? test : test.skip;
const aging = hasPrivateSources
    ? parse("DEHK+DDC OVERDUE.xlsx")
    : { records: [], findings: [] },
  payments = hasPrivateSources
    ? parse("Unknown Payment.xlsx")
    : { records: [], findings: [] };
const state: Store = {
  version: 2,
  revision: 1,
  users: [admin],
  batches: [],
  audit: [],
  snapshots: source.snapshots as unknown as Snapshot[],
  lines: source.lines as OrderBookLine[],
  receivables: [...aging.records, ...payments.records],
};
const close = (a: number | null, b: number) =>
  assert.ok(a !== null && Math.abs(a - b) < 0.00001, `${a} != ${b}`);

sourceTest(
  "AR parses actual invoice rows, preserves source date, signed RMB and EUR without footer/September duplication",
  () => {
    assert.equal(aging.records.length, 999);
    assert.deepEqual(aging.findings, []);
    assert.equal(aging.records.filter((r) => r.entityId === "dhk").length, 383);
    assert.equal(aging.records.filter((r) => r.entityId === "ddc").length, 616);
    assert.ok(
      aging.records.every(
        (r) => r.asOfDate === "2026-09-30" && r.sourceSheet.endsWith("OVERDUE"),
      ),
    );
    assert.equal(aging.records.filter((r) => r.amount < 0).length, 2);
    assert.equal(
      aging.records.find((r) => r.invoiceNumber === "RV-202302-000007")!.amount,
      -241387.9,
    );
    assert.equal(
      aging.records.find((r) => r.entityId === "dhk")!.invoiceDate,
      "2025-10-23",
    );
  },
);
sourceTest(
  "payment Summary EUR balances are counted once and detail sheets only classify 13 unknown / 26 advance rows",
  () => {
    assert.deepEqual(payments.findings, []);
    assert.equal(payments.records.length, 39);
    assert.equal(
      payments.records.filter((r) => r.category === "unknown").length,
      13,
    );
    assert.equal(
      payments.records.filter((r) => r.category === "advance").length,
      26,
    );
    close(
      payments.records
        .filter((r) => r.category === "unknown")
        .reduce((n, r) => n + r.amount, 0),
      271839.99646518205,
    );
    close(
      payments.records
        .filter((r) => r.category === "advance")
        .reduce((n, r) => n + r.amount, 0),
      391752.80666666647,
    );
    assert.ok(
      payments.records.every(
        (r) => r.entityId === "china-payments" && r.currency === "EUR",
      ),
    );
  },
);
sourceTest(
  "AR cards reconcile signed balances within currencies; India has no China data or shared payments",
  () => {
    const data = getReceivables(state, admin, defaultReceivablesFilters);
    const eur = data.totals.find((t) => t.currency === "EUR")!,
      rmb = data.totals.find((t) => t.currency === "RMB")!;
    close(eur.ar, 3838412.08);
    close(rmb.ar, 20952941.2);
    for (const total of data.totals)
      close(total.due! + total.overdue! + total.unclassified!, total.ar!);
    close(eur.unknown, 271839.99646518205);
    assert.equal(rmb.unknown, null);
    assert.equal(hasReceivablesAccess(india), false);
    const hidden = getReceivables(state, india, defaultReceivablesFilters);
    for (const key of [
      "rows",
      "payments",
      "sourceFiles",
      "salesTeams",
      "ranking",
    ] as const)
      assert.deepEqual(hidden[key], []);
  },
);
sourceTest(
  "Unknown/Advance ignores BU and aging while invoices follow them; shared receipts require both BU permissions",
  () => {
    const all = getReceivables(state, admin, defaultReceivablesFilters);
    const ddc = getReceivables(state, admin, {
      ...defaultReceivablesFilters,
      bu: "DDC",
      aging: "1-30",
    });
    assert.deepEqual(ddc.payments, all.payments);
    assert.ok(
      ddc.rows.every((r) => r.entityId === "ddc" && r.aging === "1-30"),
    );
    const restricted = { ...india, permissions: { dhk: ["view"] } } as User;
    const result = getReceivables(state, restricted, defaultReceivablesFilters);
    assert.ok(result.rows.every((r) => r.entityId === "dhk"));
    assert.deepEqual(result.payments, []);
  },
);
sourceTest(
  "customer top10 and other cohorts partition each currency without mixed-currency ranking",
  () => {
    const all = getReceivables(state, admin, defaultReceivablesFilters);
    const top = getReceivables(state, admin, {
      ...defaultReceivablesFilters,
      customerGroup: "top10",
    });
    const other = getReceivables(state, admin, {
      ...defaultReceivablesFilters,
      customerGroup: "other",
    });
    assert.equal(top.rows.length + other.rows.length, all.rows.length);
    const ids = new Set(top.rows.map((r) => r.id));
    assert.ok(other.rows.every((r) => !ids.has(r.id)));
    for (const currency of ["EUR", "RMB"])
      assert.ok(
        new Set(
          top.rows
            .filter((r) => r.currency === currency)
            .map((r) => r.customer),
        ).size <= 10,
      );
    const customer = other.customers[0];
    assert.ok(
      getReceivables(state, admin, {
        ...defaultReceivablesFilters,
        customerGroup: "other",
        customer,
      }).rows.every((r) => r.customer === customer),
    );
  },
);
test("source aging boundaries and Excel serial dates remain anchored to source calendar", () => {
  assert.equal(excelDate(46295), "2026-09-30");
  assert.equal(agingBucket("Not Due"), "not-due");
  for (const key of ["1-30", "31-60", "61-90", "91-120"] as const)
    assert.equal(agingBucket(`${key}days`), key);
  assert.equal(agingBucket(">120days"), "over-120");
  assert.equal(agingBucket(""), "unclassified");
});
test("W42 source preserves approved BU budgets and separately confirmed DCP correction", () => {
  const d = getDashboardSnapshot(state, admin, defaultFilters);
  assert.deepEqual(d.weeks, [42]);
  close(d.totals.base, 40271.30039);
  close(d.totals.remaining, 1736.2009);
  close(d.totals.budget, 33207);
  const dcp = d.rows.find((r) => r.entity.id === "dcp")!;
  close(dcp.metrics.sales, 260.81449);
  assert.ok(dcp.snapshot!.sourceCells.dcpYtdSales.includes("2026-10-19"));
  close(
    state.snapshots.find((s) => s.entityId === "dcp" && s.week === 42)!.turnover
      .external,
    200.091,
  );
  close(
    getDashboardSnapshot(state, admin, { ...defaultFilters, year: 2027 }).totals
      .base,
    3462.526,
  );
});
test("team filter reconciles known OB across teams; invoices and budgets remain unavailable; no mutation or India leakage", () => {
  const before = JSON.stringify(state);
  const all = getDashboardSnapshot(state, admin, defaultFilters);
  let total = 0;
  for (const team of all.salesTeams) {
    const data = getDashboardSnapshot(state, admin, {
      ...defaultFilters,
      salesTeam: team,
    });
    total += data.totals.orderbook ?? 0;
    assert.equal(data.totals.sales, null);
    assert.equal(data.totals.budget, null);
    assert.equal(data.totals.coverage, null);
  }
  close(total, all.totals.orderbook!);
  const teamState = salesTeamState(reportingState(state), "Coty Team");
  const twice = salesTeamState(teamState, "Coty Team");
  assert.ok(
    JSON.stringify(twice) === JSON.stringify(teamState),
    "Team projection must be idempotent",
  );
  assert.deepEqual(
    getDashboardSnapshot(state, india, { ...defaultFilters, region: "India" })
      .salesTeams,
    ["__unassigned__"],
  );
  assert.ok(JSON.stringify(state) === before, "Raw sources must not mutate");
});
sourceTest(
  "AR review/publish is scoped, does not change sales, and is idempotent",
  async () => {
    process.env.DIAM_DATA_PATH = path.join(
      os.tmpdir(),
      `diam-ar-${Date.now()}.json`,
    );
    const { storage } = await import("../lib/storage");
    const { repository } = await import("../lib/repository");
    const batch = {
      id: "ar-test",
      fileName: "Unknown Payment.xlsx",
      sourceType: "Excel",
      status: "review",
      entityIds: ["dhk", "ddc"],
      submittedBy: admin.id,
      submittedAt: new Date().toISOString(),
      findings: [],
      snapshots: [],
      lines: [],
      sheets: [],
      receivables: payments.records,
      receivablesKind: "payments",
    } as const;
    await assert.rejects(
      repository.createImportBatch(structuredClone(batch) as never, india),
      /outside your edit scope/,
    );
    const before = await storage.read();
    await repository.createImportBatch(structuredClone(batch) as never, admin);
    assert.deepEqual((await storage.read()).receivables ?? [], []);
    await assert.rejects(
      repository.publishImportBatch(batch.id, india, true),
      /not permitted/,
    );
    await repository.publishImportBatch(batch.id, admin, true);
    const after = await storage.read();
    assert.deepEqual(after.snapshots, before.snapshots);
    assert.equal(after.dataUpdatedAt, before.dataUpdatedAt);
    assert.equal(after.receivables!.length, 39);
    await repository.publishImportBatch(batch.id, admin, true);
    assert.equal((await storage.read()).receivables!.length, 39);
    await fs.promises.unlink(process.env.DIAM_DATA_PATH!);
  },
);
