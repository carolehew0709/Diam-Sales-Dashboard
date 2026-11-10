// Synthetic fixtures only; actual receivables and customer names stay private.
import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseDehkReceiveWorkbook } from "../lib/dehk-receive-parser";
import { identifyWorkbook } from "../lib/workbook-intake";

function fixture() {
  const book = XLSX.utils.book_new();
  const ledger = XLSX.utils.aoa_to_sheet([
    [],
    [
      "Date",
      "Invoice Number",
      "Customer",
      "Terms",
      "Sub-Customer",
      "Project",
      "Quantity",
      "Amount(EUR)",
      "Amount(USD)",
      "Amount(HKD)",
      "Amount(CNY)",
      "Divers in EUR",
      "Job No.",
      "Sales Team",
    ],
    [
      "2026-08-31",
      "INV-OLD",
      "Test Group",
      30,
      "Legal A",
      "Item",
      1,
      100,
      null,
      null,
      null,
      100,
      "Job A",
      "Team A",
    ],
    [
      "2026-10-30",
      "INV-OCT",
      "Test External",
      0,
      "Legal B",
      "Item",
      1,
      200,
      null,
      null,
      null,
      200,
      "Job B",
      "Team B",
    ],
    [],
  ]);
  ledger.L5 = { t: "n", f: "SUM(L3:L4)", v: 300 };
  ledger["!ref"] = "A1:P5";
  const old = XLSX.utils.aoa_to_sheet([
    ["Excluded October Invoices", ...Array(13).fill(null), "2026-10-31"],
    [
      "Date",
      "Invoice Number",
      "Customer",
      "Sub-Customer",
      "Project",
      "Quantity",
      "Amount(EUR)",
      "Amount(USD)",
      "Amount(HKD)",
      "Amount(CNY)",
      "Divers in EUR",
      "Job No.",
      "Sales Team",
      "Terms",
      "Overdue",
      "Aging",
      null,
      null,
      "Settled in November",
    ],
    [
      "2026-08-31",
      "INV-OLD",
      "Test Group",
      "Legal A",
      "Item",
      1,
      100,
      null,
      null,
      null,
      100,
      "Job A",
      "Team A",
      30,
      999,
      ">120days",
      null,
      null,
      "Settled Nov 4",
    ],
    [],
    [null, "Group", "Test Group", 100],
    ["Group", 0, 100, 100],
    ["External", 200, 0, 200],
  ]);
  old.K4 = { t: "n", f: "SUM(K3:K3)", v: 100 };
  const oct = XLSX.utils.aoa_to_sheet([
    [
      "Date",
      "Invoice Number",
      "Group/External",
      "Customer",
      "Terms",
      "Sub-Customer",
      "Project",
      "Quantity",
      "Amount(EUR)",
      "Amount(USD)",
      "Amount(HKD)",
      "Amount(CNY)",
      "Divers in EUR",
      "Job No.",
      "Sales Team",
    ],
    [
      "2026-10-30",
      "INV-OCT",
      "External",
      "Test External",
      0,
      "Legal B",
      "Item",
      1,
      200,
      null,
      null,
      null,
      200,
      "Job B",
      "Team B",
    ],
  ]);
  XLSX.utils.book_append_sheet(book, ledger, "ALL");
  XLSX.utils.book_append_sheet(book, old, "NEW Aging 20261031");
  XLSX.utils.book_append_sheet(book, oct, "Oct Invoice");
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([["2026-11-30", 999999]]),
    "Pre for November (NEW)",
  );
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([["Archived", 999999]]),
    "AGING 20260228(Old)",
  );
  book.Workbook = {
    Sheets: book.SheetNames.map((name) => ({
      name,
      Hidden: name.includes("Old") ? 1 : 0,
    })),
  };
  return book;
}
const bytes = (book: XLSX.WorkBook) =>
  XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
const parse = (book = fixture()) =>
  parseDehkReceiveWorkbook(bytes(book), "Test receive status.xlsx");
const errors = (book: XLSX.WorkBook) =>
  parse(book).findings.filter((f) => f.severity === "error");

