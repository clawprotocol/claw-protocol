/**
 * Preserve accepted paid Pro full-draft corpus through hydrate, snapshot, and repair passes.
 * Never replace a long accepted `server_full_draft` with a materially shorter canonical/display fallback.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  establishAcceptedPremiumCanonicalCorpus,
  getAcceptedPremiumCanonicalText,
  getAcceptedPremiumDisplayText,
} from "./acceptedPremiumCanonicalCorpus";
import { guardPaidProAcceptedServerFullDraftCommit } from "./paidProAcceptedServerFullDraftCommitGuard";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

export const AUTHORITATIVE_BODY_PRESERVE_MIN_WINNING_LEN = 1500;
export const AUTHORITATIVE_BODY_PRESERVE_DOWNGRADE_RATIO = 0.8;

export type CoalesceAuthoritativePremiumBodyArgs = {
  preservedBody: string;
  candidateBody: string;
  preservedSource: string;
  candidateSource: string;
  /** When true, allow candidate even if materially shorter than preserved. */
  allowValidatedRepairSuccess?: boolean;
};

export type CoalesceAuthoritativePremiumBodyResult = {
  text: string;
  preserved: boolean;
  downgradePrevented: boolean;
  reason?: string;
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function wouldMateriallyShrinkAuthoritativeBody(
  preservedLen: number,
  candidateLen: number,
  opts?: { minPreservedLen?: number; ratio?: number },
): boolean {
  const minPreserved = opts?.minPreservedLen ?? AUTHORITATIVE_BODY_PRESERVE_MIN_WINNING_LEN;
  const ratio = opts?.ratio ?? AUTHORITATIVE_BODY_PRESERVE_DOWNGRADE_RATIO;
  if (preservedLen < minPreserved) return false;
  if (candidateLen >= preservedLen * ratio) return false;
  return true;
}

export function logAuthoritativeBodyDowngradePrevented(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[downgrade prevention]", payload);
}

export function coalesceAuthoritativePremiumBody(
  args: CoalesceAuthoritativePremiumBodyArgs,
): CoalesceAuthoritativePremiumBodyResult {
  const preserved = trim(args.preservedBody);
  const candidate = trim(args.candidateBody);
  if (!preserved) {
    return { text: candidate, preserved: false, downgradePrevented: false };
  }
  if (!candidate || candidate === preserved) {
    return { text: preserved, preserved: true, downgradePrevented: false };
  }
  if (args.allowValidatedRepairSuccess) {
    return { text: candidate, preserved: false, downgradePrevented: false, reason: "validated_repair_success" };
  }
  if (
    wouldMateriallyShrinkAuthoritativeBody(preserved.length, candidate.length) &&
    candidate.length < preserved.length
  ) {
    logAuthoritativeBodyDowngradePrevented({
      oldLen: preserved.length,
      newLen: candidate.length,
      source: args.candidateSource,
      preservedSource: args.preservedSource,
      reason: "material_shrink_blocked",
    });
    return {
      text: preserved,
      preserved: true,
      downgradePrevented: true,
      reason: "material_shrink_blocked",
    };
  }
  if (candidate.length >= preserved.length) {
    return { text: candidate, preserved: false, downgradePrevented: false, reason: "candidate_longer_or_equal" };
  }
  return { text: candidate, preserved: false, downgradePrevented: false };
}

/** @deprecated Use establishAcceptedPremiumCanonicalCorpus — no canonicalizer/display rewrite. */
export function polishAcceptedPremiumAuthoritativeBody(
  raw: string,
  opts?: { draft?: ParsedDraftShape | null; intakeText?: string | null },
): string {
  const established = getAcceptedPremiumCanonicalText();
  if (established.length >= 500) return established;
  const record = establishAcceptedPremiumCanonicalCorpus({
    rawAcceptedBody: raw,
    draft: opts?.draft ?? null,
    intakeText: opts?.intakeText ?? null,
    pipelineSource: "server_full_draft",
  });
  return record.text;
}

export function resolveAuthoritativePremiumSnapshotPlain(args: {
  winningBody: string;
  resolvedText: string;
  pipelineSource: string;
  resolvedSource: string;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  allowValidatedRepairSuccess?: boolean;
}): CoalesceAuthoritativePremiumBodyResult & { text: string } {
  let winning = trim(args.winningBody);
  const resolved = trim(args.resolvedText);
  if (!isAuthoritativePremiumPipelineRenderSource(args.pipelineSource) || winning.length < 500) {
    return { text: resolved, preserved: false, downgradePrevented: false };
  }
  winning = guardPaidProAcceptedServerFullDraftCommit({
    candidateText: winning,
    candidateSource: args.pipelineSource,
    renderSource: args.pipelineSource,
    generationOutcome: "ok",
    reason: "resolve_authoritative_premium_snapshot_winning",
  }).text;

  const attemptedDowngrade = wouldMateriallyShrinkAuthoritativeBody(winning.length, resolved.length);

  const established = establishAcceptedPremiumCanonicalCorpus({
    rawAcceptedBody: winning,
    intakeText: args.intakeText,
    draft: args.draft ?? null,
    pipelineSource: args.pipelineSource,
  });

  if (
    args.allowValidatedRepairSuccess &&
    resolved.length > established.text.length &&
    resolved.length >= winning.length
  ) {
    const upgraded = establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: resolved,
      intakeText: args.intakeText,
      draft: args.draft ?? null,
      pipelineSource: args.pipelineSource,
    });
    return {
      text: upgraded.text,
      preserved: false,
      downgradePrevented: false,
      reason: "validated_repair_success",
    };
  }

  const coalesced = coalesceAuthoritativePremiumBody({
    preservedBody: established.text,
    candidateBody: resolved,
    preservedSource: args.pipelineSource,
    candidateSource: args.resolvedSource,
    allowValidatedRepairSuccess: false,
  });

  const snapshotText = guardPaidProAcceptedServerFullDraftCommit({
    candidateText: established.text,
    candidateSource: args.pipelineSource,
    renderSource: args.pipelineSource,
    generationOutcome: "ok",
    reason: "resolve_authoritative_premium_snapshot_established",
  }).text;

  return {
    text: snapshotText,
    preserved: true,
    downgradePrevented: attemptedDowngrade || coalesced.downgradePrevented,
    reason: coalesced.downgradePrevented ? "accepted_canonical_preserved" : "accepted_canonical_established",
  };
}

/** True when failed finalization should not block signing on an already-accepted long Pro draft. */
export function acceptedProDraftSafeDespiteFinalizationFailure(args: {
  firstDraftLen: number;
  premiumAccepted?: boolean;
  pipelineSource?: string | null;
}): boolean {
  if (!args.premiumAccepted) return false;
  if (!isAuthoritativePremiumPipelineRenderSource(args.pipelineSource)) return false;
  return args.firstDraftLen >= AUTHORITATIVE_BODY_PRESERVE_MIN_WINNING_LEN;
}

export { getAcceptedPremiumDisplayText };
