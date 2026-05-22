/**
 * Keep guided authoritative apply and paid Pro review render surfaces aligned.
 */

import type { ParsedDraftShape } from "../intakeSmartDefaults";
import { PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE } from "../premiumRefineAcceptance";

export type GuidedAuthoritativeReviewSyncInput = {
  authoritativePlain: string;
  renderedPreviewPlain?: string;
  reviewDraft?: ParsedDraftShape | null;
  pickerPlain?: string;
};

export type GuidedAuthoritativeReviewSyncResult = {
  synced: boolean;
  authoritativeLen: number;
  renderedLen: number;
  reviewDraftLen: number;
  pickerLen: number;
  driftPct: number;
};

export function reviewDraftAuthoritativeLen(draft: ParsedDraftShape | null | undefined): number {
  if (!draft) return 0;
  const full = (draft.premium_full_document_text || draft.premium_server_full_document_text || "").trim();
  return full.length;
}

export function assessGuidedAuthoritativeReviewSync(
  input: GuidedAuthoritativeReviewSyncInput,
): GuidedAuthoritativeReviewSyncResult {
  const authoritativeLen = input.authoritativePlain.trim().length;
  const renderedLen = (input.renderedPreviewPlain || "").trim().length;
  const reviewDraftLen = reviewDraftAuthoritativeLen(input.reviewDraft);
  const pickerLen = (input.pickerPlain || "").trim().length;
  const compareLen = Math.max(renderedLen, reviewDraftLen, pickerLen);
  const base = Math.max(authoritativeLen, 1);
  const driftPct =
    compareLen > 0 ? Math.abs(authoritativeLen - compareLen) / base : authoritativeLen > 0 ? 1 : 0;
  const synced = authoritativeLen >= 500 && driftPct <= 0.05;
  return {
    synced,
    authoritativeLen,
    renderedLen,
    reviewDraftLen,
    pickerLen,
    driftPct: Number(driftPct.toFixed(4)),
  };
}

export function logGuidedAuthoritativeReviewSync(
  input: GuidedAuthoritativeReviewSyncInput,
): GuidedAuthoritativeReviewSyncResult {
  const result = assessGuidedAuthoritativeReviewSync(input);
  // eslint-disable-next-line no-console
  console.info("[guided-authoritative-review-sync]", {
    authoritativeLen: result.authoritativeLen,
    renderedLen: result.renderedLen,
    reviewDraftLen: result.reviewDraftLen,
    pickerLen: result.pickerLen,
    synced: result.synced,
    driftPct: result.driftPct,
  });
  if (!result.synced && result.authoritativeLen >= 500) {
    // eslint-disable-next-line no-console
    console.warn("[guided-authoritative-review-sync-mismatch]", result);
  }
  return result;
}

/** Draft fields + pipeline markers so picker/preview prefer the same corpus. */
export function buildAuthoritativeReviewDraftPatch(
  plain: string,
): Pick<
  ParsedDraftShape,
  "premium_full_document_text" | "premium_server_full_document_text"
> {
  const t = plain.trim();
  return {
    premium_full_document_text: t,
    premium_server_full_document_text: t,
  };
}

export function authoritativePipelineRenderSource(): string {
  return PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE;
}

export type GuidedBulkCommitResolveArgs = {
  applyDecision: string;
  currentProLen: number;
  candidatePlain: string;
  finalTextPlain: string;
};

/** Prefer API candidate when accepted refine finalText is suspiciously stale vs candidate. */
export function resolveGuidedBulkCommitBody(args: GuidedBulkCommitResolveArgs): string {
  const candidate = (args.candidatePlain || "").trim();
  const final = (args.finalTextPlain || "").trim();
  const accepted = /accepted/i.test(args.applyDecision);
  const materialGrowth = candidate.length > args.currentProLen * 1.05;
  const staleFinal =
    accepted && materialGrowth && final.length > 0 && final.length < candidate.length * 0.9;
  if (staleFinal && candidate.length >= 500) {
    // eslint-disable-next-line no-console
    console.warn("[guided-authoritative-commit-mismatch]", {
      currentLen: args.currentProLen,
      candidateLen: candidate.length,
      committedLen: final.length,
      applyDecision: args.applyDecision,
      using: "candidate",
    });
    return candidate;
  }
  if (final.length >= 500) return final;
  return candidate.length >= 500 ? candidate : final;
}

export function logGuidedBulkCommitSuccess(args: {
  currentProLen: number;
  candidateLen: number;
  committedLen: number;
}): void {
  // eslint-disable-next-line no-console
  console.info("[guided-bulk-commit-success]", {
    currentLen: args.currentProLen,
    candidateLen: args.candidateLen,
    committedLen: args.committedLen,
    synced: args.committedLen >= args.candidateLen * 0.9 || args.committedLen > args.currentProLen * 1.02,
  });
}
