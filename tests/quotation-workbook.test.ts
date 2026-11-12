import assert from "node:assert/strict";
import { test } from "node:test";
import { utils } from "xlsx";
import {
  calculateCosts,
  processStandardAddresses,
  quoteAmounts,
  readCostSheets,
  type QuoteLine,
} from "../lib/quotation-workbook";

const workbook = utils.book_new();
utils.book_append_sheet(workbook, utils.aoa_to_sheet([["Item", "Unit price"]]), "Summary");
utils.book_append_sheet(workbook, {
  "!ref": "A1:S145",
  A7: { t: "s", v: "PART NAME" },
  A10: { t: "s", v: "PART QUANTITY" },
  D10: { t: "n", v: 2 },
  B45: { t: "n", f: "B46", v: 0.5 },
  B46: { t: "n", f: "B47", v: 0.5 },
  B47: { t: "n", f: 'IF($S$6="P",#REF!,[4]Data!B43)', v: 0.5 },
  B49: { t: "n", v: 0.2 },
  S6: { t: "s", v: "d" },
  D60: { t: "n", f: "D145+D10*10" },
  D69: { t: "n", f: "SUM(D60:D61)" },
  D145: { t: "n", f: "D10*(B45+B49)" },
}, "Cost");
const [sheet] = readCostSheets(workbook);
const line: QuoteLine = {
  id: 1, sheet: "Cost", source: "D69", costUnits: "1", quantity: "3",
  item: "Sample", description: "", picture: null, size: "", inputs: {},
};

test("reads cost sheets and recalculates helpers below the visible rows", () => {
  assert.deepEqual(readCostSheets(workbook).map((cost) => cost.name), ["Cost"]);
  assert.deepEqual(processStandardAddresses(sheet), ["B45", "B46", "B47", "B49"]);
  assert.equal(calculateCosts(sheet).value("D69"), 21.4);
  assert.equal(calculateCosts(sheet, { D10: "4" }).value("D69"), 42.8);
});

test("process standards cascade and still allow local overrides", () => {
  const updated = calculateCosts(sheet, {}, { B47: "1.5", B49: "0" });
  assert.equal(updated.value("B45"), 1.5);
  assert.equal(updated.value("D69"), 23);
  assert.equal(calculateCosts(sheet, {}, { B45: "2", B47: "1.5" }).value("B45"), 2);
  assert.throws(() => calculateCosts(sheet, { S6: "P" }).value("D69"), /B47 #REF!/);
  assert.equal(calculateCosts(sheet, { S6: "P" }, { B47: "1" }).value("D69"), 22.4);
});

test("markup applies to unit cost and order quantity affects only line amount", () => {
  assert.deepEqual(quoteAmounts(sheet, line, "5", "1"), { cost: 21.4, unit: 22.47, cents: 6741 });
  assert.deepEqual(quoteAmounts(sheet, { ...line, quantity: "2" }, "5", "1"), { cost: 21.4, unit: 22.47, cents: 4494 });
  assert.deepEqual(quoteAmounts(sheet, { ...line, source: "D60:D61", costUnits: "2" }, "5", "2"), { cost: 21.4, unit: 22.47, cents: 6741 });
  assert.equal(quoteAmounts(sheet, line, "", "1").cents, null);
  assert.throws(() => quoteAmounts(sheet, line, "5", ""), /exchange/);
});
