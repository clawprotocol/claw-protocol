import { useState } from "react";
import type { RedlineResult } from "../vs01/agreementRedline";
import { RecipientRedlineInline } from "./RecipientRedlineInline";

type Props = {
  redline: RedlineResult;
  showTrackedChanges: boolean;
  /** Scrubbed proposed HTML for clean mode when expanded. */
  proposedHtmlClean: string;
};

function countChangeSegments(redline: RedlineResult): number {
  return redline.segments.filter((s) => s.type === "insert" || s.type === "delete").length;
}

/**
 * Full-document diff: collapsed by default; respects global tracked-changes toggle.
 */
export function RecipientAdvancedRedlinePanel({
  redline,
  showTrackedChanges,
  proposedHtmlClean,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasSegments = countChangeSegments(redline) > 0;

  return (
    <div className="mt-2 space-y-2" data-testid="recipient-advanced-redline-panel">
      <p className="rounded-md border border-amber-900/35 bg-amber-950/20 px-2 py-1.5 text-[10px] leading-snug text-amber-100/95">
        Optional full-document compare — usually noisier than{" "}
        <span className="font-medium text-amber-50">Changed clauses</span>.
      </p>
      <button
        type="button"
        className="w-full min-h-[44px] rounded-md border border-slate-600/80 bg-slate-900/60 px-2 py-2 text-left text-[10px] font-medium text-sky-300 hover:bg-slate-800/80 sm:min-h-0 sm:py-1.5"
        aria-expanded={open}
        data-testid="recipient-advanced-redline-disclosure-trigger"
        title="Advanced full-document compare"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide advanced full-document compare" : "Show advanced full-document compare"}
      </button>
      {open ? (
        <div
          className="max-h-[min(32rem,70vh)] overflow-auto rounded-md border border-slate-700/80 bg-white p-3 text-sm leading-normal tracking-normal text-slate-900"
          data-testid="recipient-advanced-redline-scroll"
        >
          {!showTrackedChanges ? (
            <div
              className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-900"
              dangerouslySetInnerHTML={{
                __html: proposedHtmlClean || "<p>No preview.</p>",
              }}
            />
          ) : !redline.hasChanges || !hasSegments ? (
            <p className="text-[11px] leading-snug text-slate-600">
              No visible redline segments were generated. Review <strong>Changed clauses</strong> instead.
            </p>
          ) : (
            <div className="whitespace-pre-wrap break-words">
              <RecipientRedlineInline redline={redline} paragraphBreaks embedded contrast="high" />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
