import type { AgreementDraft } from "../../agreement/agreementTypes";
import { approvedParticipantIds, normalizeWorkflowRoleForNegotiation } from "../../agreement/participantModel";
import { findOpenRecipientProposals } from "../../agreement/recipientProposal";
import {
  deriveReviewerLinkRowApprovalStatus,
  type ReviewerLinkRow,
  type ReviewerLinkRowApprovalStatus,
} from "../../launch/simpleProduct/reviewerLinkRowModel";

/** True when a recipient (or participant) approval event exists on the draft audit log. */
export function draftAuditHasRecipientRecordedApproval(draft: unknown): boolean {
  const log = (draft as { audit_log?: AgreementDraft["audit_log"] | null } | null | undefined)?.audit_log;
  if (!Array.isArray(log) || log.length === 0) return false;
  return log.some((e) => {
    const t = String(e?.event_type || "").trim();
    return t === "recipient_approved" || t === "participant_approved";
  });
}

function legacyRecipientApprovalWithoutParticipantId(draft: AgreementDraft | null | undefined): boolean {
  const log = draft?.audit_log;
  if (!Array.isArray(log)) return false;
  for (const e of log) {
    const t = String(e?.event_type || "").trim();
    if (t !== "recipient_approved" && t !== "participant_approved") continue;
    const val = e?.value as { participant_id?: string } | undefined;
    if (val && typeof val === "object" && String(val.participant_id || "").trim()) continue;
    return true;
  }
  return false;
}

export type ReviewApprovalAggregateStatus =
  | "waiting"
  | "partial"
  | "all_approved"
  | "changes_pending";

export type ReviewApprovalAggregate = {
  requiredReviewerCount: number;
  approvedReviewerCount: number;
  legacyApprovalWithoutParticipantId: boolean;
  anyReviewerApproval: boolean;
  allReviewersApproved: boolean;
  hasOpenChangeRequests: boolean;
  aggregateStatus: ReviewApprovalAggregateStatus;
  /** Owner “done” page shell title when review links are ready (not signing-locked). */
  flowShellTitle: string;
  /** Short status line in the owner panel (after links exist). */
  ownerStatusLine: string;
  /** Whether owner should see Finalize for signing as the honest next step. */
  finalizeForSigningEnabled: boolean;
};

/**
 * Deterministic multi-reviewer rollup for owner UX (minted links + draft parties + audit).
 *
 * ``mintedReviewerLinkCount`` comes from client-side review-link handoff rows (how many personal links were minted).
 * When omitted or zero, falls back to reviewer-role parties with ids, then ``1`` for legacy single-recipient flows.
 */
export function computeReviewApprovalStatus(
  draft: unknown,
  opts: { mintedReviewerLinkCount?: number } = {},
): ReviewApprovalAggregate {
  const d = draft as AgreementDraft | null | undefined;
  const parties = d?.parties ?? [];
  const audit = d?.audit_log;
  const minted = Math.max(0, Math.floor(opts.mintedReviewerLinkCount ?? 0));
  const reviewerPartyIds = parties
    .filter((p) => normalizeWorkflowRoleForNegotiation(String(p?.role ?? "")) === "reviewer")
    .map((p) => String(p?.id ?? "").trim())
    .filter(Boolean);
  const required = Math.max(minted, reviewerPartyIds.length, 1);
  const approvedIds = approvedParticipantIds(audit);
  let approved = reviewerPartyIds.filter((id) => approvedIds.has(id)).length;
  const legacy = Boolean(d && legacyRecipientApprovalWithoutParticipantId(d));
  if (legacy && approved === 0) {
    approved = 1;
  }
  const anyReviewerApproval =
    approved > 0 || (legacy && Boolean(d && draftAuditHasRecipientRecordedApproval(d)));
  const open = d ? findOpenRecipientProposals(d.audit_log).length > 0 : false;
  const allReviewersApproved = !open && approved >= required && anyReviewerApproval;
  const hasOpenChangeRequests = open;
  let aggregateStatus: ReviewApprovalAggregateStatus;
  if (hasOpenChangeRequests) aggregateStatus = "changes_pending";
  else if (allReviewersApproved) aggregateStatus = "all_approved";
  else if (anyReviewerApproval) aggregateStatus = "partial";
  else aggregateStatus = "waiting";

  let flowShellTitle = "Review link created";
  if (allReviewersApproved) flowShellTitle = "All reviewers approved";
  else if (anyReviewerApproval) flowShellTitle = "Review in progress";

  let ownerStatusLine =
    !anyReviewerApproval && required > 1
      ? `0 of ${required} reviewers approved. Waiting for reviewer responses.`
      : "Waiting for reviewer responses.";
  if (hasOpenChangeRequests) {
    ownerStatusLine = "Open change requests — resolve in workspace before finalizing.";
  } else if (allReviewersApproved) {
    ownerStatusLine = "All reviewers approved — ready to sign.";
  } else if (anyReviewerApproval && required > 1) {
    ownerStatusLine = `${approved} of ${required} reviewers approved. Waiting for remaining reviewers.`;
  } else if (anyReviewerApproval) {
    ownerStatusLine = "Reviewer approved — ready to sign.";
  }

  return {
    requiredReviewerCount: required,
    approvedReviewerCount: approved,
    legacyApprovalWithoutParticipantId: legacy,
    anyReviewerApproval,
    allReviewersApproved,
    hasOpenChangeRequests,
    aggregateStatus,
    flowShellTitle,
    ownerStatusLine,
    finalizeForSigningEnabled: allReviewersApproved,
  };
}

