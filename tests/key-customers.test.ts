import test from "node:test";
import assert from "node:assert/strict";
import { rankedCustomerProspect } from "../lib/key-customers";

test("key customer OB combines explicit spelling/annotated variants without inferring brand parents", () => {
  const rows = [
    { customer: "Coty", value: 10 },
    { customer: "COTY", value: 2.5 },
    { customer: "L‘oreal(PACK)", value: 3 },
    { customer: "L'Oréal", value: -1 },
    { customer: "ESTEE LAUDER(TR)", value: 4 },
    { customer: "Estée Lauder", value: 5 },
    { customer: "LVMH-Dior", value: 6 },
    { customer: "LVMH", value: 7 },
    { customer: "Dior", value: 800 },
    { customer: "Lancome", value: 900 },
    { customer: "Sephora", value: 0 },
  ];
  const result = rankedCustomerProspect(rows);
  assert.deepEqual(
    result.map(({ name, value }) => [name, value]),
    [
      ["Lancome", 900],
      ["Dior", 800],
      ["LVMH", 13],
      ["Coty", 12.5],
      ["Estee Lauder", 9],
      ["Loreal", 2],
      ["Sephora", 0],
    ],
  );
  assert.deepEqual(
    [...result.find((row) => row.name === "Loreal")!.sources],
    ["L‘oreal(PACK)", "L'Oréal"],
  );
  assert.equal(rows[1].customer, "COTY");
});

test("ranking expands past the former six, excludes unnamed rows and is stable for ties", () => {
  assert.deepEqual(rankedCustomerProspect([]), []);
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => ({
      customer: `Customer ${i}`,
      value: i,
    })),
    { customer: " ", value: 500 },
    { customer: "Unspecified customer", value: 500 },
    { customer: " customer 3 ", value: 6 },
  ];
  const ranked = rankedCustomerProspect(rows);
  assert.equal(ranked.length, 10);
  assert.deepEqual(
    ranked.slice(0, 4).map((row) => row.name),
    ["Customer 3", "Customer 9", "Customer 8", "Customer 7"],
  );
});
