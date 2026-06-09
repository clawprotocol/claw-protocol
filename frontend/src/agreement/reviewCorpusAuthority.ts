import type { AgreementDraft } from "./agreementTypes";
import type { PendingRecipientProposalValue } from "./recipientProposal";
import { findOpenRecipientProposals } from "./recipientProposal";
import { writeReviewFirstPinnedCorpus } from "../launch/simpleProduct/reviewFirstSendSurface";
import type { ReviewFirstDisplayCorpusSource } from "../launch/simpleProduct/reviewFirstDisplayCorpus";
import {
  getAuthoritativeSigningSnapshot,
  hasAuthoritativeSigningSnapshot,
  replaceAuthoritativeSigningSnapshotCorpus,
  syncAuthoritativeSigningSnapshotMetadataFromCorpus,
} from "../components/agreements/authoritativeSigningSnapshot";
import { commitPaidProPostFinalizeClauseEditRevision } from "../components/agreements/paidProPostFinalizeEditSave";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "../components/agreements/paidProSignerMetadataCommitPolicy";
import { resolvePaidProPostFinalizeReviewPlain } from "../components/agreements/paidProPostFinalizeReviewSurface";
import { hashPaidProCorpus } from "../components/agreements/paidProSourceOfTruth";
import { resolveReviewFirstDisplayCorpus } from "../launch/simpleProduct/reviewFirstDisplayCorpus";

export type ReviewCorpusAuthoritySurface =
  | "reviewer_view"
  | "owner_done"
  | "copy_export"
  | "dashboard"
  | "proposal_accept";

function corpusHash(text: string): string {
  const body = text.trim();
  let h = 2166136261;
  for (let i = 0; i < body.length; i += 1) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${body.length}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

let lastReviewCorpusAuthorityLogKey = "";

export function logReviewCorpusAuthority(payload: {
  agreementId: string;
  source: ReviewFirstDisplayCorpusSource | string;
  corpusHash: string;
  surface?: ReviewCorpusAuthoritySurface;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastReviewCorpusAuthorityLogKey) return;
  lastReviewCorpusAuthorityLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[review-corpus-authority]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    source: payload.source,
    corpusHash: payload.corpusHash,
    surface: payload.surface ?? null,
  });
}

let lastCopyExportCorpusLogKey = "";

export function logCopyExportCorpus(payload: {
  agreementId: string;
  source: ReviewFirstDisplayCorpusSource | string;
  corpusHash: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastCopyExportCorpusLogKey) return;
  lastCopyExportCorpusLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[copy-export-corpus]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    source: payload.source,
    corpusHash: payload.corpusHash,
  });
}

export function logReviewStatusTransition(payload: {
  agreementId: string;
  partyId?: string | null;
  from: string;
  to: string;
  reason: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[review-status-transition]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    partyId: payload.partyId ?? null,
    from: payload.from,
    to: payload.to,
    reason: payload.reason,
  });
}

/** Last accepted proposal proposer (from audit), when no open proposals remain. */
export function findLastAcceptedProposalProposer(
  audit: AgreementDraft["audit_log"] | undefined,
): { proposerId: string; proposalId: string; appliedAt: string; appliedIndex: number } | null {
  const entries = audit || [];
  if (findOpenRecipientProposals(entries).length > 0) return null;

  let appliedIndex = -1;
  let appliedAt = "";
  let proposalId = "";
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i]!;
    if ((e.event_type || "") !== "recipient_proposal_applied") continue;
    const val = e.value as { proposal_id?: string } | undefined;
    proposalId = String(val?.proposal_id || "").trim();
    appliedAt = String(e.at || "").trim();
    appliedIndex = i;
    break;
  }
  if (!proposalId || appliedIndex < 0) return null;

  for (let i = 0; i < appliedIndex; i += 1) {
    const e = entries[i]!;
    if ((e.event_type || "") !== "recipient_proposal_pending") continue;
    const val = e.value as PendingRecipientProposalValue | undefined;
    if (String(val?.proposal_id || "").trim() !== proposalId) continue;
    const proposerId = String(val?.proposer_id || "").trim();
    if (!proposerId) return null;
    return { proposerId, proposalId, appliedAt, appliedIndex };
  }
  return null;
}

export function draftHasAcceptedProposalWithoutOpenPending(draft: AgreementDraft | null | undefined): boolean {
  if (!draft) return false;
  return Boolean(findLastAcceptedProposalProposer(draft.audit_log));
}

function stringField(draft: AgreementDraft, key: keyof AgreementDraft): string {
  const v = draft[key];
  return typeof v === "string" ? v.trim() : "";
}

