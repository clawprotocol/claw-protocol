import type { ReactNode } from "react";
import { PRODUCT_NOT_LAW_FIRM, RECORDS_DOWNLOAD_KEEP_COPY_SHORT } from "../compliance/disclosureCopy";
import { JOY_COPY } from "../joy/clawJoyCopy";
import { PROOF_LADDER_SUBTITLE } from "../components/proof/proofTrustLadder";
import { LawdogOnRecordStamp } from "../components/ui/LawdogOnRecordStamp";
import { JoyMilestoneMark } from "../joy/JoyMilestone";
import { formatPendingSignerStatusLabel, type PendingSignerRow } from "./pendingSignatureDerive";

export type CompletedAgreementPanelProps = {
  agreementTitle: string;
  /** Summary card */
  signersCompleteSummary: string;
  finalVersionLabel: string;
  proofSummaryShort: string;
  /** Section B */
  finalVersionId: string;
  finalizedAtLabel: string | null;
  completedAtLabel: string | null;
  /** Section C */
  signerRows: PendingSignerRow[];
  signerRosterSummary: string;
  /** Section D */
  finalAgreementHtml: string;
  finalContentUnavailableHint: string | null;
  /** Sections E–F (same slot as pending signature) */
  executionAndProofSlot: ReactNode;
  /** Section G — negotiation timeline and/or read-only history */
  readOnlyHistorySlot: ReactNode;
  /** Unified conversion layer after the final record banner (e.g. {@link ClaimRecordCard}). */
  claimRecordSlot?: ReactNode;
};

export function CompletedAgreementPanel(props: CompletedAgreementPanelProps) {
  const {
    agreementTitle,
    signersCompleteSummary,
    finalVersionLabel,
    proofSummaryShort,
    finalVersionId,
    finalizedAtLabel,
    completedAtLabel,
    signerRows,
    signerRosterSummary,
    finalAgreementHtml,
    finalContentUnavailableHint,
    executionAndProofSlot,
    readOnlyHistorySlot,
    claimRecordSlot,
  } = props;

  return (
    <div className="vs01-completed-agreement-panel space-y-5">
      <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-emerald-200/85">Final record</p>
              <LawdogOnRecordStamp surface="dark" />
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-emerald-200/70">{PROOF_LADDER_SUBTITLE}</p>
            <div className="mt-2 flex items-start gap-2">
              <JoyMilestoneMark className="scale-75" />
              <p className="text-sm font-semibold leading-snug text-emerald-50">{JOY_COPY.signLockedIn}</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-emerald-100/85">{signersCompleteSummary}</p>
          </div>
          <div className="text-right text-[11px] text-emerald-100/80">
            <div>
              <span className="text-emerald-200/70">Final signed version · </span>
              <span className="font-mono text-emerald-50">{finalVersionLabel}</span>
            </div>
            <p className="mt-1 text-[10px] text-emerald-200/70">{proofSummaryShort}</p>
          </div>
        </div>
      </div>

      {claimRecordSlot ? <div className="claim-record-slot">{claimRecordSlot}</div> : null}

      <header className="rounded-lg border border-slate-700/80 bg-slate-950/40 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-100">{agreementTitle || "Untitled agreement"}</h2>
          <span className="inline-flex rounded-full border border-emerald-700/60 bg-emerald-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200/95">
            Sealed
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Fully signed — packet and proof below. {RECORDS_DOWNLOAD_KEEP_COPY_SHORT} {PRODUCT_NOT_LAW_FIRM}
        </p>
      </header>

      <section
        className="rounded-lg border border-slate-800/90 bg-slate-900/35 px-4 py-4"
        aria-labelledby="completed-final-version-heading"
      >
        <h3 id="completed-final-version-heading" className="text-sm font-semibold text-slate-100">
          Final signed version
        </h3>
        <dl className="mt-3 space-y-1 text-xs text-slate-300">
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            <dt className="font-medium text-slate-500">Version id</dt>
            <dd className="min-w-0 break-all font-mono text-[11px] text-slate-200">{finalVersionId}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            <dt className="font-medium text-slate-500">Label</dt>
            <dd className="font-mono text-[11px] text-slate-200">{finalVersionLabel}</dd>
          </div>
          {finalizedAtLabel ? (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              <dt className="font-medium text-slate-500">Finalized</dt>
              <dd>{finalizedAtLabel}</dd>
            </div>
          ) : null}
          {completedAtLabel ? (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              <dt className="font-medium text-slate-500">Completed</dt>
              <dd>{completedAtLabel}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="completed-signers-heading">
        <h3 id="completed-signers-heading" className="text-sm font-semibold text-slate-100">
          Signer summary
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">{signerRosterSummary}</p>
        {signerRows.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">No signers with the signer role are listed on this agreement.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800/90 rounded-lg border border-slate-800/90 bg-slate-950/30">
            {signerRows.map((row: PendingSignerRow, idx: number) => (
              <li
                key={`${row.name}_${idx}`}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-100">{row.name}</div>
                  {row.email ? <div className="text-[11px] text-slate-500">{row.email}</div> : null}
                  {row.detail ? <div className="mt-1 text-[11px] text-slate-500">{row.detail}</div> : null}
                </div>
                <span className="inline-flex shrink-0 rounded-full border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                  {formatPendingSignerStatusLabel(row.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="completed-final-doc-heading">
        <h3 id="completed-final-doc-heading" className="text-sm font-semibold text-slate-100">
          Final agreement
        </h3>
        {finalContentUnavailableHint ? (
          <p className="mt-2 text-xs text-amber-200/90">{finalContentUnavailableHint}</p>
        ) : null}
        <div className="mt-3 rounded-lg border border-slate-700 bg-white p-6 text-slate-900 shadow-sm sm:p-8">
          <div className="prose max-w-none text-slate-900 text-[0.9375rem] leading-relaxed">
            {/* eslint-disable-next-line react/no-danger -- final HTML from saved execution packet / version */}
            <div dangerouslySetInnerHTML={{ __html: finalAgreementHtml || "<p>No rendered document yet.</p>" }} />
          </div>
        </div>
      </section>

      {executionAndProofSlot}

      <section aria-labelledby="completed-history-heading">
        <h3 id="completed-history-heading" className="text-sm font-semibold text-slate-100">
          Negotiation timeline
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">Version history is read-only. This is an audit record only.</p>
        <div className="mt-3">{readOnlyHistorySlot}</div>
      </section>
    </div>
  );
}
