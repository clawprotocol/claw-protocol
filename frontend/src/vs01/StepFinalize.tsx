import type { Vs01LoadingState } from "./types";

export type StepFinalizeProps = {
  /** Reserved for POST /v1/documents wiring. */
  loading?: Vs01LoadingState;
  onContinue?: () => void;
};

const STEP_ID = "finalize" as const;

/**
 * Step 0 — upload / finalize document (placeholder; no API yet).
 */
export function StepFinalize({ loading = "idle", onContinue }: StepFinalizeProps) {
  const busy = loading === "finalize";

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-finalize-title">
      <h2 id="vs01-step-finalize-title" className="vs01-card-title">
        Finalize document
      </h2>
      <p className="vs01-card-help">
        Upload the final PDF or document bytes you want bound to a receipt. This step will call{" "}
        <code>POST /v1/documents</code> when wired.
      </p>

      <div className="vs01-placeholder-box">
        File input and base64 finalize will live here. You’ll see <code>document_id</code> and{" "}
        <code>content_sha256</code> after finalize.
      </div>

      <div className="vs01-hash-panel" style={{ marginTop: "1rem" }} aria-label="Placeholder hashes">
        <div>document_id — (pending)</div>
        <div>content_sha256 — (pending)</div>
      </div>

      <button
        type="button"
        className="vs01-btn vs01-btn--primary"
        disabled={busy}
        onClick={() => onContinue?.()}
      >
        {busy ? "Finalizing…" : "Continue to sign (placeholder)"}
      </button>
    </section>
  );
}
