import { useState } from "react";
import type { RedlineResult } from "../vs01/agreementRedline";
import { RecipientRedlineInline } from "./RecipientRedlineInline";

type Props = {
  redline: RedlineResult;
};

/**
 * Full-document diff: collapsed by default, scrollable, normal typography (not a primary review surface).
 */
export function RecipientAdvancedRedlinePanel({ redline }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 space-y-2" data-testid="recipient-advanced-redline-panel">
      <p className="rounded-md border border-amber-900/35 bg-amber-950/20 px-2 py-1.5 text-[10px] leading-snug text-amber-100/95">
        Advanced compare can be long and noisy. Prefer <span className="font-medium text-amber-50">Changed clauses</span>{" "}
        for day-to-day review.
      </p>
      <button
        type="button"
        className="w-full rounded-md border border-slate-600/80 bg-slate-900/60 px-2 py-1.5 text-left text-[10px] font-medium text-sky-300 hover:bg-slate-800/80"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide advanced full-document compare" : "Show advanced full-document compare"}
      </button>
      {open ? (
        <div
          className="max-h-[min(32rem,70vh)] overflow-auto rounded-md border border-slate-700/80 bg-white p-3 text-sm leading-normal tracking-normal text-slate-900"
          data-testid="recipient-advanced-redline-scroll"
        >
          <div className="whitespace-pre-wrap break-words">
            <RecipientRedlineInline redline={redline} paragraphBreaks embedded />
          </div>
        </div>
      ) : null}
    </div>
  );
}
