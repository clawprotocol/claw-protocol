import type { AgreementDraft } from "./agreementTypes";
import { findLastAcceptedProposalProposer } from "./reviewCorpusAuthority";

export type ReviewProposalGateResult = {
  allowed: boolean;
  requesterPartyId: string;
  lastAcceptedProposalPartyId: string | null;
  reason: string;
};

function otherPartyReviewActionAfterApplied(
  audit: AgreementDraft["audit_log"] | undefined,
  appliedIndex: number,
  excludePartyId: string,
): boolean {
  const entries = audit || [];
  for (let j = appliedIndex + 1; j < entries.length; j += 1) {
    const e = entries[j]!;
    const et = String(e.event_type || "").trim();
    if (et === "participant_approved" || et === "recipient_approved") {
      const pid = String((e.value as { participant_id?: string } | undefined)?.participant_id || "").trim();
      if (pid && pid !== excludePartyId) return true;
    }
    if (et === "recipient_proposal_pending") {
      const pid = String((e.value as { proposer_id?: string } | undefined)?.proposer_id || "").trim();
      if (pid && pid !== excludePartyId) return true;
    }
    if (et === "recipient_proposal_rejected") {
      const pid = String((e.value as { proposer_id?: string } | undefined)?.proposer_id || "").trim();
      if (pid && pid !== excludePartyId) return true;
    }
  }
  return false;
}

/**
 * Prevent review ping-pong: after Party X's proposal is accepted, Party X cannot submit
 * another proposal until another participant performs a review action.
 */
export function resolveReviewProposalGate(args: {
  draft: AgreementDraft | null | undefined;
  requesterPartyId: string;
}): ReviewProposalGateResult {
  const requesterPartyId = args.requesterPartyId.trim();
  const lastAccepted = findLastAcceptedProposalProposer(args.draft?.audit_log);
  const lastAcceptedProposalPartyId = lastAccepted?.proposerId ?? null;

  if (!requesterPartyId || !lastAccepted || lastAccepted.proposerId !== requesterPartyId) {
    return {
      allowed: true,
      requesterPartyId,
      lastAcceptedProposalPartyId,
      reason: "no_monopolization_block",
    };
  }

  const otherActed = otherPartyReviewActionAfterApplied(
    args.draft?.audit_log,
    lastAccepted.appliedIndex,
    requesterPartyId,
  );
  if (otherActed) {
    return {
      allowed: true,
      requesterPartyId,
      lastAcceptedProposalPartyId,
      reason: "other_party_acted_since_accept",
    };
  }

  return {
    allowed: false,
    requesterPartyId,
    lastAcceptedProposalPartyId,
    reason: "awaiting_other_party_review",
  };
}

let lastReviewProposalGateLogKey = "";

export function logReviewProposalGate(payload: ReviewProposalGateResult): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastReviewProposalGateLogKey) return;
  lastReviewProposalGateLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[review-proposal-gate]", {
    requesterPartyId: payload.requesterPartyId,
    lastAcceptedProposalPartyId: payload.lastAcceptedProposalPartyId,
    allowed: payload.allowed,
    reason: payload.reason,
  });
}
