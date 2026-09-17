import { strict as assert } from "node:assert";
import { test } from "node:test";
import { pages, pagePath, parsePagePath, loginDestination, switchLanguagePath } from "../lib/routes";
test("every page has a bilingual address", () => {
  for (const locale of ["en", "zh-CN"] as const) for (const page of pages)
    assert.deepEqual(parsePagePath(pagePath(locale, page)), { locale, page });
  for (const path of ["/", "/fr/overview", "/en/missing", "/en/admin/extra"])
    assert.equal(parsePagePath(path), null);
});
test("language switch preserves page and URL state", () => {
  assert.equal(switchLanguagePath("/en/imports?draft=1#form", "zh-CN"), "/zh-CN/imports?draft=1#form");
  assert.equal(loginDestination("/en/imports?draft=1", "zh-CN"), "/zh-CN/imports?draft=1");
});
test("login return paths cannot redirect externally or loop", () => {
  for (const path of [null, "https://evil.test", "//evil.test", "/\\evil.test", "/en/login", "/en/unknown"])
    assert.equal(loginDestination(path, "en"), "/en/overview");
});
