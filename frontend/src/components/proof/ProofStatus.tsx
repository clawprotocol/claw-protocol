import { useCallback, useId, useState } from "react";
import { LawdogOnRecordStamp } from "../ui/LawdogOnRecordStamp";
import { openReceiptProofBundleDownload } from "../../export/dataExportApi";
import {
  PROOF_CARD_MICRO_TRUST,
  PROOF_LADDER_SUBTITLE,
  proofAnchorDetailTechnical,
  proofAnchorPill,
  proofAnchorRowDetail,
  proofRecordedRowSecondary,
  proofVerificationDetailTechnical,
  proofVerifiablePill,
  proofVerifiableRowDetail,
} from "./proofTrustLadder";
import "./proof-status.css";

export type ProofVerificationStatus = "ready" | "processing" | "unavailable";

export type ProofAnchorStatus =
  | "not_started"
  | "available"
  | "queued"
  | "pending"
  | "confirmed"
  | "failed";

export type ProofStatusData = {
  /** When the product recorded the action (ISO or Date). */
  recordedAt?: string | Date | null;
  /** When true, recorded row shows as complete even if {@link recordedAt} is missing. */
  recordedComplete?: boolean;
  verificationStatus: ProofVerificationStatus;
  verificationReadyAt?: string | Date | null;
  anchorStatus: ProofAnchorStatus;
  anchorRequestedAt?: string | Date | null;
  anchorConfirmedAt?: string | Date | null;
  anchorNetwork?: string | null;
  /** Transaction or external reference — shown only in expanded details. */
  anchorReference?: string | null;
  anchorBatchReference?: string | null;
  proofExportUrl?: string | null;
};

export type ProofStatusProps = ProofStatusData & {
  className?: string;
  /** VS01 receipt id — enables "Export proof" without relying on relative {@link ProofStatusData.proofExportUrl}. */
  exportReceiptId?: string | null;
  /** Shown when {@link ProofStatusData.anchorStatus} is `available`. Hidden for queued/pending. */
  onUpgradeProof?: () => void;
  /** Shown when anchor is `confirmed`; falls back to expanding details if omitted. */
  onViewProofDetails?: () => void;
};

