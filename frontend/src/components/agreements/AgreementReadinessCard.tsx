import type { AgreementReadinessLevel, AgreementReadinessResult } from "../../agreement/agreementReadiness";
import { READINESS_HEADLINES, readinessCtaHelper } from "../../agreement/agreementReadiness";
import { CUSTOMER_JOURNEY_STATE } from "./customerJourneyReadiness";

const STEPS: { id: AgreementReadinessLevel; label: string }[] = [
  { id: "early", label: CUSTOMER_JOURNEY_STATE.describe },
  { id: "usable", label: CUSTOMER_JOURNEY_STATE.readyToCreate },
  { id: "ready", label: CUSTOMER_JOURNEY_STATE.readyToCreate },
];

function stepIndex(level: AgreementReadinessLevel): number {
  return level === "early" ? 0 : level === "usable" ? 1 : 2;
}

function rowIcon(state: AgreementReadinessResult["checklistRows"][number]["state"]) {
  if (state === "done") return "✓";
  if (state === "optional_next") return "→";
  return "·";
}

export function AgreementReadinessCard(props: {
  result: AgreementReadinessResult;
  surface: string;
  /** Narrow layout for create / intake column */
  compact?: boolean;
  flowPhase?: "review" | "send" | "intake";
  /** When send phase and draft is not at full product readiness — calm prep copy only */
  showSendPrepNote?: boolean;
  /** One line under the stepper (e.g. primary CTA hint) */
  showCtaHelper?: boolean;
}) {
  const { result, surface, compact, flowPhase = "review", showSendPrepNote, showCtaHelper } = props;
  const { level, checklistRows, suggestions } = result;
  const copy = READINESS_HEADLINES[level];
  const active = stepIndex(level);

  return (
    <div
      className={`rounded-xl border border-slate-800/80 bg-slate-950/50 px-4 py-4 shadow-inner sm:px-5 ${
        compact ? "max-w-3xl" : ""
      }`}
      role="region"
      aria-label="Draft readiness"
      data-readiness-surface={surface}
    >
      <div className="mb-4">
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= active ? "bg-emerald-500/70" : "bg-slate-800/90"
              }`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={i === active ? "text-emerald-200/90" : i < active ? "text-slate-400" : "text-slate-600"}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <h3 className="text-sm font-semibold tracking-tight text-slate-100">{copy.title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500 sm:text-[0.8125rem]">{copy.subtitle}</p>

      {showSendPrepNote && level !== "ready" ? (
        <p className="mt-3 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-xs leading-relaxed text-slate-400">
          Before you send, consider tightening the items below.
        </p>
      ) : null}

      {checklistRows.length > 0 ? (
        <ul className="mt-4 space-y-2.5 border-t border-slate-800/60 pt-4">
          {checklistRows.slice(0, 5).map((row) => (
            <li key={row.id} className="flex gap-3 text-sm">
              <span
                className={`mt-0.5 shrink-0 font-mono text-xs ${
                  row.state === "done"
                    ? "text-emerald-400/90"
                    : row.state === "optional_next"
                      ? "text-slate-500"
                      : "text-slate-400"
                }`}
                aria-hidden
              >
                {rowIcon(row.state)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug text-slate-200">{row.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                  {row.state === "done"
                    ? "Looks good for the next step"
                    : row.state === "optional_next"
                      ? row.hint ?? "Next in the workflow"
                      : "Optional now — you can add on the next step"}
                </p>
                {row.hint && row.state !== "optional_next" ? (
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-600">{row.hint}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {suggestions.length > 0 && flowPhase !== "send" ? (
        <ul className="mt-3 space-y-1.5 text-[11px] leading-snug text-slate-500">
          {suggestions.slice(0, 3).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : null}

      {showCtaHelper ? (
        <p className="mt-4 border-t border-slate-800/60 pt-3 text-xs font-medium leading-snug text-slate-400">
          {readinessCtaHelper(level)}
        </p>
      ) : null}
    </div>
  );
}
