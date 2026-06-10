import type { AgreementTimelineStep } from "./dashboardWhatsNextPresentation";

type Props = {
  steps: readonly AgreementTimelineStep[];
  compact?: boolean;
};

export function AgreementProgressTimeline(props: Props) {
  const { steps, compact = false } = props;
  if (!steps.length) return null;

  return (
    <ol
      className={`flex ${compact ? "flex-wrap gap-2" : "flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1"}`}
      data-testid="agreement-progress-timeline"
      aria-label="Agreement progress"
    >
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const dotClass =
          step.state === "complete"
            ? "bg-emerald-500 ring-emerald-500/30"
            : step.state === "current"
              ? "bg-amber-400 ring-amber-400/40"
              : "bg-slate-700 ring-slate-700/30";
        const textClass =
          step.state === "complete"
            ? "text-emerald-200"
            : step.state === "current"
              ? "text-amber-100 font-medium"
              : "text-slate-500";

        return (
          <li
            key={step.id}
            className={`flex items-center gap-2 ${compact ? "" : "sm:gap-1"}`}
            data-testid={`agreement-timeline-step-${step.id}`}
            data-timeline-state={step.state}
          >
            <span className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ring-2 ${dotClass}`}
                aria-hidden
              />
              <span className={`text-xs ${textClass}`}>{step.label}</span>
            </span>
            {!isLast && !compact ? (
              <span className="hidden text-slate-600 sm:inline" aria-hidden>
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
