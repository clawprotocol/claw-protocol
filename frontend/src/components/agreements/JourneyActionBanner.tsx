import type { JourneyActionFeedback } from "./journeyActionFeedback";

const KIND_CLASS: Record<JourneyActionFeedback["kind"], string> = {
  working: "border-sky-700/50 bg-sky-950/35 text-sky-100",
  succeeded: "border-emerald-700/50 bg-emerald-950/35 text-emerald-100",
  blocked: "border-amber-700/50 bg-amber-950/35 text-amber-100",
  failed: "border-rose-700/50 bg-rose-950/35 text-rose-100",
};

export function JourneyActionBanner(props: {
  feedback: JourneyActionFeedback;
  onDismiss?: () => void;
  onRemedy?: () => void;
}) {
  const { feedback, onDismiss, onRemedy } = props;
  const live = feedback.kind === "working" ? "polite" : "assertive";
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${KIND_CLASS[feedback.kind]}`}
      role={feedback.kind === "working" || feedback.kind === "succeeded" ? "status" : "alert"}
      aria-live={live}
      data-testid="journey-action-banner"
      data-journey-action-kind={feedback.kind}
      data-journey-action-id={feedback.actionId}
    >
      <p className="font-semibold tracking-tight">{feedback.title}</p>
      <p className="mt-1 text-[13px] opacity-95">{feedback.body}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {feedback.remedyLabel && onRemedy ? (
          <button
            type="button"
            className="rounded-md bg-white/10 px-2.5 py-1 text-[12px] font-semibold hover:bg-white/15"
            data-testid="journey-action-remedy"
            onClick={onRemedy}
          >
            {feedback.remedyLabel}
          </button>
        ) : null}
        {onDismiss && feedback.kind !== "working" ? (
          <button
            type="button"
            className="rounded-md px-2.5 py-1 text-[12px] font-medium opacity-80 hover:opacity-100"
            data-testid="journey-action-dismiss"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
