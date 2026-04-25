import { useMemo } from "react";
import { useLaunchNav } from "../LaunchNavContext";
import { Vs01Wizard } from "../../vs01/Vs01Wizard";
import { SimpleFlowShell } from "./SimpleFlowShell";

function parseQuickStartIntent(search: string): "pdf" | "type" | "speak" | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const v = (new URLSearchParams(raw).get("start") || "").trim().toLowerCase();
  if (v === "pdf" || v === "type" || v === "speak") return v;
  return null;
}

/**
 * Primary product entry: same VS01 engine, one place to start (PDF, type, or speak — type/speak continue in Create).
 */
export function QuickSendPage() {
  const { search } = useLaunchNav();
  const quickEntryIntent = useMemo(() => parseQuickStartIntent(search || ""), [search]);

  return (
    <SimpleFlowShell title="Start an agreement" subtitle="Upload a PDF for the fastest start.">
      <p className="mb-6 max-w-full min-w-0 text-center text-sm font-medium leading-relaxed text-slate-400 sm:mb-8 sm:max-w-xl sm:text-left">
        Typing and speaking start the same send/sign/proof workflow.
      </p>
      <Vs01Wizard hideStepper quickEntryIntent={quickEntryIntent} />
    </SimpleFlowShell>
  );
}
