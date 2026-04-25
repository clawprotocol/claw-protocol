import type { GateResult } from "../../access/types";

type Props = {
  gate: GateResult;
  className?: string;
  onDismiss?: () => void;
};

/**
 * Product-grade limit / upgrade hint — use when {@link GateResult.allowed} is false or `approaching`.
 */
export function UpgradeLimitNotice({ gate, className = "", onDismiss }: Props) {
  if (gate.allowed && !gate.approaching) return null;
  const tone = gate.allowed
    ? "border-amber-800/50 bg-amber-950/20 text-amber-100/95"
    : "border-violet-800/55 bg-violet-950/25 text-violet-100/95";
  const title = gate.title || (gate.allowed ? "Plan limit" : "Upgrade needed");
  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${tone} ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-white/95">{title}</p>
        {onDismiss ? (
          <button type="button" className="text-[11px] text-slate-400 underline hover:text-slate-200" onClick={onDismiss}>
            Dismiss
          </button>
        ) : null}
      </div>
      {gate.message ? <p className="mt-1 text-xs opacity-95">{gate.message}</p> : null}
      {!gate.allowed ? (
        <p className="mt-2 text-[11px] text-slate-400">
          Higher plans unlock more agreements, previews, and signing capacity — talk to your LawDog workspace
          administrator or choose an upgrade when billing is available.
        </p>
      ) : null}
    </div>
  );
}
