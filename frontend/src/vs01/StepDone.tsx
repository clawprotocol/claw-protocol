import { useCallback } from "react";
import { downloadBundle, getReceipt, type GetReceiptResponse } from "./vs01Api";
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

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Step 2 — receipt GET + bundle download.
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
  const busyBundle = loading === "bundle";

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

  const handleDownloadBundle = useCallback(async () => {
    if (!receiptId?.trim()) {
      onError("Missing receipt id.");
      return;
    }
    onError(null);
    setLoading("bundle");
    try {
      const blob = await downloadBundle(receiptId.trim());
      triggerBlobDownload(blob, "claw-bundle.zip");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  }, [onError, receiptId, setLoading]);

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-done-title">
      <h2 id="vs01-step-done-title" className="vs01-card-title">
        Done
      </h2>
      <p className="vs01-card-help">
        Receipt from <code>GET /v1/receipts/&#123;id&#125;</code>; bundle from{" "}
        <code>GET /v1/receipts/&#123;id&#125;/bundle</code>.
      </p>

      <div className="vs01-hash-panel" style={{ marginBottom: "1rem" }} aria-label="Receipt identifiers">
        <div>
          <strong>receipt_id</strong> — {receiptId ?? "(pending)"}
        </div>
        <div>
          <strong>receipt_hash_sha256</strong> — {receiptHashSha256 ?? "(pending)"}
        </div>
      </div>

      <div className="vs01-placeholder-box" style={{ whiteSpace: "pre-wrap", maxHeight: "14rem", overflow: "auto" }}>
        {receipt != null ? prettyJson(receipt) : "No receipt JSON loaded yet — use Refresh or complete Sign."}
      </div>

      <button
        type="button"
        className="vs01-btn vs01-btn--secondary"
        disabled={busyReceipt || busyBundle || !receiptId}
        onClick={() => void handleRefreshReceipt()}
      >
        {busyReceipt ? "Refreshing…" : "Refresh receipt"}
      </button>
      <button
        type="button"
        className="vs01-btn vs01-btn--primary"
        disabled={busyReceipt || busyBundle || !receiptId}
        onClick={() => void handleDownloadBundle()}
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
