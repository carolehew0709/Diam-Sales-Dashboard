"use client";

import { useI18n } from "./i18n-provider";
import { userAccessPolicy, workspaceModules } from "@/lib/permissions";
import type { MessageKey } from "@/lib/i18n";
import type { User, WorkspaceModule } from "@/lib/types";
import styles from "./account-module-access.module.css";

const labels: Record<WorkspaceModule, MessageKey> = {
  overview: "nav.performance",
  pipeline: "pipeline.title",
  "sales-operations": "nav.salesOperations",
  "ar-aging": "ar.nav",
  quotation: "quote.title",
};

export function AccountModuleAccess({
  user,
  onChange,
}: {
  user: User;
  onChange: (access: NonNullable<User["access"]>) => void;
}) {
  const { tr } = useI18n();
  const access = userAccessPolicy(user);
  return (
    <section
      className={styles.section}
      aria-labelledby="account-module-heading"
    >
      <div className="admin-scope-heading">
        <h3 id="account-module-heading">{tr("admin.moduleAccess")}</h3>
        <p className="muted">{tr("admin.moduleHint")}</p>
      </div>
      <div className={styles.modules}>
        {workspaceModules.map((module) => (
          <label key={module} className={styles.option}>
            <span>{tr(labels[module])}</span>
            <input
              type="checkbox"
              checked={access.modules.includes(module)}
              onChange={(event) =>
                onChange({
                  ...access,
                  modules: workspaceModules.filter((item) =>
                    item === module
                      ? event.target.checked
                      : access.modules.includes(item),
                  ),
                })
              }
            />
          </label>
        ))}
      </div>
      <label className={`${styles.option} ${styles.export}`}>
        <span>
          {tr("admin.exportAccess")}
          <small>{tr("admin.exportHint")}</small>
        </span>
        <input
          type="checkbox"
          checked={access.export}
          onChange={(event) =>
            onChange({ ...access, export: event.target.checked })
          }
        />
      </label>
      <p className={styles.note}>{tr("admin.moduleSessionHint")}</p>
    </section>
  );
}
