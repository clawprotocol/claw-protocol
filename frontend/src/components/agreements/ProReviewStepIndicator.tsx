/** Mode hierarchy for paid Pro review — one primary step visible at a time. */

export type ProReviewStepId =
  | "review_draft"
  | "complete_agreement"
  | "add_signers"
  | "prepare_packet";

const STEPS: { id: ProReviewStepId; label: string }[] = [
  { id: "review_draft", label: "Review draft" },
  { id: "complete_agreement", label: "Complete agreement" },
  { id: "add_signers", label: "Add signers" },
  { id: "prepare_packet", label: "Prepare packet" },
];

export type ProReviewStepIndicatorProps = {
  activeStep: ProReviewStepId;
  className?: string;
};

export function ProReviewStepIndicator({ activeStep, className = "" }: ProReviewStepIndicatorProps) {
  const activeIdx = STEPS.findIndex((s) => s.id === activeStep);
  return (
    <nav
      aria-label="Review progress"
      className={`flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-stone-500 ${className}`}
      data-testid="pro-review-step-indicator"
    >
      {STEPS.map((step, i) => {
        const state = i < activeIdx ? "done" : i === activeIdx ? "active" : "upcoming";
        return (
          <span key={step.id} className="inline-flex items-center gap-1.5">
            {i > 0 ? <span className="text-stone-300" aria-hidden>→</span> : null}
            <span
              data-step-state={state}
              className={
                state === "active"
                  ? "rounded-full bg-stone-800 px-2 py-0.5 text-white"
                  : state === "done"
                    ? "text-emerald-700"
                    : "text-stone-400"
              }
            >
              {state === "done" ? "✓ " : ""}
              {step.label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}

export function resolveProReviewActiveStep(args: {
  guidedCompletionActive: boolean;
  guidedPhase: string;
  signersReady: boolean;
  packetPrepared: boolean;
}): ProReviewStepId {
  if (args.guidedCompletionActive) {
    if (args.guidedPhase === "applied") return "add_signers";
    return "complete_agreement";
  }
  if (!args.signersReady) return "add_signers";
  if (!args.packetPrepared) return "prepare_packet";
  return "review_draft";
}
