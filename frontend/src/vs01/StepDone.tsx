import { useCallback, useMemo, useState } from "react";
import { ProofStatus, vs01ReceiptToProofStatusData } from "../components/proof/ProofStatus";
import { ClaimRecordCard } from "../conversion/ClaimRecordCard";
import { LawdogRecordedMark } from "../components/ui/LawdogRecordedMark";
import { isLawdogCsnTraffic } from "../tracking/lawdogSession";
import { RecordedPawFlash } from "../conversion/RecordedPawFlash";
import { getReceipt, type GetReceiptResponse } from "./vs01Api";
import { PRODUCT_NOT_LAW_FIRM, RECORDS_DOWNLOAD_KEEP_COPY_SHORT } from "../compliance/disclosureCopy";
import { buildVs01RecipientSigningUrl } from "./StepReceipt";
import type { Vs01Counterparty, Vs01LoadingState, Vs01RecipientPlacedField } from "./types";

export type StepDoneProps = {
  counterparties: Vs01Counterparty[];
  /** Used to embed per-recipient field geometry in signing links. */
  recipientPlacedFields: Vs01RecipientPlacedField[];
  documentId: string | null;
  receiptId: string | null;
  receiptHashSha256: string | null;
  receipt: unknown;
  loading: Vs01LoadingState;
  setLoading: (next: Vs01LoadingState) => void;
  onError: (message: string | null) => void;
  onReceiptUpdated: (payload: { receipt: unknown; receiptHashSha256?: string | null }) => void;
  onStartOver?: () => void;
  /** Quick flow: shorter aha moment, less explanatory stack. */
  compactCompletion?: boolean;
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
 * Final step — send links, receipt identifiers, optional technical JSON, refresh.
 */
export function StepDone({
  counterparties,
  recipientPlacedFields,
  documentId,
  receiptId,
  receiptHashSha256,
  receipt,
  loading,
  setLoading,
  onError,
  onReceiptUpdated,
  onStartOver,
  compactCompletion = false,
}: StepDoneProps) {
  const busyReceipt = loading === "receipt";
  const csn = isLawdogCsnTraffic();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const namedRecipients = useMemo(
    () => counterparties.map((c, i) => ({ c, index: i })).filter(({ c }) => c.name.trim().length > 0),
    [counterparties]
  );

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

  const copyLink = useCallback(
    async (key: string, url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
      } catch {
        onError("Could not copy link to clipboard.");
      }
    },
    [onError]
  );

  const openLink = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-done-title">
      <h2 id="vs01-step-done-title" className="vs01-card-title">
        {compactCompletion ? "You just created something real." : "Receipt & verification"}
      </h2>

      {receiptId?.trim() && csn ? (
        <ClaimRecordCard
          flow="esign_receipt"
          recordId={receiptId.trim()}
          visible
          variant="vs01"
          className="mt-2"
        />
      ) : null}

      <div
        className="vs01-done-closure lawdog-success-panel-accent lawdog-success-panel-enter"
        role="status"
      >
        <div className="flex flex-wrap items-center gap-2">
          <LawdogRecordedMark size="sm" />
          <strong>{compactCompletion ? "It’s now verifiable." : "Recorded"}</strong>
        </div>
        {compactCompletion ? (
          <p className="mt-1.5 text-sm text-slate-400">This now exists. You can prove it anytime.</p>
        ) : null}
        <p className="mt-2 text-sm font-medium text-slate-200/95">
          {compactCompletion ? "Save it. Share it. Use it." : "Agreement recorded. Verification data is available."}
        </p>
        {compactCompletion ? null : (
          <p className="mt-1 text-xs text-slate-400">
            {csn
              ? "Receipt below; share signing links when you’re ready."
              : "Signature captured; receipt and hash support checking the record."}
          </p>
        )}
        {compactCompletion ? null : (
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            <span className="font-medium text-slate-300">Recorded</span> means a verification receipt exists for this send
            (on-chain anchoring, if you add it, is separate and may complete later).
            Next: share signing links above, refresh the receipt if you need the latest payload, and save to your workspace
            when prompted so you can track and reuse.
          </p>
        )}
      </div>

      <ProofStatus
        {...vs01ReceiptToProofStatusData({ receipt, receiptId, receiptHashSha256 })}
        exportReceiptId={receiptId?.trim() ?? null}
        className="mt-3"
      />

      {receiptId?.trim() ? (
        <>
          <RecordedPawFlash className="mt-3" />
          {csn ? null : (
            <ClaimRecordCard
              flow="esign_receipt"
              recordId={receiptId.trim()}
              visible
              variant="vs01"
              className="mt-4"
            />
          )}
        </>
      ) : null}

      <p className={`vs01-card-help${compactCompletion ? " vs01-card-help--tight" : ""}`}>
        {compactCompletion
          ? "One link per signer. Refresh only if you need the latest receipt."
          : csn
            ? "Signing links for each recipient are below. Refresh updates the receipt from the server."
            : "Share a signing link with each recipient below. Receipt id and hash stay on this page for verification; refresh pulls the latest receipt from the server. Expand technical JSON only if you need the raw payload."}
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

      <section className="vs01-send-signers-section" aria-labelledby="vs01-send-signers-title">
        <h3 id="vs01-send-signers-title" className="vs01-send-signers-heading">
          {compactCompletion ? "Share with signers" : "Send to signers"}
        </h3>
        {compactCompletion ? null : (
          <p className="vs01-subtle-hint">
            Links use this site&apos;s address and query parameters only (no server-generated URLs).
          </p>
        )}
        <p className="vs01-subtle-hint mt-2">
          Recipients sign electronically in the browser. {RECORDS_DOWNLOAD_KEEP_COPY_SHORT} {PRODUCT_NOT_LAW_FIRM}
        </p>
        {namedRecipients.length === 0 ? (
          <p className="vs01-card-help">Add named recipients in Details to generate signing links.</p>
        ) : (
          <ul className="vs01-send-signers-list">
            {namedRecipients.map(({ c, index }) => {
              const url = buildVs01RecipientSigningUrl({
                recipientIndex: index,
                recipientName: c.name.trim(),
                recipientEmail: c.email.trim(),
                counterpartyId: c.id,
                documentId,
                receiptId,
                recipientFieldsForSigner: recipientPlacedFields.filter((f) => f.counterpartyId === c.id),
              });
              const copyKey = `cp-${c.id}`;
              return (
                <li key={c.id} className="vs01-send-signer-card">
                  <div className="vs01-send-signer-name">{c.name.trim()}</div>
                  <div className="vs01-send-signer-email">{c.email.trim() || "—"}</div>
                  <a
                    className="vs01-send-signer-link"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {url}
                  </a>
                  <div className="vs01-send-signer-actions">
                    <button
                      type="button"
                      className={
                        compactCompletion
                          ? "vs01-btn vs01-btn--primary vs01-btn--auto"
                          : "vs01-btn vs01-btn--secondary vs01-btn--auto"
                      }
                      onClick={() => void copyLink(copyKey, url)}
                    >
                      {copiedKey === copyKey ? "Copied" : compactCompletion ? "Copy your link" : "Copy link"}
                    </button>
                    {compactCompletion ? null : (
                      <button
                        type="button"
                        className="vs01-btn vs01-btn--primary vs01-btn--auto"
                        onClick={() => openLink(url)}
                      >
                        Open link
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="vs01-action-toolbar vs01-action-toolbar--single">
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary"
          disabled={busyReceipt || !receiptId}
          onClick={() => void handleRefreshReceipt()}
        >
          {busyReceipt ? "Refreshing…" : compactCompletion ? "Refresh receipt" : "Refresh receipt from server"}
        </button>
      </div>

      {compactCompletion ? null : (
        <details className="vs01-receipt-json-details">
          <summary className="vs01-receipt-json-details-summary">Technical receipt JSON</summary>
          <div className="vs01-receipt-json" role="region" aria-label="Full receipt JSON for verification">
            {receipt != null
              ? prettyJson(receipt)
              : "Receipt JSON will load from the signed step. Use Refresh if needed."}
          </div>
        </details>
      )}

      <div className="vs01-step-actions vs01-step-actions--tight vs01-done-start-over">
        <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--auto" onClick={() => onStartOver?.()}>
          Start over
        </button>
      </div>
    </section>
  );
}
