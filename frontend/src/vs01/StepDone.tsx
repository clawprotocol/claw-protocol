import type { Vs01LoadingState } from "./types";

export type StepDoneProps = {
  loading?: Vs01LoadingState;
  onRefreshReceipt?: () => void;
  onDownloadBundle?: () => void;
  onStartOver?: () => void;
};

const STEP_ID = "done" as const;

/**
 * Step 2 — receipt + bundle (placeholder; no API yet).
 */
export function StepDone({
  loading = "idle",
  onRefreshReceipt,
  onDownloadBundle,
  onStartOver,
}: StepDoneProps) {
  const busyReceipt = loading === "receipt";
  const busyBundle = loading === "bundle";

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-done-title">
      <h2 id="vs01-step-done-title" className="vs01-card-title">
        Done
      </h2>
      <p className="vs01-card-help">
        Your receipt and hashes will appear here. Optional <code>GET /v1/receipts/&#123;id&#125;</code>{" "}
        and bundle download via <code>GET /v1/receipts/&#123;id&#125;/bundle</code>.
      </p>

      <div className="vs01-hash-panel" style={{ marginBottom: "1rem" }} aria-label="Placeholder receipt fields">
        <div>
          <strong>receipt_id</strong> — (pending)
        </div>
        <div>
          <strong>receipt_hash_sha256</strong> — (pending)
        </div>
      </div>

      <div className="vs01-placeholder-box">
        Copy buttons and optional JSON preview of <code>receipt.v1</code> will attach here.
      </div>

      <button
        type="button"
        className="vs01-btn vs01-btn--secondary"
        disabled={busyReceipt}
        onClick={() => onRefreshReceipt?.()}
      >
        {busyReceipt ? "Refreshing…" : "Refresh receipt (placeholder)"}
      </button>
      <button
        type="button"
        className="vs01-btn vs01-btn--primary"
        disabled={busyBundle}
        onClick={() => onDownloadBundle?.()}
      >
        {busyBundle ? "Preparing download…" : "Download verification bundle (.zip)"}
      </button>
      <button
        type="button"
        className="vs01-btn vs01-btn--secondary"
        onClick={() => onStartOver?.()}
      >
        Start over
      </button>
    </section>
  );
}
