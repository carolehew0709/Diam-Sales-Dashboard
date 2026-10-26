"use client";
import { useI18n } from "./i18n-provider";

/** Occupies no layout space; fast responses do not flash a loading label. */
export function UpdateStatus({ pending }: { pending: boolean }) {
  const { tr } = useI18n();
  return (
    <span className="scope-update-status" role="status" aria-live="polite">
      {pending ? tr("auth.updating") : ""}
    </span>
  );
}