/** Corpus text persisted on draft after owner accepts a reviewer proposal. */
export function resolveAcceptedReviewCorpusFromDraft(draft: AgreementDraft | null): {
  text: string;
  source: ReviewFirstDisplayCorpusSource;
  hash: string;
} | null {
  if (!draft || !draftHasAcceptedProposalWithoutOpenPending(draft)) return null;

  const pr = draft.pro_redline_v1;
  const rf =
    pr && typeof pr === "object" && !Array.isArray(pr)
      ? (pr as Record<string, unknown>).review_first_final_corpus
      : null;
  if (rf && typeof rf === "object" && !Array.isArray(rf)) {
    const raw = String((rf as Record<string, unknown>).text ?? "").trim();
    if (raw.length >= 120) {
      return { text: raw, source: "review_first_final_corpus", hash: corpusHash(raw) };
    }
  }

  // After owner apply, backend merges proposal into purpose — server_* fields may be stale.
  for (const source of [
    "purpose",
    "document_text",
    "server_full_document_text",
    "premium_server_full_document_text",
    "premium_full_document_text",
  ] as const) {
    const text = stringField(draft, source);
    if (text.length >= 120) {
      return {
        text,
        source: source === "purpose" ? "document_text" : source,
        hash: corpusHash(text),
      };
    }
  }
  return null;
}

export type AcceptedReviewCorpusPromotionResult = {
  beforeAcceptHash: string;
  acceptedProposalHash: string;
  afterAcceptHash: string;
  reviewSnapshotHash: string | null;
  selectedDisplaySource: string | null;
  selectedDisplayHash: string | null;
  signingHandoffHash: string | null;
};

let lastAcceptedReviewCorpusPromotionLogKey = "";
let lastTest321AcceptedReviewPromotionLogKey = "";

export function logTest321AcceptedReviewPromotion(payload: {
  agreementId: string;
  beforeHash: string;
  acceptedProposalHash: string;
  afterHash: string;
  selectedDisplaySource: string | null;
  selectedDisplayHash: string | null;
  snapshotHashBefore: string | null;
  snapshotHashAfter: string | null;
  purposeHash: string | null;
  documentTextHash: string | null;
  signingHandoffHash: string | null;
  containsOldText: boolean;
  containsAcceptedText: boolean;
  oldTextMarker?: string;
  acceptedTextMarker?: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastTest321AcceptedReviewPromotionLogKey) return;
  lastTest321AcceptedReviewPromotionLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[test321-accepted-review-promotion]", {
    agreementId: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    beforeHash: payload.beforeHash,
    acceptedProposalHash: payload.acceptedProposalHash,
    afterHash: payload.afterHash,
    selectedDisplaySource: payload.selectedDisplaySource,
    selectedDisplayHash: payload.selectedDisplayHash,
    snapshotHashBefore: payload.snapshotHashBefore,
    snapshotHashAfter: payload.snapshotHashAfter,
    purposeHash: payload.purposeHash,
    documentTextHash: payload.documentTextHash,
    signingHandoffHash: payload.signingHandoffHash,
    containsOldText: payload.containsOldText,
    containsAcceptedText: payload.containsAcceptedText,
    oldTextMarker: payload.oldTextMarker ?? null,
    acceptedTextMarker: payload.acceptedTextMarker ?? null,
  });
}

export function logAcceptedReviewCorpusPromotion(payload: {
  agreementId: string;
  beforeAcceptHash: string;
  acceptedProposalHash: string;
  afterAcceptHash: string;
  reviewSnapshotHash: string | null;
  reviewerHydrationHash?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastAcceptedReviewCorpusPromotionLogKey) return;
  lastAcceptedReviewCorpusPromotionLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[accepted-review-corpus-promotion]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    beforeAcceptHash: payload.beforeAcceptHash,
    acceptedProposalHash: payload.acceptedProposalHash,
    afterAcceptHash: payload.afterAcceptHash,
    reviewSnapshotHash: payload.reviewSnapshotHash,
    reviewerHydrationHash: payload.reviewerHydrationHash ?? null,
  });
}

/**
 * Atomically promote accepted reviewer proposal corpus into every post-review authority store:
 * session pin, signing snapshot (+ signer metadata sync), and pinned signer-applied corpus.
 */
