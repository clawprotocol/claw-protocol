import { resolveGuidedReviewFlowState } from "./guidedReviewFlowState";
import type { GuidedCompletionPhase } from "./guidedCompletionPhase";

export type GuidedReviewFlowBannerProps = {
  guidedActive: boolean;
  phase: GuidedCompletionPhase;
  signersReady?: boolean;
  className?: string;
};

export function GuidedReviewFlowBanner({
  guidedActive,
  phase,
  signersReady = false,
  className = "",
}: GuidedReviewFlowBannerProps) {
  const state = resolveGuidedReviewFlowState({ guidedActive, phase, signersReady });
  const applying = state.id === "applying_updates";
  const updated = state.id === "agreement_updated" || state.id === "ready_for_signature";
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] ${className} ${
        applying
          ? "border-sky-200/90 bg-sky-50/95"
          : updated
            ? "border-emerald-200/90 bg-emerald-50/95"
            : "border-stone-200/90 bg-stone-50/90"
      }`}
      data-testid="guided-review-flow-banner"
      data-flow-state={state.id}
      role="status"
      aria-live="polite"
    >
      {applying ? (
        <span
          className="mt-0.5 inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-sky-600 border-t-transparent"
          aria-hidden
        />
      ) : updated ? (
        <span className="mt-0.5 text-emerald-700" aria-hidden>
          ✓
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="font-semibold text-stone-900">{state.label}</p>
        {state.detail ? <p className="mt-0.5 leading-snug text-stone-600">{state.detail}</p> : null}
      </div>
    </div>
  );
}
