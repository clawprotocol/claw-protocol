import {
  AGREEMENT_LIFECYCLE_PROGRESS_LABELS,
  type AgreementLifecycleProgressStep,
} from "../../agreement/agreementLifecycleRail";

type Props = {
  step: AgreementLifecycleProgressStep;
  className?: string;
  /** Smaller variant for in-page chrome (e.g. intake document header). */
  compact?: boolean;
};

/**
 * Compact lifecycle rail — DRAFT → REVIEW → SIGN → PROOF.
 * Use the same semantics on every persistent agreement surface.
 */
export function AgreementLifecycleRail(props: Props) {
  const { step, className = "", compact = false } = props;
  const labels = AGREEMENT_LIFECYCLE_PROGRESS_LABELS;

  return (
    <ol
      className={`flex list-none flex-wrap items-center gap-x-1 gap-y-1 ${compact ? "text-[10px]" : "text-[10px] sm:text-[11px]"} font-medium uppercase tracking-wide text-slate-500 ${className}`}
      aria-label="Agreement lifecycle"
    >
      {labels.flatMap((label, i) => {
        const idx = i;
        const done = idx < step - 1;
        const current = idx === step - 1;
        const nodes = [];
        if (idx > 0) {
          nodes.push(
            <li key={`sep-${idx}`} aria-hidden className="px-0.5 text-slate-600/80">
              →
            </li>,
          );
        }
        nodes.push(
          <li
            key={label}
            className={
              done
                ? "rounded px-1.5 py-0.5 text-emerald-200/80"
                : current
                  ? "rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200"
                  : "rounded px-1.5 py-0.5 text-slate-600"
            }
          >
            {done ? (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="text-emerald-400/90">
                  ✓
                </span>
                <span>{label}</span>
              </span>
            ) : (
              <span>{label}</span>
            )}
          </li>,
        );
        return nodes;
      })}
    </ol>
  );
}
