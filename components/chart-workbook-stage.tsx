"use client";
import { Fragment, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ExportI18nProvider } from "./i18n-provider";
import type { Locale } from "@/lib/i18n";
import type { WorkbookGroup } from "@/lib/chart-workbook-groups";
import { collectWorkbookCharts } from "@/lib/chart-workbook-registry";

function Ready({ done }: { done: () => void }) {
  useEffect(done, [done]);
  return null;
}

/** Render the already-authorized snapshot in the chosen language, without another data request. */
export async function prepareWorkbookCharts(
  groups: WorkbookGroup[],
  locale: Locale,
) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  host.style.cssText =
    "position:fixed;left:-100000px;top:0;width:1200px;pointer-events:none";
  document.body.append(host);
  const root = createRoot(host);
  const dispose = () => {
    root.unmount();
    host.remove();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Localized chart rendering timed out")),
        15000,
      );
      const ready = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      root.render(
        <ExportI18nProvider locale={locale}>
          {groups.map((group, i) => (
            <Fragment key={i}>{group.render()}</Fragment>
          ))}
          <Ready done={ready} />
        </ExportI18nProvider>,
      );
    });
    return { charts: collectWorkbookCharts(host), dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