export function commitAcceptedReviewCorpusPromotion(args: {
  agreementId: string;
  corpusText: string;
  draft?: AgreementDraft | null;
  source?: ReviewFirstDisplayCorpusSource | string;
  surface?: ReviewCorpusAuthoritySurface;
  beforeAcceptHash?: string;
  oldTextMarker?: string;
  acceptedTextMarker?: string;
}): AcceptedReviewCorpusPromotionResult {
  const id = args.agreementId.trim();
  const text = args.corpusText.trim();
  const acceptedProposalHash = corpusHash(text);
  const snapshotBefore = getAuthoritativeSigningSnapshot();
  const snapshotHashBefore = snapshotBefore?.hash ?? null;
  const beforeAcceptHash =
    args.beforeAcceptHash?.trim() ||
    snapshotHashBefore ||
    acceptedProposalHash;

  const emptyResult = (): AcceptedReviewCorpusPromotionResult => ({
    beforeAcceptHash,
    acceptedProposalHash,
    afterAcceptHash: beforeAcceptHash,
    reviewSnapshotHash: snapshotHashBefore,
    selectedDisplaySource: null,
    selectedDisplayHash: null,
    signingHandoffHash: snapshotHashBefore,
  });

  if (!id || !text) return emptyResult();

  syncAuthoritativeSigningSnapshotMetadataFromCorpus(text);
  writeReviewFirstPinnedCorpus(id, text);

  let afterAcceptHash = acceptedProposalHash;
  let reviewSnapshotHash: string | null = snapshotHashBefore;

  if (isPaidProPostFinalizeHydratedCorpusLocked() && hasAuthoritativeSigningSnapshot()) {
    const saved = commitPaidProPostFinalizeClauseEditRevision({ editedPlain: text });
    if (saved.ok) {
      afterAcceptHash = saved.corpusHash;
      reviewSnapshotHash = saved.corpusHash;
    } else {
      const replaced = replaceAuthoritativeSigningSnapshotCorpus({
        corpus: text,
        surface: "accepted_recipient_proposal",
      });
      if (replaced) {
        afterAcceptHash = replaced.hash;
        reviewSnapshotHash = replaced.hash;
      }
    }
  }

  const signingHandoffPlain = resolvePaidProPostFinalizeReviewPlain(args.draft ?? null).trim();
  const signingHandoffHash =
    signingHandoffPlain.length >= 80 ? hashPaidProCorpus(signingHandoffPlain) : reviewSnapshotHash;

  const display = args.draft ? resolveReviewFirstDisplayCorpus(args.draft, "reviewer") : null;
  const purposeHash = args.draft?.purpose ? corpusHash(String(args.draft.purpose)) : null;
  const documentTextHash = args.draft?.document_text
    ? corpusHash(String(args.draft.document_text))
    : null;

  const oldMarker = args.oldTextMarker?.trim() ?? "";
  const acceptedMarker = args.acceptedTextMarker?.trim() ?? "";
  const displayText = display?.text ?? signingHandoffPlain;
  const containsOldText = oldMarker.length > 0 && displayText.includes(oldMarker);
  const containsAcceptedText = acceptedMarker.length > 0 && displayText.includes(acceptedMarker);

  logReviewCorpusAuthority({
    agreementId: id,
    source: args.source ?? "review_first_final_corpus",
    corpusHash: afterAcceptHash,
    surface: args.surface ?? "proposal_accept",
  });

  logAcceptedReviewCorpusPromotion({
    agreementId: id,
    beforeAcceptHash,
    acceptedProposalHash,
    afterAcceptHash,
    reviewSnapshotHash,
    reviewerHydrationHash: display?.hash ?? null,
  });

  logTest321AcceptedReviewPromotion({
    agreementId: id,
    beforeHash: beforeAcceptHash,
    acceptedProposalHash,
    afterHash: afterAcceptHash,
    selectedDisplaySource: display?.source ?? null,
    selectedDisplayHash: display?.hash ?? null,
    snapshotHashBefore,
    snapshotHashAfter: reviewSnapshotHash,
    purposeHash,
    documentTextHash,
    signingHandoffHash,
    containsOldText,
    containsAcceptedText,
    oldTextMarker: oldMarker || undefined,
    acceptedTextMarker: acceptedMarker || undefined,
  });

  return {
    beforeAcceptHash,
    acceptedProposalHash,
    afterAcceptHash,
    reviewSnapshotHash,
    selectedDisplaySource: display?.source ?? null,
    selectedDisplayHash: display?.hash ?? null,
    signingHandoffHash,
  };
}

/** Pin accepted corpus so all review surfaces share one authority after proposal apply. */
export function promoteAcceptedReviewCorpus(args: {
  agreementId: string;
  corpusText: string;
  source: ReviewFirstDisplayCorpusSource | string;
  surface?: ReviewCorpusAuthoritySurface;
  beforeAcceptHash?: string;
  draft?: AgreementDraft | null;
  oldTextMarker?: string;
  acceptedTextMarker?: string;
}): AcceptedReviewCorpusPromotionResult {
  return commitAcceptedReviewCorpusPromotion(args);
}

export function acceptedProposalCorpusText(proposalDraft: Record<string, unknown> | undefined): string {
  if (!proposalDraft) return "";
  const purpose = String(proposalDraft.purpose ?? "").trim();
  if (purpose.length >= 120) return purpose;
  const payment = String(proposalDraft.payment_terms ?? "").trim();
  return [purpose, payment].filter(Boolean).join("\n\n").trim();
}