/** Green panel copy when every required reviewer row is approved (owner Simple Done). */
export const OWNER_DONE_ALL_REVIEWERS_APPROVED_BODY_COPY = "All reviewers approved — ready to sign.";

export type OwnerDoneReviewApprovalAggregateSource = "reviewer_rows" | "draft_signals" | "legacy";

export type OwnerDoneReviewApprovalPresentation = {
  aggregate: ReviewApprovalAggregate;
  approvalAggregateSource: OwnerDoneReviewApprovalAggregateSource;
  /** Same derivation as the reviewer links table (one status per minted row). */
  rowStatuses: ReviewerLinkRowApprovalStatus[];
  /** Normalized minted handoff rows (canonical count for multi-reviewer). */
  normalizedReviewerRows: ReviewerLinkRow[];
  /** Party/audit-based rollup (can diverge when draft.parties omit reviewer ids). */
  draftSignalsBaseline: ReviewApprovalAggregate;
};

function buildMultiReviewerAggregateFromRowStatuses(
  d: AgreementDraft | null | undefined,
  normalizedRows: ReviewerLinkRow[],
  rowStatuses: ReviewerLinkRowApprovalStatus[],
  draftSignalsBaseline: ReviewApprovalAggregate,
): ReviewApprovalAggregate {
  const required = normalizedRows.length;
  const approved = rowStatuses.filter((s) => s === "approved").length;
  const hasRowLevelChangeRequest = rowStatuses.some((s) => s === "requested_changes");
  const globalOpenProposals = d ? findOpenRecipientProposals(d.audit_log).length > 0 : false;
  const hasOpenChangeRequests = hasRowLevelChangeRequest || globalOpenProposals;
  const anyReviewerApproval = approved > 0 || hasOpenChangeRequests;
  const allReviewersApproved =
    required > 0 && approved === required && !hasOpenChangeRequests && approved > 0;

  let aggregateStatus: ReviewApprovalAggregateStatus;
  if (hasOpenChangeRequests) aggregateStatus = "changes_pending";
  else if (allReviewersApproved) aggregateStatus = "all_approved";
  else if (approved > 0) aggregateStatus = "partial";
  else aggregateStatus = "waiting";

  let flowShellTitle = "Review link created";
  if (allReviewersApproved) flowShellTitle = "All reviewers approved";
  else if (anyReviewerApproval) flowShellTitle = "Review in progress";

  let ownerStatusLine =
    approved === 0 && required > 1 && !hasOpenChangeRequests
      ? `0 of ${required} reviewers approved. Waiting for reviewer responses.`
      : "Waiting for reviewer responses.";
  if (hasOpenChangeRequests) {
    ownerStatusLine = "Open change requests — resolve in workspace before finalizing.";
  } else if (allReviewersApproved) {
    ownerStatusLine = `${required} of ${required} reviewers approved. Ready to finalize for signing.`;
  } else if (approved > 0 && required > 1) {
    ownerStatusLine = `${approved} of ${required} reviewers approved. Waiting for remaining reviewers.`;
  } else if (approved > 0 && required === 1) {
    ownerStatusLine = "Reviewer approved — ready to sign.";
  }

  return {
    requiredReviewerCount: required,
    approvedReviewerCount: approved,
    legacyApprovalWithoutParticipantId: draftSignalsBaseline.legacyApprovalWithoutParticipantId,
    anyReviewerApproval,
    allReviewersApproved,
    hasOpenChangeRequests,
    aggregateStatus,
    flowShellTitle,
    ownerStatusLine,
    finalizeForSigningEnabled: allReviewersApproved,
  };
}

/**
 * Canonical owner-done approval rollup: for **multiple** minted reviewer rows, counts and finalize
 * gate follow {@link deriveReviewerLinkRowApprovalStatus} per row (same as the Reviewer Links table).
 * For a single row, reuses {@link computeReviewApprovalStatus} (legacy single-recipient semantics).
 */
