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
        Your receipt is on the public VS01 path. Download the verification bundle for your records — then get
        ready to loop in the others (stubbed below until send is wired).
      </p>

      <div
        className="vs01-summary-panel"
        style={{ marginBottom: "1rem", background: "color-mix(in srgb, var(--vs01-color-success) 12%, transparent)" }}
      >
        <strong>Ready to send to counterparties</strong> — you’ve signed; next is sharing the flow (integration
        pending).
      </div>

      <div className="vs01-hash-panel" style={{ marginBottom: "1rem" }} aria-label="Receipt identifiers">
        <div>
          <strong>receipt_id</strong> — {receiptId ?? "(pending)"}
        </div>
        <div>
          <strong>receipt_hash_sha256</strong> — {receiptHashSha256 ?? "(pending)"}
        </div>
      </div>

      <div className="vs01-placeholder-box" style={{ whiteSpace: "pre-wrap", maxHeight: "12rem", overflow: "auto" }}>
        {receipt != null ? prettyJson(receipt) : "Receipt JSON will appear here after signing."}
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

      <div className="vs01-stub-panel">
        <div className="vs01-stub-badge">Next integration point</div>
        <p className="vs01-card-help" style={{ margin: "0 0 0.75rem" }}>
          Counterparty delivery is not connected yet. This is a preview of what a real send step would use.
        </p>
        <ul className="vs01-stack" style={{ listStyle: "none", padding: 0, margin: "0 0 1rem" }}>
          {namedCp.length ? (
            namedCp.map((c) => (
              <li
                key={c.id}
                className="vs01-placeholder-box"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}
              >
                <span>
                  <strong>{c.name.trim()}</strong>
                  {c.email.trim() ? ` · ${c.email.trim()}` : ""}
                </span>
                <span style={{ fontSize: "var(--vs01-text-legal)", color: "var(--vs01-color-text-muted)" }}>
                  Not sent yet
                </span>
              </li>
            ))
          ) : (
            <li className="vs01-card-help">No counterparties listed.</li>
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
          <div
            className="vs01-hash-panel"
            style={{ marginTop: "1rem", textAlign: "left" }}
            aria-label="Send package preview (stub)"
          >
            <div>
              <strong>agreement_title</strong> — {agreementTitle || "—"}
            </div>
            <div>
              <strong>document_id</strong> — {documentId || "—"}
            </div>
            <div>
              <strong>receipt_id</strong> — {receiptId || "—"}
            </div>
            <div>
              <strong>sender</strong> — {creatorName || "—"}
              {creatorEmail ? ` <${creatorEmail}>` : ""}
            </div>
            <div>
              <strong>counterparties</strong> —{" "}
              {namedCp.length
                ? namedCp.map((c) => `${c.name.trim()}${c.email.trim() ? ` <${c.email.trim()}>` : ""}`).join("; ")
                : "—"}
            </div>
            <div>
              <strong>sender_message</strong> — {senderMessage.trim() || "(none)"}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="vs01-btn vs01-btn--secondary"
        style={{ marginTop: "0.75rem" }}
        onClick={() => onStartOver?.()}
      >
        Start over
      </button>
    </section>
  );
}
