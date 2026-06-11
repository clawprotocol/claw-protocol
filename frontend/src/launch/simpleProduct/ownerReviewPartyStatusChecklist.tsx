import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import {
  auditHasRecipientApprovalForParticipant,
  normalizeWorkflowRoleForNegotiation,
  participantDisplayName,
} from "../../agreement/participantModel";
import { openRecipientProposalsForParticipant } from "../../agreement/recipientProposal";
import { findLastAcceptedProposalProposer } from "../../agreement/reviewCorpusAuthority";
import {
  resolveReviewLinkAssumedOwnerPartyIndex,
  rowReadyForReviewLinkInvite,
} from "./reviewLinkRecipientEmailMerge";

export type OwnerReviewPartyStatus =
  | "approved"
  | "not_reviewed"
  | "requested_changes"
  | "changes_accepted";

export type OwnerReviewPartyStatusRow = {
  partyIndex: number;
  partyLabel: string;
  displayName: string;
  partyId: string;
  status: OwnerReviewPartyStatus;
  statusLabel: string;
};

const STATUS_LABEL: Record<OwnerReviewPartyStatus, string> = {
  approved: "Approved",
  not_reviewed: "Not reviewed",
  requested_changes: "Requested changes",
  changes_accepted: "Changes accepted",
};

export function ownerReviewPartyStatusLabel(status: OwnerReviewPartyStatus): string {
  return STATUS_LABEL[status];
}

/** Whether this party must complete review before owner signature prep (excludes author/owner by default). */
export function partyRequiresReviewApproval(
  party: AgreementParty,
  partyIndex: number,
  parties: readonly AgreementParty[],
): boolean {
  const role = normalizeWorkflowRoleForNegotiation(String(party.role ?? ""));
  if (role === "viewer" || role === "owner") return false;
  if (role === "reviewer") return true;
  const hasExplicitReviewer = parties.some(
    (entry) => normalizeWorkflowRoleForNegotiation(String(entry.role ?? "")) === "reviewer",
  );
  if (hasExplicitReviewer) return false;
  const ownerIdx = resolveReviewLinkAssumedOwnerPartyIndex(parties);
  if (partyIndex === ownerIdx) return false;
  return rowReadyForReviewLinkInvite(party, partyIndex, parties);
}

/** Required reviewer rows for owner dashboard / signature-prep gating — excludes author/owner unless reviewer role. */
export function deriveRequiredReviewerPartyStatusRows(
  draft: AgreementDraft | null | undefined,
): OwnerReviewPartyStatusRow[] {
  const parties = draft?.parties ?? [];
  return deriveOwnerReviewPartyStatusRows(draft).filter((row) => {
    const party = parties[row.partyIndex];
    if (!party) return false;
    return partyRequiresReviewApproval(party, row.partyIndex, parties);
  });
}

/** Per-party review rollup for owner Review Link Ready — all non-viewer parties on the draft. */
export function deriveOwnerReviewPartyStatusRows(
  draft: AgreementDraft | null | undefined,
): OwnerReviewPartyStatusRow[] {
  const parties = draft?.parties ?? [];
  if (!parties.length) return [];
  const audit = draft?.audit_log;
  const lastAccepted = findLastAcceptedProposalProposer(audit);
  const rows: OwnerReviewPartyStatusRow[] = [];
  let reviewerOrdinal = 0;
  for (let i = 0; i < parties.length; i += 1) {
    const p = parties[i]!;
    const role = normalizeWorkflowRoleForNegotiation(String(p.role ?? ""));
    if (role === "viewer") continue;
    reviewerOrdinal += 1;
    const partyId = String(p.id ?? "").trim();
    const displayName = participantDisplayName(p, i);
    let status: OwnerReviewPartyStatus = "not_reviewed";
    if (partyId && openRecipientProposalsForParticipant(audit, partyId).length > 0) {
      status = "requested_changes";
    } else if (auditHasRecipientApprovalForParticipant(audit, partyId)) {
      status = "approved";
    } else if (partyId && lastAccepted?.proposerId === partyId) {
      status = "changes_accepted";
    }
    rows.push({
      partyIndex: i,
      partyLabel: `Party ${reviewerOrdinal}`,
      displayName,
      partyId,
      status,
      statusLabel: STATUS_LABEL[status],
    });
  }
  return rows;
}

export function countOwnerReviewPartyApproved(rows: readonly OwnerReviewPartyStatusRow[]): number {
  return rows.filter((r) => r.status === "approved").length;
}

let lastOwnerReviewStatusLogKey = "";

export function logReviewLinkOwnerReviewStatusLoaded(payload: {
  agreementId: string;
  partyCount: number;
  approvedCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastOwnerReviewStatusLogKey) return;
  lastOwnerReviewStatusLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[review-link-owner-review-status-loaded]", payload);
}

type OwnerReviewPartyStatusChecklistProps = {
  rows: readonly OwnerReviewPartyStatusRow[];
};

export function OwnerReviewPartyStatusChecklist({ rows }: OwnerReviewPartyStatusChecklistProps) {
  if (rows.length === 0) return null;
  return (
    <section
      className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left"
      data-testid="owner-review-party-status-checklist"
      aria-label="Review status"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Review status</h3>
      <ul className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <li
            key={`${row.partyIndex}-${row.displayName}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm text-slate-800"
            data-testid={`owner-review-party-status-${row.partyIndex}`}
          >
            <span className="min-w-0 font-medium">{row.displayName}</span>
            <span
              className={
                row.status === "approved"
                  ? "text-emerald-700"
                  : row.status === "requested_changes"
                    ? "text-amber-700"
                    : row.status === "changes_accepted"
                      ? "text-sky-700"
                      : "text-slate-500"
              }
            >
              {row.statusLabel}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
