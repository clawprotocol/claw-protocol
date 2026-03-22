import { useCallback, useState } from "react";
import { downloadBundle } from "./vs01Api";
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
  loading: Vs01LoadingState;
  setLoading: (next: Vs01LoadingState) => void;
  onError: (message: string | null) => void;
  /** Optional: advance to final receipt record step (envelope flow). */
  onContinueToRecord?: () => void;
  onStartOver?: () => void;
};

const STEP_ID = "complete-send" as const;

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
 * Handoff — receipt IDs, bundle download, sharing preview (full receipt JSON on Receipt step).
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
  loading,
  setLoading,
  onError,
  onContinueToRecord,
  onStartOver,
}: StepCompleteAndSendProps) {
  const busyBundle = loading === "bundle";
  const [sendPreviewOpen, setSendPreviewOpen] = useState(false);

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
        Download your verification bundle here, then review who you’ll share with. Full receipt JSON for verification
        is on the next step.
      </p>

      <div className="vs01-summary-panel vs01-summary-panel--success vs01-summary-panel--spaced">
        <strong>Next: hand off to counterparties</strong> — you’ve signed; sharing continues after you save your
        bundle.
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

      <div className="vs01-action-toolbar">
        <button
          type="button"
          className="vs01-btn vs01-btn--primary vs01-btn--auto"
          disabled={busyBundle || !receiptId}
          onClick={() => void handleDownloadBundle()}
        >
          {busyBundle ? "Preparing download…" : "Download verification bundle (.zip)"}
        </button>
      </div>

      <div className="vs01-stub-panel">
        <div className="vs01-stub-badge">Sharing</div>
        <p className="vs01-stub-lead">
          Delivery will be available here. Sharing tools appear here when ready — review who you’ll include below.
        </p>
        <ul className="vs01-cp-send-list">
          {namedCp.length ? (
            namedCp.map((c) => (
              <li key={c.id} className="vs01-cp-send-row">
                <span>
                  <strong>{c.name.trim()}</strong>
                  {c.email.trim() ? ` · ${c.email.trim()}` : ""}
                </span>
                <span className="vs01-cp-send-status">Pending</span>
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
          {sendPreviewOpen ? "Hide send details" : "Review send details"}
        </button>
        {sendPreviewOpen ? (
          <div className="vs01-hash-panel vs01-hash-panel--compact vs01-send-preview" aria-label="Send package details">
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
            View final receipt
          </button>
        ) : null}

        <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => onStartOver?.()}>
          Start over
        </button>
      </div>
    </section>
  );
}
