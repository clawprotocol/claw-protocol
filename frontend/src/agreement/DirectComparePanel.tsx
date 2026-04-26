import { useCallback, useEffect, useId, useState } from "react";
import { analyzeDirectTextCompare, type ClauseRow, type DirectTextCompareResult } from "../vs01/directAgreementTextCompare";
import { DIRECT_COMPARE_DISCLAIMER, DIRECT_COMPARE_MODE_INTRO } from "./portableReviewCopy";

type Props = {
  /** Shown in "Current" on first open or when refreshed from draft. */
  defaultBefore: string;
};

export function DirectComparePanel({ defaultBefore }: Props) {
  const [before, setBefore] = useState(defaultBefore);
  const [after, setAfter] = useState("");
  const [result, setResult] = useState<DirectTextCompareResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const aId = useId();
  const bId = useId();

  useEffect(() => {
    if (!dirty) setBefore(defaultBefore);
  }, [defaultBefore, dirty]);

  const run = useCallback(() => {
    setResult(analyzeDirectTextCompare(before, after));
  }, [before, after]);

  return (
    <div className="space-y-4 rounded-2xl border border-slate-600/50 bg-slate-950/45 p-4 ring-1 ring-slate-700/25">
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Direct compare</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-300">{DIRECT_COMPARE_MODE_INTRO}</p>
        <p className="mt-2 text-[0.7rem] font-medium text-amber-100/90">{DIRECT_COMPARE_DISCLAIMER}</p>
        {defaultBefore.trim() ? (
          <button
            type="button"
            className="mt-1.5 text-left text-[0.65rem] font-medium text-sky-300/90 underline decoration-slate-600 hover:text-sky-200"
            onClick={() => {
              setDirty(false);
              setBefore(defaultBefore);
            }}
          >
            Use current on-screen agreement text
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-500" htmlFor={aId}>
            Current text
          </label>
          <textarea
            id={aId}
            className="h-32 w-full rounded-xl border border-slate-600/80 bg-slate-950/80 px-3 py-2.5 text-xs text-slate-100 shadow-inner"
            value={before}
            onChange={(e) => {
              setDirty(true);
              setBefore(e.target.value);
            }}
            spellCheck={false}
            placeholder="Paste the agreement text you are comparing from…"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-500" htmlFor={bId}>
            Revised text
          </label>
          <textarea
            id={bId}
            className="h-32 w-full rounded-xl border border-slate-600/80 bg-slate-950/80 px-3 py-2.5 text-xs text-slate-100 shadow-inner"
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            spellCheck={false}
            placeholder="Paste the revised or proposed text…"
          />
        </div>
      </div>
      <div>
        <button
          type="button"
          className="rounded-lg border border-slate-600/90 bg-slate-900/90 px-4 py-2 text-xs font-semibold text-slate-100 shadow-sm hover:bg-slate-800"
          onClick={run}
        >
          Run comparison
        </button>
      </div>
      {result ? <DirectCompareResultView result={result} /> : null}
    </div>
  );
}

function DirectCompareResultView({ result }: { result: DirectTextCompareResult }) {
  const { redline, clauseRows } = result;
  const showRows = clauseRows.filter(
    (r) => r.kind === "add" || r.kind === "remove" || r.kind === "edit",
  );

  return (
    <div className="space-y-4 border-t border-slate-700/60 pt-4">
      <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span>
          Approx. additions: <span className="text-emerald-200/90">{result.additionWordsApprox}</span> words
        </span>
        <span>·</span>
        <span>
          Approx. deletions: <span className="text-rose-200/80">{result.deletionWordsApprox}</span> words
        </span>
        {result.truncated ? (
          <>
            <span>·</span>
            <span className="text-amber-200/80">Long documents are compared up to 200 blocks.</span>
          </>
        ) : null}
      </div>

      {result.topicHighlights.length > 0 ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Thematic focus</div>
          <ul className="mt-2 space-y-2">
            {result.topicHighlights.map((h) => (
              <li
                key={h.id}
                className="rounded-xl border border-slate-600/50 bg-slate-900/40 p-3 text-xs text-slate-200"
              >
                <div className="font-medium text-slate-100">{h.label}</div>
                {h.before ? (
                  <p className="mt-1.5 text-[0.7rem] leading-snug text-rose-100/85 line-through decoration-rose-500/30">
                    {h.before}
                  </p>
                ) : null}
                {h.after ? (
                  <p className="mt-1 text-[0.7rem] leading-snug text-emerald-100/90">{h.after}</p>
                ) : null}
                {!h.before && h.after ? <p className="mt-1 text-[0.65rem] text-slate-500">New in the revised text</p> : null}
                {h.before && !h.after ? <p className="mt-1 text-[0.65rem] text-slate-500">Removed in the revised text</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showRows.length > 0 ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Clause &amp; block alignment</div>
          <p className="mb-1 text-[0.65rem] text-slate-500">
            {result.unchangedClauses} block(s) unchanged · {result.editedClauses} updated · {result.addedClauses} added
            {" · "}
            {result.removedClauses} removed
          </p>
          <ul className="mt-1 max-h-56 space-y-2 overflow-y-auto pr-1">
            {showRows.map((row, i) => (
              <li key={i} className="rounded-lg border border-slate-700/60 bg-slate-950/50 p-2.5 text-[0.7rem] leading-snug text-slate-200">
                {clauseRowLine(row)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {redline.hasChanges ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Text-level changes</div>
          <p className="mb-1 text-[0.65rem] text-slate-500">Word- and line-level view (read-only, same diff engine as LawDog review).</p>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-600/50 bg-white p-3 text-[0.7rem] leading-relaxed text-slate-900">
            {redline.segments.map((seg, idx) => {
              if (seg.type === "same") return <span key={idx}>{seg.text}</span>;
              if (seg.type === "insert")
                return (
                  <span
                    key={idx}
                    className="bg-emerald-100/95 text-emerald-950 underline decoration-emerald-800/20 decoration-1 underline-offset-2"
                  >
                    {seg.text}
                  </span>
                );
              return (
                <span
                  key={idx}
                  className="bg-rose-100/90 text-rose-950 line-through decoration-rose-800/30 decoration-1"
                >
                  {seg.text}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-[0.7rem] text-slate-500">No text-level diff — pastes match (after normalizing spaces).</p>
      )}
    </div>
  );
}

function clauseRowLine(row: ClauseRow): string {
  if (row.kind === "add") return `Added: ${row.text.replace(/\s+/g, " ").trim().slice(0, 320)}${row.text.length > 320 ? "…" : ""}`;
  if (row.kind === "remove") {
    return `Removed: ${row.text.replace(/\s+/g, " ").trim().slice(0, 320)}${row.text.length > 320 ? "…" : ""}`;
  }
  return `Revised: ${row.before.replace(/\s+/g, " ").trim().slice(0, 160)}… → ${row.after.replace(/\s+/g, " ").trim().slice(0, 160)}…`;
}
