import { useCallback } from "react";
import { getReceipt, type GetReceiptResponse } from "./vs01Api";
import type { Vs01LoadingState } from "./types";

export type StepDoneProps = {
  receiptId: string | null;
  receiptHashSha256: string | null;
  receipt: unknown;
  loading: Vs01LoadingState;
  setLoading: (next: Vs01LoadingState) => void;
  onError: (message: string | null) => void;
  onReceiptUpdated: (payload: { receipt: unknown; receiptHashSha256?: string | null }) => void;
  onStartOver?: () => void;
};

const STEP_ID = "done" as const;

function pickReceiptPayload(data: GetReceiptResponse): {
  receipt: unknown;
  receiptHashSha256: string | null;
} {
  const raw = data.receipt !== undefined ? data.receipt : data;
  let hash: string | null = null;
  if (typeof data.receipt_hash_sha256 === "string" && data.receipt_hash_sha256.trim()) {
    hash = data.receipt_hash_sha256.trim();
  } else if (raw && typeof raw === "object" && raw !== null && "receipt_hash_sha256" in raw) {
    const h = (raw as { receipt_hash_sha256?: unknown }).receipt_hash_sha256;
    if (typeof h === "string" && h.trim()) hash = h.trim();
  }
  return { receipt: raw, receiptHashSha256: hash };
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Final step — verification: receipt JSON + refresh (bundle downloads on Handoff).
 */
export function StepDone({
  receiptId,
  receiptHashSha256,
  receipt,
  loading,
  setLoading,
  onError,
  onReceiptUpdated,
  onStartOver,
}: StepDoneProps) {
  const busyReceipt = loading === "receipt";

  const handleRefreshReceipt = useCallback(async () => {
    if (!receiptId?.trim()) {
      onError("Missing receipt id.");
      return;
    }
    onError(null);
    setLoading("receipt");
    try {
      const data = await getReceipt(receiptId.trim());
      const { receipt: nextReceipt, receiptHashSha256: nextHash } = pickReceiptPayload(data);
      onReceiptUpdated({
        receipt: nextReceipt,
        receiptHashSha256: nextHash ?? undefined,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  }, [onError, onReceiptUpdated, receiptId, setLoading]);

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-done-title">
      <h2 id="vs01-step-done-title" className="vs01-card-title">
        Receipt & verification
      </h2>

      <div className="vs01-done-closure" role="status">
        <strong>Agreement recorded.</strong> Signature captured and verifiable.
      </div>

      <p className="vs01-card-help">
        The receipt JSON below is what independent verification uses. Refresh if you need the latest copy from the
        server. Download your verification bundle from the Handoff step when you need offline files.
      </p>

      <div className="vs01-hash-panel vs01-hash-panel--compact" aria-label="Receipt identifiers">
        <div>
          <span className="vs01-hash-label">Receipt ID</span>{" "}
          <span className="vs01-hash-value">{receiptId ?? "—"}</span>
        </div>
        <div>
          <span className="vs01-hash-label">Receipt hash (SHA-256)</span>{" "}
          <span className="vs01-hash-value">{receiptHashSha256 ?? "—"}</span>
        </div>
      </div>

      <div className="vs01-receipt-json" role="region" aria-label="Full receipt JSON for verification">
        {receipt != null ? prettyJson(receipt) : "Receipt JSON will load from the signed step. Use Refresh if needed."}
      </div>

      <div className="vs01-action-toolbar vs01-action-toolbar--single">
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary"
          disabled={busyReceipt || !receiptId}
          onClick={() => void handleRefreshReceipt()}
        >
          {busyReceipt ? "Refreshing…" : "Refresh receipt from server"}
        </button>
      </div>

      <div className="vs01-step-actions vs01-step-actions--tight">
        <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => onStartOver?.()}>
          Start over
        </button>
      </div>
    </section>
  );
}
