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
  userAccessPolicy,
} from "../lib/permissions";
import { salesPages } from "../lib/routes";
import { securityChanged } from "../lib/account-management";
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
      .map((entity) => entity.id)
      .sort(),
    ["dcp", "ddc", "dhk"],
  );
  for (const page of [
    ...salesPages,
    "analysis",
    "business-units",
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

test("An account without Sales Performance access cannot open any Sales subpage", () => {
  const arOnly: User = { ...finance, access: { modules: ["ar-aging"], export: true } };
  for (const page of salesPages) assert.equal(canAccessPage(arOnly, page), false);
});

test("Account access editing preserves legacy defaults and disabled account configuration", () => {
  const legacy = { ...finance, access: undefined };
  assert.deepEqual(userAccessPolicy(legacy), {
    modules: workspaceModules,
    export: true,
  });
  assert.deepEqual(userAccessPolicy({ ...finance, disabled: true }), {
    modules: ["overview", "sales-operations", "ar-aging"],
    export: false,
  });
  assert.deepEqual(
    userAccessPolicy({ ...finance, access: { modules: [], export: true } }),
    {
      modules: [],
      export: true,
    },
  );
  const policy = userAccessPolicy(legacy);
  policy.modules.pop();
  assert.equal(workspaceModules.length, 5);
});

test("Module and export changes revoke sessions without treating module order as a permission change", () => {
  assert.equal(
    securityChanged(finance, {
      ...finance,
      access: { ...finance.access!, modules: ["overview"] },
    }),
    true,
  );
  assert.equal(
    securityChanged(finance, {
      ...finance,
      access: { ...finance.access!, export: true },
    }),
    true,
  );
  assert.equal(
    securityChanged(finance, {
      ...finance,
      access: {
        ...finance.access!,
        modules: [...finance.access!.modules].reverse(),
      },
    }),
    false,
  );
  assert.equal(
    securityChanged(finance, { ...finance, name: "Updated name" }),
    false,
  );
  assert.equal(
    securityChanged(
      { ...finance, access: undefined },
      { ...finance, access: { modules: [...workspaceModules], export: true } },
    ),
    false,
  );
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
