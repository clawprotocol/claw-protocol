import type { ReviewFirstTextDiffSummary } from "./reviewFirstTextDiff";
import { logReviewProposalGate, resolveReviewProposalGate } from "./reviewProposalGate";
import type { AgreementDraft } from "./agreementTypes";

export type ReviewFirstSubmitBlockReason =
  | "ready"
  | "no_material_changes"
  | "missing_recipient_preview"
  | "personal_link_required"
  | "missing_participant_id"
  | "missing_access_token"
  | "signing_lock_active"
  | "proposal_not_ready"
  | "proposal_id_missing_before_post"
  | "proposer_id_missing_before_stage"
  | "awaiting_other_party_review";

export const REVIEW_FIRST_SUBMIT_AWAITING_OTHER_PARTY_MESSAGE =
  "Your last suggested changes were accepted. Wait for another reviewer to respond before submitting new changes.";

export type ReviewFirstSubmitAuthority = {
  canSubmit: boolean;
  reason: ReviewFirstSubmitBlockReason;
  userMessage: string | null;
};

export const REVIEW_FIRST_SUBMIT_PERSONAL_LINK_MESSAGE =
  "Open the personal review link from the sender to submit this proposed update. You can still review the changes here.";

export const REVIEW_FIRST_SUBMIT_MISSING_TOKEN_MESSAGE =
  "This review session is missing your personal access token. Open the review link from the sender (it includes your secure token) to submit edits.";

export const REVIEW_FIRST_SUBMIT_MISSING_PARTICIPANT_MESSAGE =
  "We could not determine your reviewer identity. Open the personal review link from the sender to submit this proposed update.";

export function resolveReviewFirstSubmitAuthority(args: {
  agreementId?: string;
  draft?: AgreementDraft | null;
  diff: ReviewFirstTextDiffSummary | null;
  /** @deprecated Prefer recipientAccessToken — preview-only when no token and no participant. */
  needsPersonalizedLink?: boolean;
  participantPid: string;
  partiesHaveIds: boolean;
  recipientAccessToken: string;
  recipientPreview: boolean;
  signingLockActive: boolean;
}): ReviewFirstSubmitAuthority {
  const hasPersonalToken = Boolean(args.recipientAccessToken.trim());
  const isPreviewOnlySession =
    args.needsPersonalizedLink ??
    Boolean(args.partiesHaveIds && !hasPersonalToken && !args.participantPid.trim());
  if (args.signingLockActive) {
    return {
      canSubmit: false,
      reason: "signing_lock_active",
      userMessage: "Review is closed on this agreement — you can still read the document.",
    };
  }
  const proposalGate = resolveReviewProposalGate({
    draft: args.draft ?? null,
    requesterPartyId: args.participantPid,
  });
  logReviewProposalGate(proposalGate);
  if (!proposalGate.allowed) {
    return {
      canSubmit: false,
      reason: "awaiting_other_party_review",
      userMessage: REVIEW_FIRST_SUBMIT_AWAITING_OTHER_PARTY_MESSAGE,
    };
  }
  if (!args.diff?.hasMaterialChanges) {
    return {
      canSubmit: false,
      reason: "no_material_changes",
      userMessage: null,
    };
  }
  if (!args.recipientPreview) {
    return {
      canSubmit: false,
      reason: "missing_recipient_preview",
      userMessage: "Review changes before submitting your proposed update.",
    };
  }
  if (isPreviewOnlySession) {
    return {
      canSubmit: false,
      reason: "personal_link_required",
      userMessage: REVIEW_FIRST_SUBMIT_PERSONAL_LINK_MESSAGE,
    };
  }
  if (args.partiesHaveIds && !hasPersonalToken) {
    return {
      canSubmit: false,
      reason: "missing_access_token",
      userMessage: REVIEW_FIRST_SUBMIT_MISSING_TOKEN_MESSAGE,
    };
  }
  if (args.partiesHaveIds && !args.participantPid.trim() && !hasPersonalToken) {
    return {
      canSubmit: false,
      reason: "missing_participant_id",
      userMessage: REVIEW_FIRST_SUBMIT_MISSING_PARTICIPANT_MESSAGE,
    };
  }
  return { canSubmit: true, reason: "ready", userMessage: null };
}

export function logReviewFirstSubmitStart(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-submit-start]", payload);
}

export function logReviewFirstSubmitBlocked(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-submit-blocked]", payload);
}

export function logReviewFirstSubmitSuccess(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-submit-success]", payload);
}

export function logReviewFirstSubmitFailed(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-submit-failed]", payload);
}

export function logReviewFirstProposalCreated(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-proposal-created]", payload);
}

export function logReviewFirstSubmitConfirm(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-submit-confirm]", payload);
}

export function logReviewFirstProposalStageRequest(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-proposal-stage-request]", payload);
}
