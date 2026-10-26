import test from "node:test";
import assert from "node:assert/strict";
import { messages, translate, displayText } from "../lib/i18n";

test("displayed orderbook is Prospect in both languages and legacy additional P1 remains distinct", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    assert.equal(translate(locale, "metric.ob"), "Prospect");
    assert.ok(translate(locale, "metric.base").includes("Prospect"));
    assert.ok(translate(locale, "metric.prospect").includes("P1"));
    assert.ok(translate(locale, "graphics.monthlyScenario").includes("Prospect"));
    assert.ok(translate(locale, "graphics.monthlyScenario").includes("P1"));
    assert.ok(translate(locale, "notes.coverage").includes("Prospect"));
    assert.ok(translate(locale, "notes.coverage").includes("P1"));
    assert.ok(translate(locale, "export.prospectDetail").includes("Prospect"));
    for (const value of Object.values(messages[locale])) assert.doesNotMatch(value, /\bOB\b|order\s?book|订单簿/i);
  }
});

test("stored legacy source findings display the new metric name without changing source evidence", () => {
  const source = "Prospect not supplied";
  assert.equal(displayText("en", source), translate("en", "validation.prospect"));
  assert.equal(displayText("zh-CN", source), translate("zh-CN", "validation.prospect"));
  assert.equal(displayText("en", "Team invoices and budget not supplied; only team orderbook is available"), translate("en", "checks.teamMissing"));
  assert.equal(source, "Prospect not supplied");
});
