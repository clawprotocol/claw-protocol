import React from "react";
import type { ReviewChangeLedger } from "../../agreement/reviewChangeLedger";

/** Collapsible paragraph-level change ledger for owner review (simple-home compare). */
export function ReviewChangeLedgerPanel(props: { ledger: ReviewChangeLedger }): React.ReactElement | null {
  const { ledger } = props;
  if (ledger.entries.length === 0) {
    return (
      <p className="mt-3 text-[10px] text-slate-500">
        No paragraph-level text changes detected between current preview and proposed text.
      </p>
    );
  }
  return (
    <details className="mt-3 rounded-md border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-[11px] text-slate-200">
      <summary className="cursor-pointer select-none font-semibold text-slate-200">
        Changes detected ({ledger.stats.added} added, {ledger.stats.removed} removed, {ledger.stats.changed}{" "}
        changed)
      </summary>
      {ledger.truncated ? (
        <p className="mt-2 text-[10px] text-amber-200/85">
          Ledger truncated at paragraph limit — use full draft compare for the remainder.
        </p>
      ) : null}
      <ul className="mt-2 max-h-[16rem] list-none space-y-2 overflow-y-auto overscroll-y-contain pl-0">
        {ledger.entries.map((e) => (
          <li key={e.id} className="rounded border border-slate-800/80 bg-slate-950/40 px-2 py-1.5">
            <div className="flex flex-wrap gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span>{e.type}</span>
              {e.riskTags.map((t) => (
                <span key={t} className="rounded bg-slate-800/90 px-1 normal-case text-slate-300">
                  {t.replace(/_/g, " ")}
                </span>
              ))}
            </div>
            {e.sectionHeading ? <div className="mt-0.5 text-[10px] text-slate-500">{e.sectionHeading}</div> : null}
            {e.beforeText ? (
              <div className="mt-1 whitespace-pre-wrap break-words text-rose-100/90 line-through decoration-rose-900/30">
                {e.beforeText.length > 480 ? `${e.beforeText.slice(0, 480)}…` : e.beforeText}
              </div>
            ) : null}
            {e.afterText ? (
              <div className="mt-1 whitespace-pre-wrap break-words text-emerald-100/95">
                {e.afterText.length > 480 ? `${e.afterText.slice(0, 480)}…` : e.afterText}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
