import test from "node:test";
import assert from "node:assert/strict";
import { keyCustomerOrderbook, keyCustomers } from "../lib/key-customers";

test("key customer OB combines explicit spelling/annotated variants without inferring brand parents", () => {
  const rows = [
    { customer: "Coty", value: 10 }, { customer: "COTY", value: 2.5 },
    { customer: "L‘oreal(PACK)", value: 3 }, { customer: "L'Oréal", value: -1 },
    { customer: "ESTEE LAUDER(TR)", value: 4 }, { customer: "Estée Lauder", value: 5 },
    { customer: "LVMH-Dior", value: 6 }, { customer: "LVMH", value: 7 },
    { customer: "Dior", value: 800 }, { customer: "Lancome", value: 900 },
    { customer: "Sephora", value: 0 },
  ];
  const result = keyCustomerOrderbook(rows);
  assert.deepEqual(result.map((row) => row.name), keyCustomers);
  assert.deepEqual(result.map((row) => row.value), [0, 9, 2, 13, 12.5, null]);
  assert.deepEqual(result.find((row) => row.name === "Loreal")!.sources, ["L‘oreal(PACK)", "L'Oréal"]);
  assert.equal(rows[1].customer, "COTY");
});

test("absent key customer source amounts remain missing, including empty authorized scopes", () => {
  const rows = keyCustomerOrderbook([]);
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => row.value === null && row.sources.length === 0));
});
