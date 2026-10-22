import type { ReactNode } from "react";

export type WorkbookGroup = { render: () => ReactNode };
const groups = new WeakMap<HTMLElement, WorkbookGroup>();
export function registerWorkbookGroup(root: HTMLElement, group: WorkbookGroup) {
  groups.set(root, group);
  root.setAttribute("data-workbook-group", "true");
  return () => {
    groups.delete(root);
    root.removeAttribute("data-workbook-group");
  };
}
export function collectWorkbookGroups(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>("[data-workbook-group]"),
  ).flatMap((element) => {
    const group = groups.get(element);
    return group ? [group] : [];
  });
}