test("complete DEHK receive status reconciles both ledgers and calculates approved month-end aging, never forecast aging", () => {
  const file = bytes(fixture()),
    result = parse();
  assert.equal(identifyWorkbook(file), "dehk-receive-aging");
  assert.deepEqual(result.replacementEntityIds, ["dhk"]);
  assert.equal(result.sourceKind, "aging");
  assert.deepEqual(
    result.findings.filter((f) => f.severity === "error"),
    [],
  );
  assert.equal(result.records.length, 2);
  assert.equal(
    result.records.reduce((s, r) => s + r.amount, 0),
    300,
  );
  const [old, current] = result.records;
  assert.equal(old.overdueDays, 31);
  assert.equal(old.aging, "31-60");
  assert.equal(current.overdueDays, 1);
  assert.equal(current.aging, "1-30");
  assert.equal(current.customerType, "External");
  assert.equal(old.customerType, "Group");
  assert.equal(old.amount, 100);
  assert.match(old.note, /Settled Nov 4/);
  assert.equal(old.sourceSheet, "ALL");
  assert.equal(old.sourceRow, 3);
  assert.equal(old.sourceAging, "");
  assert.ok(
    result.records.every(
      (r) =>
        r.asOfDate === "2026-10-31" && r.currency === "EUR" && r.pic === "",
    ),
  );
  assert.ok(result.findings.some((f) => f.severity === "review"));
});

test("ambiguous cutoffs and shifted or partial monthly sources block replacement", () => {
  for (const mutate of [
    (b: XLSX.WorkBook) => {
      b.Sheets["NEW Aging 20261031"].O1.v = "2026-10-30";
    },
    (b: XLSX.WorkBook) => {
      delete b.Sheets["Oct Invoice"];
    },
    (b: XLSX.WorkBook) => {
      b.Sheets.ALL.L2.v = "Amount USD";
    },
    (b: XLSX.WorkBook) => {
      b.Sheets["Oct Invoice"].M2.v = 190;
    },
    (b: XLSX.WorkBook) => {
      b.Sheets.ALL.L5.v = 301;
    },
    (b: XLSX.WorkBook) => {
      b.Sheets["NEW Aging 20261031"].D6.v = 101;
    },
  ]) {
    const b = fixture();
    mutate(b);
    assert.ok(errors(b).length);
  }
});

test("missing formula caches, invalid terms, missing classifications and dates cannot become zeros", () => {
  for (const mutate of [
    (b: XLSX.WorkBook) => {
      b.Sheets.ALL.L3 = { t: "n", f: "100+0" };
    },
    (b: XLSX.WorkBook) => {
      b.Sheets.ALL.D3.v = "30 days";
    },
    (b: XLSX.WorkBook) => {
      b.Sheets.ALL.A3 = { t: "e", v: 15 };
    },
    (b: XLSX.WorkBook) => {
      b.Sheets["NEW Aging 20261031"].B5.v = "Unknown";
    },
    (b: XLSX.WorkBook) => {
      b.Sheets["Oct Invoice"].C2.v = "";
    },
  ]) {
    const b = fixture();
    mutate(b);
    assert.ok(errors(b).length);
  }
});

test("mixed Sales and DEHK receive templates are never silently routed", () => {
  const b = fixture();
  XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet([[1]]), "W45");
  assert.throws(() => identifyWorkbook(bytes(b)), /mixed or unknown/);
});

test("signed EUR balances are preserved and matched repeated invoice lines are not deduplicated", () => {
  const signed = fixture();
  signed.Sheets.ALL.L3.v = -100;
  signed.Sheets.ALL.L5.v = 100;
  const old = signed.Sheets["NEW Aging 20261031"];
  for (const cell of ["K3", "K4", "D5", "C6", "D6"]) old[cell].v = -100;
  assert.deepEqual(errors(signed), []);
  assert.equal(parse(signed).records[0].amount, -100);

  const duplicate = fixture(),
    ledger = duplicate.Sheets.ALL;
  for (let c = 0; c < 14; c++) {
    const letter = XLSX.utils.encode_col(c);
    if (ledger[`${letter}4`])
      ledger[`${letter}5`] = { ...ledger[`${letter}4`] };
  }
  ledger.L6 = { t: "n", f: "SUM(L3:L5)", v: 500 };
  ledger["!ref"] = "A1:P6";
  const current = duplicate.Sheets["Oct Invoice"];
  for (let c = 0; c < 15; c++) {
    const letter = XLSX.utils.encode_col(c);
    if (current[`${letter}2`])
      current[`${letter}3`] = { ...current[`${letter}2`] };
  }
  current["!ref"] = "A1:O3";
  duplicate.Sheets["NEW Aging 20261031"].B7.v = 400;
  duplicate.Sheets["NEW Aging 20261031"].D7.v = 400;
  assert.deepEqual(errors(duplicate), []);
  assert.equal(parse(duplicate).records.length, 3);
  assert.equal(
    parse(duplicate).records.reduce((s, r) => s + r.amount, 0),
    500,
  );
});
