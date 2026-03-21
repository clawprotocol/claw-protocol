import type { Vs01LoadingState } from "./types";

export type StepSignProps = {
  loading?: Vs01LoadingState;
  onBack?: () => void;
  onContinue?: () => void;
};

const STEP_ID = "sign" as const;

/**
 * Step 1 — sign session + complete (placeholder; no API yet).
 */
export function StepSign({ loading = "idle", onBack, onContinue }: StepSignProps) {
  const busySession = loading === "session";
  const busyComplete = loading === "complete";
  const busy = busySession || busyComplete;

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-sign-title">
      <h2 id="vs01-step-sign-title" className="vs01-card-title">
        Sign
      </h2>
      <p className="vs01-card-help">
        Create a sign session, then complete with signer reference, intent, and a minimal{" "}
        <code>field_manifest</code>. Wired flow: <code>POST /v1/sign-sessions</code> →{" "}
        <code>POST /v1/sign-sessions/&#123;id&#125;/complete</code>.
      </p>

      <div className="vs01-placeholder-box">
        Form fields: <code>signer_ref</code>, <code>intent</code>, one rectangle (page, x, y, w, h)
        — placeholder only.
      </div>

      <button
        type="button"
        className="vs01-btn vs01-btn--secondary"
        disabled={busy}
        onClick={() => onBack?.()}
      >
        Back
      </button>
      <button
        type="button"
        className="vs01-btn vs01-btn--primary"
        disabled={busy}
        onClick={() => onContinue?.()}
      >
        {busySession ? "Creating session…" : busyComplete ? "Signing…" : "Continue to done (placeholder)"}
      </button>
    </section>
  );
}
