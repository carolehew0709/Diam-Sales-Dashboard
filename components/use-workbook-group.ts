"use client";
import { useEffect, type ReactNode, type RefObject } from "react";
import { registerWorkbookGroup } from "@/lib/chart-workbook-groups";

export function useWorkbookGroup(
  root: RefObject<HTMLElement>,
  render: (() => ReactNode) | null,
) {
  useEffect(() => {
    if (!root.current || !render) return;
    return registerWorkbookGroup(root.current, { render });
  }, [root, render]);
}