function formatDateTime(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function readString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

const ANCHOR_VALUES: ProofAnchorStatus[] = [
  "not_started",
  "available",
  "queued",
  "pending",
  "confirmed",
  "failed",
];

function parseAnchorStatus(raw: string | null | undefined): ProofAnchorStatus | null {
  if (!raw) return null;
  const n = raw.trim().toLowerCase().replace(/-/g, "_");
  return ANCHOR_VALUES.includes(n as ProofAnchorStatus) ? (n as ProofAnchorStatus) : null;
}

/**
 * Maps VS01 receipt payload + ids into {@link ProofStatusData}. Safe for partial / missing API fields.
 */
export function vs01ReceiptToProofStatusData(input: {
  receipt: unknown;
  receiptId: string | null;
  receiptHashSha256: string | null;
}): ProofStatusData {
  const { receipt, receiptId, receiptHashSha256 } = input;
  const rid = receiptId?.trim() ?? null;
  const hasHash = Boolean(receiptHashSha256?.trim());

  let recordedAt: string | Date | null = null;
  let anchorStatus: ProofAnchorStatus = "not_started";
  let anchorNetwork: string | null = null;
  let anchorReference: string | null = null;
  let anchorBatchReference: string | null = null;
  let anchorRequestedAt: string | Date | null = null;
  let anchorConfirmedAt: string | Date | null = null;
  let proofExportUrl: string | null = null;
  let verificationReadyAt: string | Date | null = null;

  if (receipt && typeof receipt === "object" && receipt !== null) {
    const o = receipt as Record<string, unknown>;
    recordedAt =
      readString(o, ["recorded_at", "created_at", "createdAt", "timestamp", "issued_at"]) ?? recordedAt;
    verificationReadyAt =
      readString(o, ["verification_ready_at", "verificationReadyAt"]) ?? verificationReadyAt;
    anchorNetwork = readString(o, ["anchor_network", "anchorNetwork", "anchored_network"]);
    anchorReference = readString(o, ["anchor_reference", "anchorReference", "anchor_tx", "tx_hash", "txHash"]);
    anchorBatchReference = readString(o, ["anchor_batch_reference", "anchorBatchReference", "batch_reference"]);
    anchorRequestedAt = readString(o, ["anchor_requested_at", "anchorRequestedAt"]);
    anchorConfirmedAt = readString(o, ["anchor_confirmed_at", "anchorConfirmedAt", "anchored_at"]);
    proofExportUrl = readString(o, ["proof_export_url", "proofExportUrl"]);

    const parsed = parseAnchorStatus(readString(o, ["anchor_status", "anchorStatus"]) ?? undefined);
    if (parsed) anchorStatus = parsed;
  }

  const verificationStatus: ProofVerificationStatus = hasHash
    ? "ready"
    : rid
      ? "processing"
      : "unavailable";

  const hasReceiptPayload = receipt != null && typeof receipt === "object";

  return {
    recordedAt,
    recordedComplete: Boolean(rid) || hasReceiptPayload,
    verificationStatus,
    verificationReadyAt,
    anchorStatus,
    anchorRequestedAt,
    anchorConfirmedAt,
    anchorNetwork,
    anchorReference,
    anchorBatchReference,
    proofExportUrl,
  };
}

function StatusIcon({ variant }: { variant: "recorded" | "verified" | "anchored" }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-current opacity-80";
  if (variant === "recorded") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (variant === "verified") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function ProofStatus(props: ProofStatusProps) {
  const {
    className = "",
    exportReceiptId,
    recordedAt,
    recordedComplete = false,
    verificationStatus,
    verificationReadyAt,
    anchorStatus,
    anchorRequestedAt,
    anchorConfirmedAt,
    anchorNetwork,
    anchorReference,
    anchorBatchReference,
    proofExportUrl,
    onUpgradeProof,
    onViewProofDetails,
  } = props;

  const detailsId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const recordedLabel = formatDateTime(recordedAt);
  const verificationReadyLabel = formatDateTime(verificationReadyAt);
  const anchorRequestedLabel = formatDateTime(anchorRequestedAt);
  const anchorConfirmedLabel = formatDateTime(anchorConfirmedAt);

  const recordedDone = recordedComplete || Boolean(recordedLabel);
  const recordedSecondary = proofRecordedRowSecondary(recordedLabel, recordedComplete);

  const showUpgrade =
    anchorStatus === "available" && typeof onUpgradeProof === "function";
  const anchorInFlight = anchorStatus === "queued" || anchorStatus === "pending";

  const anchoredRowActive =
    anchorStatus === "confirmed" ||
    anchorStatus === "pending" ||
    anchorStatus === "queued" ||
    anchorStatus === "failed";

  const verifiedPillClass =
    verificationStatus === "ready"
      ? "proof-status__state-pill proof-status__state-pill--ok"
      : verificationStatus === "processing"
        ? "proof-status__state-pill proof-status__state-pill--progress"
        : "proof-status__state-pill proof-status__state-pill--wait";

  const anchoredPillClass =
    anchorStatus === "confirmed"
      ? "proof-status__state-pill proof-status__state-pill--ok"
      : anchorStatus === "failed"
        ? "proof-status__state-pill proof-status__state-pill--risk"
        : anchorInFlight
          ? "proof-status__state-pill proof-status__state-pill--progress"
          : anchorStatus === "available"
            ? "proof-status__state-pill proof-status__state-pill--progress"
            : "proof-status__state-pill proof-status__state-pill--wait";

  const openProofDetails = useCallback(() => {
    if (onViewProofDetails) {
      onViewProofDetails();
      return;
    }
    setDetailsOpen(true);
  }, [onViewProofDetails]);

  const showNetworkInDetails =
    anchorNetwork &&
    (anchorStatus === "confirmed" || anchorStatus === "pending" || anchorStatus === "queued" || anchorStatus === "failed");
  const showTxInDetails = Boolean(anchorReference);
  const showBatchInDetails = Boolean(anchorBatchReference);

  return (
    <section
      className={`proof-status ${className}`.trim()}
      aria-label="Proof status"
    >
      <div className="proof-status__head">
        <div className="proof-status__title-row">
          <h3 className="proof-status__title">Proof</h3>
          {recordedDone ? <LawdogOnRecordStamp surface="dark" /> : null}
        </div>
        <p className="proof-status__subtitle">{PROOF_LADDER_SUBTITLE}</p>
      </div>

      <ol className="proof-status__rows proof-status__rows--ladder" aria-label="Proof progression">
        <li className="proof-status__row proof-status__row--recorded">
          <span className="proof-status__step" aria-hidden>
            1
          </span>
          <div className="proof-status__row-body">
            <div className="proof-status__row-head">
              <span className="proof-status__label">
                <StatusIcon variant="recorded" />
                Recorded
              </span>
              {recordedDone ? (
                <span className="proof-status__state-pill proof-status__state-pill--ok">Complete</span>
              ) : (
                <span className="proof-status__state-pill proof-status__state-pill--wait">Waiting</span>
              )}
            </div>
            <p className="proof-status__detail">{recordedSecondary}</p>
          </div>
        </li>

        <li className="proof-status__row proof-status__row--verified">
          <span className="proof-status__step" aria-hidden>
            2
          </span>
          <div className="proof-status__row-body">
            <div className="proof-status__row-head">
              <span className="proof-status__label">
                <StatusIcon variant="verified" />
                Ready to verify
              </span>
              <span className={verifiedPillClass}>{proofVerifiablePill(verificationStatus)}</span>
            </div>
            <p className="proof-status__detail">{proofVerifiableRowDetail(verificationStatus)}</p>
          </div>
        </li>

        <li
          className={`proof-status__row proof-status__row--anchored${anchoredRowActive ? " proof-status__row--anchored-active" : ""}`}
        >
          <span className="proof-status__step" aria-hidden>
            3
          </span>
          <div className="proof-status__row-body">
            <div className="proof-status__row-head">
              <span className="proof-status__label">
                <StatusIcon variant="anchored" />
                Timestamped
              </span>
              <span className={anchoredPillClass}>{proofAnchorPill(anchorStatus)}</span>
            </div>
            <p className="proof-status__detail">{proofAnchorRowDetail(anchorStatus)}</p>
          </div>
        </li>
      </ol>

      <p className="proof-status__micro">{PROOF_CARD_MICRO_TRUST}</p>

      {(showUpgrade || anchorStatus === "confirmed") && (
        <div className="proof-status__actions">
          {showUpgrade ? (
            <button type="button" className="vs01-btn vs01-btn--primary vs01-btn--auto" onClick={onUpgradeProof}>
              Upgrade proof
            </button>
          ) : null}
          {anchorStatus === "confirmed" ? (
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--auto" onClick={openProofDetails}>
              View proof details
            </button>
          ) : null}
        </div>
      )}

      {exportReceiptId?.trim() || proofExportUrl ? (
        <p className="proof-status__export-footer">
          <button
            type="button"
            className="proof-status__link"
            onClick={() =>
              exportReceiptId?.trim()
                ? openReceiptProofBundleDownload(exportReceiptId.trim())
                : proofExportUrl
                  ? window.open(proofExportUrl, "_blank", "noopener,noreferrer")
                  : undefined
            }
          >
            Export proof
          </button>
        </p>
      ) : null}

      <details
        className="proof-status__details"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="proof-status__details-summary" id={`${detailsId}-summary`}>
          View details
        </summary>
        <div className="proof-status__details-body" role="region" aria-labelledby={`${detailsId}-summary`}>
          <dl className="proof-status__dl">
            <dt className="proof-status__dt">Recorded</dt>
            <dd className="proof-status__dd">{recordedLabel ?? (recordedComplete ? "On file" : "—")}</dd>

            <dt className="proof-status__dt">Ready to verify</dt>
            <dd className="proof-status__dd">{proofVerificationDetailTechnical(verificationStatus)}</dd>
            {verificationReadyLabel ? (
              <>
                <dt className="proof-status__dt">Verification ready</dt>
                <dd className="proof-status__dd">{verificationReadyLabel}</dd>
              </>
            ) : null}

            <dt className="proof-status__dt">Timestamped</dt>
            <dd className="proof-status__dd">{proofAnchorDetailTechnical(anchorStatus)}</dd>

            {showNetworkInDetails ? (
              <>
                <dt className="proof-status__dt">Network</dt>
                <dd className="proof-status__dd">{anchorNetwork}</dd>
              </>
            ) : null}

            {anchorRequestedLabel ? (
              <>
                <dt className="proof-status__dt">Anchor requested</dt>
                <dd className="proof-status__dd">{anchorRequestedLabel}</dd>
              </>
            ) : null}

            {anchorConfirmedLabel ? (
              <>
                <dt className="proof-status__dt">Anchor confirmed</dt>
                <dd className="proof-status__dd">{anchorConfirmedLabel}</dd>
              </>
            ) : null}

            {showTxInDetails ? (
              <>
                <dt className="proof-status__dt">Transaction / reference</dt>
                <dd className="proof-status__dd">{anchorReference}</dd>
              </>
            ) : null}

            {showBatchInDetails ? (
              <>
                <dt className="proof-status__dt">Batch / inclusion reference</dt>
                <dd className="proof-status__dd">{anchorBatchReference}</dd>
              </>
            ) : null}
          </dl>

          {anchorStatus === "available" && onUpgradeProof ? (
            <div className="proof-status__advanced-actions">
              <span className="proof-status__advanced-label">Advanced:</span>
              <button type="button" className="proof-status__link" onClick={onUpgradeProof}>
                Anchor to blockchain
              </button>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
