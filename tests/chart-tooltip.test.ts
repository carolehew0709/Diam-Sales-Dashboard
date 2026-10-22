import test from "node:test";
import assert from "node:assert/strict";
import { chartAmount, tooltipPosition } from "../lib/chart-tooltip";

test("tooltip flips around the pointer and stays inside the viewport at chart edges", () => {
  assert.deepEqual(tooltipPosition(200, 100, 240, 150, 1200, 800), {
    x: 216,
    y: 116,
  });
  assert.deepEqual(tooltipPosition(1190, 790, 240, 150, 1200, 800), {
    x: 934,
    y: 624,
  });
  const narrow = tooltipPosition(385, 820, 330, 280, 390, 844);
  assert.ok(narrow.x >= 12 && narrow.x + 330 <= 378);
  assert.ok(narrow.y >= 12 && narrow.y + 280 <= 832);
  assert.deepEqual(tooltipPosition(0, 0, 240, 150, 1200, 800), {
    x: 16,
    y: 16,
  });
});
test("tooltip amounts keep units, signed values and source missingness in both languages", () => {
  assert.equal(chartAmount(null, "en"), "—");
  assert.equal(chartAmount(null, "zh-CN"), "—");
  assert.equal(chartAmount(0, "en"), "0.00 kEUR");
  assert.equal(chartAmount(-260.81449, "zh-CN"), "-260.81 kEUR");
  assert.equal(chartAmount(11923, "en"), "11,923.00 kEUR");
});