export function computeOwnerDoneReviewApprovalPresentation(
  draft: unknown,
  normalizedReviewerRows: ReviewerLinkRow[],
): OwnerDoneReviewApprovalPresentation {
  const d = draft as AgreementDraft | null | undefined;
  const minted = Math.max(0, normalizedReviewerRows.length);
  const draftSignalsBaseline = computeReviewApprovalStatus(draft, { mintedReviewerLinkCount: minted || 1 });
  const legacyGlobal = draftSignalsBaseline.legacyApprovalWithoutParticipantId;
  const rowStatuses: ReviewerLinkRowApprovalStatus[] = normalizedReviewerRows.map((r, i) =>
    deriveReviewerLinkRowApprovalStatus(d, r, { legacyGlobalApproval: legacyGlobal, rowIndex: i }),
  );

  if (normalizedReviewerRows.length <= 1) {
    const approvalAggregateSource: OwnerDoneReviewApprovalAggregateSource = legacyGlobal ? "legacy" : "draft_signals";
    return {
      aggregate: draftSignalsBaseline,
      approvalAggregateSource,
      rowStatuses,
      normalizedReviewerRows,
      draftSignalsBaseline,
    };
  }

  const aggregate = buildMultiReviewerAggregateFromRowStatuses(
    d,
    normalizedReviewerRows,
    rowStatuses,
    draftSignalsBaseline,
  );
  return {
    aggregate,
    approvalAggregateSource: "reviewer_rows",
    rowStatuses,
    normalizedReviewerRows,
    draftSignalsBaseline,
  };
}

/** Links minted and stable enough for signing / finalize CTAs on the owner done page. */
export function signingHandoffLinksReadyForDonePage(input: {
  reviewLinksReady: boolean;
  anyReviewHref: boolean;
  linksStillLoading: boolean;
  linksIncomplete: boolean;
}): boolean {
  return (
    input.reviewLinksReady &&
    input.anyReviewHref &&
    !input.linksStillLoading &&
    !input.linksIncomplete
  );
}

/**
 * Pure gate: all required reviewers approved, no open change proposals, and review links are ready.
 * Does not inspect signing lock — VS01 handoff runs after finalize until lock is set server-side.
 */
export function canFinalizeReviewForSigning(input: {
  agreementIdTrimmed: string;
  reviewLinksReady: boolean;
  anyReviewHref: boolean;
  linksStillLoading: boolean;
  linksIncomplete: boolean;
  reviewApprovalAggregate: Pick<
    ReviewApprovalAggregate,
    "requiredReviewerCount" | "allReviewersApproved" | "hasOpenChangeRequests"
  >;
}): boolean {
  if (!(input.agreementIdTrimmed || "").trim()) return false;
  if (!signingHandoffLinksReadyForDonePage(input)) return false;
  if (input.reviewApprovalAggregate.requiredReviewerCount <= 0) return false;
  if (!input.reviewApprovalAggregate.allReviewersApproved) return false;
  if (input.reviewApprovalAggregate.hasOpenChangeRequests) return false;
  return true;
}

/** Owner done page: signing version already locked — continue into VS01 / signing shell. */
export function canContinueLockedSigningFromDonePage(input: {
  agreementIdTrimmed: string;
  signingLockActive: boolean;
  reviewLinksReady: boolean;
  anyReviewHref: boolean;
  linksStillLoading: boolean;
  linksIncomplete: boolean;
}): boolean {
  if (!(input.agreementIdTrimmed || "").trim()) return false;
  if (!input.signingLockActive) return false;
  return signingHandoffLinksReadyForDonePage(input);
}

/** When true, do not persist paid-pro edit-return snapshot on “Back to draft” (server draft is source of truth). */
export function shouldWritePaidProEditReturnHandoffAfterReview(
  draft: AgreementDraft | null | undefined,
  hasRecoverableBody: boolean,
): boolean {
  if (!draft || !hasRecoverableBody) return false;
  return !draftAuditHasRecipientRecordedApproval(draft);
}

/** Dev / QA: `localStorage.lawdogOwnerReviewReturnDiag = "1"` */
export function logOwnerReviewReturnState(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogOwnerReviewReturnDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info("[owner-review-return-state]", payload);
}

/** Dev / QA: `localStorage.lawdogOwnerReviewLinkStatusDiag = "1"` (also honors `lawdogOwnerReviewReturnDiag`). */
export function logOwnerReviewLinkStatus(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogOwnerReviewLinkStatusDiag") === "1" ||
    window.localStorage?.getItem("lawdogOwnerReviewReturnDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info("[owner-review-link-status]", payload);
}

/** Dev / QA: same flags as {@link logOwnerReviewLinkStatus} + `lawdogOwnerFinalizeRouteDiag`. */
export function logOwnerFinalizeRouteDecision(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogOwnerFinalizeRouteDiag") === "1" ||
    window.localStorage?.getItem("lawdogOwnerReviewLinkStatusDiag") === "1" ||
    window.localStorage?.getItem("lawdogOwnerReviewReturnDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info("[owner-finalize-route-decision]", payload);
}
