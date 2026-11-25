import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  pages,
  pagePath,
  parsePagePath,
  loginDestination,
  switchLanguagePath,
  sectionPath,
  isDashboardSection,
  salesPages,
  isSalesPage,
} from "../lib/routes";
test("every page has a bilingual address", () => {
  for (const locale of ["en", "zh-CN"] as const)
    for (const page of pages)
      assert.deepEqual(parsePagePath(pagePath(locale, page)), { locale, page });
  for (const path of [
    "/",
    "/fr/overview",
    "/en/missing",
    "/en/admin/extra",
    "/en/brand",
    "/zh-CN/brand",
  ])
    assert.equal(parsePagePath(path), null);
});
test("language switch preserves page and URL state", () => {
  assert.equal(
    switchLanguagePath("/en/imports?draft=1#form", "zh-CN"),
    "/zh-CN/imports?draft=1#form",
  );
  assert.equal(loginDestination("zh-CN"), "/zh-CN/home");
});
test("login language switching drops stale return paths", () => {
  for (const next of [
    "/en/overview",
    "/en/overview#analysis",
    "/en/imports",
    "https://evil.test",
    "/en/login",
  ]) {
    assert.equal(
      switchLanguagePath("/en/login?next=" + encodeURIComponent(next), "zh-CN"),
      "/zh-CN/login",
    );
  }
});
test("dashboard deep links preserve anchors while sign-in starts at home", () => {
  assert.equal(
    sectionPath("en", "business-units"),
    "/en/overview#business-units",
  );
  assert.equal(
    switchLanguagePath("/en/overview#analysis", "zh-CN"),
    "/zh-CN/overview#analysis",
  );
  assert.equal(loginDestination("en"), "/en/home");
  assert.equal(isDashboardSection("imports"), false);
});

test("Sales subsections have independent pages and former anchors reach their destination", () => {
  assert.deepEqual(salesPages, ["overview", "sales-team", "customer", "management-checks"]);
  assert.equal(sectionPath("en", "sales-team-section"), "/en/sales-team");
  assert.equal(sectionPath("en", "customer-section"), "/en/customer");
  assert.equal(sectionPath("zh-CN", "management-checks"), "/zh-CN/management-checks");
  assert.equal(switchLanguagePath("/en/sales-team", "zh-CN"), "/zh-CN/sales-team");
  assert.equal(isSalesPage("analysis"), false);
});

test("home is the default login destination and retains its locale", () => {
  assert.equal(loginDestination("zh-CN"), "/zh-CN/home");
  assert.equal(switchLanguagePath("/en/home", "zh-CN"), "/zh-CN/home");
  assert.equal(isDashboardSection("home"), false);
});
