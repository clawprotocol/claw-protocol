import type { ReactNode } from "react";
import { PRODUCT_NOT_LAW_FIRM, RECORDS_DOWNLOAD_KEEP_COPY_SHORT } from "../compliance/disclosureCopy";
import {
  buildPendingSignerRows,
  formatPendingSignerStatusLabel,
  type PendingSignerRow,
} from "./pendingSignatureDerive";

export type PendingSignaturePanelProps = {
  agreementTitle: string;
  lockedVersionId: string;
  /** e.g. "v3" or short id preview */
  versionLabel: string;
  finalizedAtLabel: string | null;
  signerModel: ReturnType<typeof buildPendingSignerRows>;
  signingUrl: string | null;
  /** Public `/verify/{id}` URL (metadata + hashes only). */
  verificationUrl?: string | null;
  agreementFullySigned: boolean;
  lockedVersionMissing: boolean;
  /** Reopen negotiation + confirm UI */
  ownerActions: ReactNode;
  /** Execution packet card + proof (reused from parent) */
  executionAndProofSlot: ReactNode;
};

export function PendingSignaturePanel(props: PendingSignaturePanelProps) {
  const {
    agreementTitle,
    lockedVersionId,
    versionLabel,
    finalizedAtLabel,
    signerModel,
    signingUrl,
    verificationUrl,
    agreementFullySigned,
    lockedVersionMissing,
    ownerActions,
    executionAndProofSlot,
  } = props;

  const { rows, summary } = signerModel;

  return (
    <div className="vs01-pending-signature-panel space-y-5">
      <header className="rounded-lg border border-slate-700/80 bg-slate-950/40 px-4 py-4">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-amber-200/90">
          Pending signature
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-100">{agreementTitle || "Untitled agreement"}</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          {agreementFullySigned
            ? "Signatures are recorded. You can still review the signing record and verification below."
            : "This agreement is finalized and waiting on signatures."}
        </p>
        <p className="mt-3 text-sm font-medium text-slate-200">{summary}</p>
      </header>

      <section
        className="rounded-lg border border-emerald-800/40 bg-emerald-950/15 px-4 py-4"
        aria-labelledby="pending-sig-locked-heading"
      >
        <h4 id="pending-sig-locked-heading" className="text-sm font-semibold text-emerald-100">
          Final version ready for signature
        </h4>
        {lockedVersionMissing ? (
          <p className="mt-2 text-xs text-amber-200/90">
            The final signing version could not be loaded on this device. The screen is read-only for safety—refresh or
            open the agreement where you finalized it.
          </p>
        ) : (
          <>
            <dl className="mt-3 space-y-1 text-xs text-emerald-100/85">
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                <dt className="font-medium text-emerald-200/80">Version</dt>
                <dd className="font-mono text-[11px] text-emerald-50/95">{versionLabel}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                <dt className="font-medium text-emerald-200/80">Version id</dt>
                <dd className="min-w-0 break-all font-mono text-[11px] text-emerald-50/90">{lockedVersionId}</dd>
              </div>
              {finalizedAtLabel ? (
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  <dt className="font-medium text-emerald-200/80">Finalized</dt>
                  <dd>{finalizedAtLabel}</dd>
                </div>
              ) : null}
            </dl>
          </>
        )}
      </section>

      <section aria-labelledby="pending-sig-roster-heading">
        <h4 id="pending-sig-roster-heading" className="text-sm font-semibold text-slate-100">
          Signer progress
        </h4>
        <p className="mt-1 text-[11px] text-slate-500">{summary}</p>
        {rows.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">No signers listed yet. Add signers on the Recipients step.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800/90 rounded-lg border border-slate-800/90 bg-slate-950/30">
            {rows.map((row: PendingSignerRow, idx: number) => (
              <li key={`${row.name}_${idx}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-100">{row.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {row.email ? row.email : "Email not on file"}
                  </div>
                  {row.detail ? <div className="mt-1 text-[11px] text-slate-500">{row.detail}</div> : null}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                  <span className="inline-flex rounded-full border border-slate-600/80 bg-slate-900/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                    {formatPendingSignerStatusLabel(row.status)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {row.status === "signed"
                      ? "View signed state in the activity log if needed."
                      : row.status === "sent"
                        ? "Use the signing link below when you are the invited signer (one URL is shared with all signers on this agreement)."
                        : "Generate a signing link using the actions below."}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pending-sig-actions-heading">
        <h4 id="pending-sig-actions-heading" className="text-sm font-semibold text-slate-100">
          Signing actions
        </h4>
        {agreementFullySigned ? (
          <p className="mt-2 text-xs text-emerald-200/90">
            Signatures are recorded for this agreement. You can still review the signing record and verification below.
          </p>
        ) : signingUrl ? (
          <div className="mt-3 space-y-3 rounded-lg border border-slate-700/80 bg-slate-900/35 p-4">
            <p className="text-[11px] leading-relaxed text-slate-500">
              Signing is electronic. {RECORDS_DOWNLOAD_KEEP_COPY_SHORT} {PRODUCT_NOT_LAW_FIRM}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Invited signers share one signing URL. Open it only if you are supposed to sign; your completion is
              attributed to your signer identity when you finish.
            </p>
            <code className="block min-w-0 truncate rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-300">
              {signingUrl}
            </code>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
                onClick={() => void navigator.clipboard.writeText(signingUrl)}
              >
                Copy signing link
              </button>
              <button
                type="button"
                className="btn rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                onClick={() => window.open(signingUrl, "_blank", "noopener,noreferrer")}
              >
                Open signing link
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">
            Signing link is not available yet. Check recipient-link settings or finalize again from this device.
          </p>
        )}
      </section>

      {verificationUrl ? (
        <section aria-labelledby="pending-verify-heading">
          <h4 id="pending-verify-heading" className="text-sm font-semibold text-slate-100">
            Public verification
          </h4>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Share a read-only verification page with hashes and signature events — no full agreement text or financial
            terms.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn rounded-lg border border-violet-700/60 bg-violet-950/40 px-4 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-900/50"
              onClick={() => void navigator.clipboard.writeText(verificationUrl)}
            >
              Copy verification link
            </button>
            <button
              type="button"
              className="btn rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
              onClick={() => window.open(verificationUrl, "_blank", "noopener,noreferrer")}
            >
              Open verification page
            </button>
          </div>
        </section>
      ) : null}

      {ownerActions ? (
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/25 px-4 py-3 text-xs text-slate-400">
          <div className="font-semibold text-slate-300">Owner</div>
          <div className="mt-2">{ownerActions}</div>
        </div>
      ) : null}

      {executionAndProofSlot}
    </div>
  );
}
