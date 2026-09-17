import assert from "node:assert/strict";
import test from "node:test";
import { displayText, isLocale, messages, translate } from "../lib/i18n";

test("English and Chinese catalogs have identical keys and interpolation parameters", () => {
  assert.deepEqual(
    Object.keys(messages.en).sort(),
    Object.keys(messages["zh-CN"]).sort(),
  );
  for (const key of Object.keys(messages.en) as (keyof typeof messages.en)[]) {
    assert.ok(messages.en[key].trim());
    assert.ok(messages["zh-CN"][key].trim());
    assert.deepEqual(
      messages.en[key].match(/\{\w+\}/g)?.sort(),
      messages["zh-CN"][key].match(/\{\w+\}/g)?.sort(),
      key,
    );
  }
});
test("translations interpolate data without changing source values", () => {
  assert.equal(
    translate("zh-CN", "notes.revision", { revision: 17 }),
    "版本 17",
  );
  assert.equal(
    translate("en", "notes.revision", { revision: 17 }),
    "revision 17",
  );
  assert.equal(displayText("zh-CN", "region_admin"), "地区管理员");
  assert.equal(displayText("zh-CN", "External"), "外部销售");
  assert.equal(displayText("en", "香港外销"), "Hong Kong export sales");
  assert.equal(displayText("zh-CN", "CHANEL"), "CHANEL");
  assert.equal(
    displayText("zh-CN", "Dashboard 2026 - DDC.xlsx"),
    "Dashboard 2026 - DDC.xlsx",
  );
});
test("API validation templates localize field names and preserve line numbers", () => {
  assert.equal(
    displayText("zh-CN", "YTD external is required"),
    "请填写本年累计外部销售",
  );
  assert.equal(
    displayText("zh-CN", "Line 12: product and customer are required"),
    "第 12 行：请填写产品和客户",
  );
  assert.equal(
    displayText("zh-CN", "Invalid email or password"),
    "邮箱或密码错误",
  );
});
test("language preference only accepts supported locales", () => {
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("zh-CN"), true);
  for (const value of [null, "", "fr", "zh", 1])
    assert.equal(isLocale(value), false);
});
