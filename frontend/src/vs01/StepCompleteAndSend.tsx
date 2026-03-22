import { useCallback, useState } from "react";
import { downloadBundle, getReceipt, type GetReceiptResponse } from "./vs01Api";
import type { Vs01Counterparty, Vs01LoadingState } from "./types";

export type StepCompleteAndSendProps = {
  agreementTitle: string;
  documentId: string | null;
  creatorName: string;
  creatorEmail: string;
  counterparties: Vs01Counterparty[];
  senderMessage: string;
  receiptId: string | null;
  receiptHashSha256: string | null;
  receipt: unknown;
  loading: Vs01LoadingState;
  setLoading: (next: Vs01LoadingState) => void;
  onError: (message: string | null) => void;
  onReceiptUpdated: (payload: { receipt: unknown; receiptHashSha256?: string | null }) => void;
  /** Optional: advance to final receipt record step (envelope flow). */
  onContinueToRecord?: () => void;
  onStartOver?: () => void;
};

const STEP_ID = "complete-send" as const;

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
 * Step 3 — Receipt, bundle, and stubbed “send to counterparties” (frontend-only; no send API yet).
 */
export function StepCompleteAndSend({
  agreementTitle,
  documentId,
  creatorName,
  creatorEmail,
  counterparties,
  senderMessage,
  receiptId,
  receiptHashSha256,
  receipt,
  loading,
  setLoading,
  onError,
  onReceiptUpdated,
  onContinueToRecord,
  onStartOver,
}: StepCompleteAndSendProps) {
  const busyReceipt = loading === "receipt";
  const busyBundle = loading === "bundle";
  const [sendPreviewOpen, setSendPreviewOpen] = useState(false);

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

  const namedCp = counterparties.filter((c) => c.name.trim());

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-complete-title">
      <h2 id="vs01-step-complete-title" className="vs01-card-title">
        Complete & handoff
      </h2>
      <p className="vs01-card-help">
        Your receipt is ready. Download the verification bundle for your records. Counterparty delivery below is
        a preview until send is connected.
      </p>

      <div className="vs01-summary-panel vs01-summary-panel--success vs01-summary-panel--spaced">
        <strong>Next: hand off to counterparties</strong> — you’ve signed; sharing the flow is the step after
        you save your bundle.
      </div>

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

      <div className="vs01-receipt-json" role="region" aria-label="Receipt details">
        {receipt != null ? prettyJson(receipt) : "Receipt details will appear here after you sign."}
      </div>

      <div className="vs01-action-toolbar">
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--auto"
          disabled={busyReceipt || busyBundle || !receiptId}
          onClick={() => void handleRefreshReceipt()}
        >
          {busyReceipt ? "Refreshing…" : "Refresh receipt"}
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--primary vs01-btn--auto"
          disabled={busyReceipt || busyBundle || !receiptId}
          onClick={() => void handleDownloadBundle()}
        >
          {busyBundle ? "Preparing download…" : "Download verification bundle (.zip)"}
        </button>
      </div>

      <div className="vs01-stub-panel">
        <div className="vs01-stub-badge">Coming soon</div>
        <p className="vs01-stub-lead">
          Counterparty delivery isn’t connected yet. Review who will receive the package when it is.
        </p>
        <ul className="vs01-cp-send-list">
          {namedCp.length ? (
            namedCp.map((c) => (
              <li key={c.id} className="vs01-cp-send-row">
                <span>
                  <strong>{c.name.trim()}</strong>
                  {c.email.trim() ? ` · ${c.email.trim()}` : ""}
                </span>
                <span className="vs01-cp-send-status">Not sent yet</span>
              </li>
            ))
          ) : (
            <li className="vs01-stub-empty">No counterparties listed.</li>
          )}
        </ul>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary"
          onClick={() => setSendPreviewOpen((v) => !v)}
        >
          {sendPreviewOpen ? "Hide send package preview" : "Prepare send package"}
        </button>
        {sendPreviewOpen ? (
          <div className="vs01-hash-panel vs01-hash-panel--compact vs01-send-preview" aria-label="Send package preview (stub)">
            <div>
              <span className="vs01-hash-label">Agreement title</span>{" "}
              <span className="vs01-hash-value">{agreementTitle || "—"}</span>
            </div>
            <div>
              <span className="vs01-hash-label">Document ID</span>{" "}
              <span className="vs01-hash-value">{documentId || "—"}</span>
            </div>
            <div>
              <span className="vs01-hash-label">Receipt ID</span>{" "}
              <span className="vs01-hash-value">{receiptId || "—"}</span>
            </div>
            <div>
              <span className="vs01-hash-label">Sender</span>{" "}
              <span className="vs01-hash-value">
                {creatorName || "—"}
                {creatorEmail ? ` <${creatorEmail}>` : ""}
              </span>
            </div>
            <div>
              <span className="vs01-hash-label">Counterparties</span>{" "}
              <span className="vs01-hash-value">
                {namedCp.length
                  ? namedCp.map((c) => `${c.name.trim()}${c.email.trim() ? ` <${c.email.trim()}>` : ""}`).join("; ")
                  : "—"}
              </span>
            </div>
            <div>
              <span className="vs01-hash-label">Sender message</span>{" "}
              <span className="vs01-hash-value">{senderMessage.trim() || "(none)"}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="vs01-step-actions vs01-step-actions--tight">
        {onContinueToRecord ? (
          <button
            type="button"
            className="vs01-btn vs01-btn--primary"
            onClick={() => onContinueToRecord()}
          >
            Continue to receipt record
          </button>
        ) : null}

        <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => onStartOver?.()}>
          Start over
        </button>
      </div>
    </section>
  );
}
