import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessModule,
  canAccessPage,
  canExportData,
  canEdit,
  canManageUsers,
  canPublish,
  canView,
  validUserAccess,
  workspaceModules,
} from "../lib/permissions";
import { entities } from "../lib/entities";
import { hasPipelineAccess, pipelineForWeek } from "../lib/pipeline";
import { hasReceivablesAccess } from "../lib/receivables";
import type { User } from "../lib/types";

const finance: User = {
  id: "synthetic-finance",
  name: "Finance reader",
  email: "finance@example.invalid",
  role: "viewer",
  region: "APAC",
  crossRegionView: false,
  permissions: { dhk: ["view"], ddc: ["view"], dcp: ["view"] },
  access: {
    modules: ["overview", "ar-aging", "sales-operations"],
    export: false,
  },
};

test("Finance readers have only their selected modules and China Entity scope", () => {
  assert.deepEqual(
    entities
      .filter((entity) => canView(finance, entity))
      .map((entity) => entity.id).sort(),
    ["dcp", "ddc", "dhk"],
  );
  for (const page of [
    "overview",
    "analysis",
    "business-units",
    "management-checks",
    "ar-aging",
    "sales-operations",
  ] as const)
    assert.equal(canAccessPage(finance, page), true);
  for (const page of ["pipeline", "quotation"] as const)
    assert.equal(canAccessPage(finance, page), false);
  assert.equal(hasPipelineAccess(finance), false);
  assert.deepEqual(pipelineForWeek([], finance, null).scope, []);
  assert.equal(hasReceivablesAccess(finance), true);
  assert.equal(canExportData(finance), false);
  assert.equal(canManageUsers(finance), false);
  for (const entity of entities) {
    assert.equal(canEdit(finance, entity), false);
    assert.equal(canPublish(finance, entity), false);
  }
});

test("Module policies validate their fields and preserve existing account permissions", () => {
  assert.equal(validUserAccess(finance.access), true);
  for (const access of [
    null,
    { modules: ["pipeline"] },
    { modules: ["invalid"], export: false },
    { modules: "overview", export: false },
    { modules: [], export: "false" },
  ])
    assert.equal(validUserAccess(access), false);
  const legacy = { ...finance, access: undefined };
  assert.equal(canExportData(legacy), true);
  for (const module of workspaceModules)
    assert.equal(canAccessModule(legacy, module), true);
  assert.equal(
    canAccessModule({ ...finance, disabled: true }, "overview"),
    false,
  );
});
