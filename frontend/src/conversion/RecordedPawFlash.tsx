/**
 * Short emotional payoff after a receipt / record is shown (e-sign completion).
 */
export function RecordedPawFlash({ className = "" }: { className?: string }) {
  return (
    <p
      className={`claw-recorded-paw-line text-sm font-semibold text-emerald-200/95 ${className}`.trim()}
      aria-live="polite"
    >
      Recorded{" "}
      <span className="claw-recorded-paw-emoji inline-block" aria-hidden>
        🐾
      </span>
    </p>
  );
}
