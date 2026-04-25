import type { AgreementDraft } from "./agreementTypes";

export type PendingRecipientProposalValue = {
  proposal_id: string;
  instruction: string;
  draft: Record<string, unknown>;
  rendered_html?: string;
  submitted_at?: string;
  proposer_id?: string;
  proposer_display_name?: string;
};

function isProposalClosed(
  entries: AgreementDraft["audit_log"],
  proposalId: string,
  pendingIndex: number
): boolean {
  const pid = proposalId.trim();
  for (let j = pendingIndex + 1; j < entries.length; j++) {
    const e = entries[j]!;
    const et = e.event_type || "";
    const val = e.value as { proposal_id?: string } | undefined;
    if (String(val?.proposal_id || "").trim() !== pid) continue;
    if (
      et === "recipient_proposal_applied" ||
      et === "recipient_proposal_rejected" ||
      et === "recipient_proposal_superseded"
    ) {
      return true;
    }
  }
  return false;
}

/** All open pending proposals, oldest first (FIFO). */
export function findOpenRecipientProposals(
  audit: AgreementDraft["audit_log"] | undefined
): PendingRecipientProposalValue[] {
  const entries = audit || [];
  const open: PendingRecipientProposalValue[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if ((e.event_type || "") !== "recipient_proposal_pending") continue;
    const val = e.value as PendingRecipientProposalValue | undefined;
    const pid = String(val?.proposal_id || "").trim();
    if (!pid || !val?.draft) continue;
    if (isProposalClosed(entries, pid, i)) continue;
    open.push(val);
  }
  open.sort((a, b) => String(a.submitted_at || "").localeCompare(String(b.submitted_at || "")));
  return open;
}

/** @deprecated prefer findOpenRecipientProposals — returns first in FIFO queue. */
export function findOpenRecipientProposal(
  audit: AgreementDraft["audit_log"] | undefined
): PendingRecipientProposalValue | null {
  const all = findOpenRecipientProposals(audit);
  return all[0] ?? null;
}

export function openRecipientProposalsForParticipant(
  audit: AgreementDraft["audit_log"] | undefined,
  participantId: string
): PendingRecipientProposalValue[] {
  const pid = participantId.trim();
  if (!pid) return findOpenRecipientProposals(audit);
  return findOpenRecipientProposals(audit).filter((p) => String(p.proposer_id || "").trim() === pid);
}
