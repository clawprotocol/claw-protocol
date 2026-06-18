import type { StarterMultiPartyProGateAssessment } from "./starterMultiPartyProGate";
import { formatStarterMultiPartyGatePartyLines } from "./starterMultiPartyProGate";

export function StarterMultiPartyProGatePanel(props: {
  assessment: StarterMultiPartyProGateAssessment;
  onBuildPro: () => void;
  onEditPrompt: () => void;
}) {
  const { assessment, onBuildPro, onEditPrompt } = props;
  const partyLines = formatStarterMultiPartyGatePartyLines(assessment.parties);

  return (
    <div
      className="mb-4 space-y-4 rounded-lg border border-slate-700/60 bg-slate-900/40 p-4 sm:p-6"
      role="region"
      aria-labelledby="starter-multi-party-pro-gate-title"
    >
      <div>
        <h2
          id="starter-multi-party-pro-gate-title"
          className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl"
        >
          Complex agreement detected
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-[0.9375rem]">
          This looks like a multi-party agreement. LawDog Pro is required to preserve all parties, signer roles,
          revenue-share terms, and signature blocks.
        </p>
      </div>

      <div className="rounded-md border border-slate-700/50 bg-slate-950/50 px-4 py-3.5 text-sm text-slate-300">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Parties detected</p>
        {partyLines.length > 0 ? (
          <ul className="mt-2 space-y-1 leading-relaxed">
            {partyLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-slate-400">Multiple parties detected in your prompt.</p>
        )}
        {assessment.coordinatorName ? (
          <p className="mt-3 text-slate-300">
            <span className="font-medium text-slate-200">Coordinator:</span> {assessment.coordinatorName}
          </p>
        ) : null}
        {assessment.keyTerms.length > 0 ? (
          <p className="mt-3 text-slate-300">
            <span className="font-medium text-slate-200">Key terms:</span> {assessment.keyTerms.join(", ")}.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:flex-wrap sm:justify-end">
        <button
          type="button"
          className="min-h-[2.75rem] w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-center text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-400 sm:min-w-[12rem] sm:flex-1"
          onClick={onBuildPro}
        >
          Build Pro agreement
        </button>
        <button
          type="button"
          className="min-h-[2.75rem] w-full rounded-lg border border-slate-600/70 bg-slate-900/75 px-4 py-2.5 text-center text-sm font-semibold text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800/80 sm:min-w-[12rem] sm:flex-1"
          onClick={onEditPrompt}
        >
          Edit prompt
        </button>
      </div>
    </div>
  );
}
