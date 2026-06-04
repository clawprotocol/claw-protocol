/**
 * Post-acceptance Paid Pro preview reads — frozen SoT only, no independent builder regeneration.
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { resolvePaidProAuthoritativeDisplayPlain } from "./paidProAuthoritativeRenderGate";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { hasAuthoritativeAgreementDocument } from "./authoritativeAgreementDocument";

export type PostAcceptanceBuilderCallsiteArgs = {
  surface: string;
  builder: string;
  caller?: string;
  createFlowPhase?: string | null;
  displayPhase?: string | null;
  selectedTrack?: string | null;
};

let postAcceptanceBuilderCallsiteLogForceForTests = false;

export function setPostAcceptanceBuilderCallsiteLogForceForTests(on: boolean): void {
  postAcceptanceBuilderCallsiteLogForceForTests = on;
}

function diagnosticsEnabled(): boolean {
  return (
    postAcceptanceBuilderCallsiteLogForceForTests ||
    (typeof import.meta !== "undefined" && import.meta.env?.DEV === true)
  );
}

export function paidProAuthoritativePreviewReadActive(): boolean {
  if (!hasPaidProSourceOfTruth()) return false;
  return getPaidProSourceOfTruthText().trim().length >= PAID_PRO_AUTHORITY_MIN_LEN;
}

export function logPostAcceptanceBuilderCallsite(args: PostAcceptanceBuilderCallsiteArgs): void {
  if (!diagnosticsEnabled()) return;
  const sot = getPaidProSourceOfTruth();
  const frozen = getFrozenCanonicalAgreementCorpus();
  const attempted = resolvePaidProAuthoritativeDisplayPlain();
  // eslint-disable-next-line no-console
  console.info("[post-acceptance-builder-callsite]", {
    surface: args.surface,
    caller: args.caller ?? args.builder,
    builder: args.builder,
    createFlowPhase: args.createFlowPhase ?? null,
    displayPhase: args.displayPhase ?? null,
    selectedTrack: args.selectedTrack ?? null,
    hasPaidProSourceOfTruth: hasPaidProSourceOfTruth(),
    hasCanonicalCorpus: Boolean(frozen?.canonicalText?.trim()),
    hasAuthoritativeAgreementDocument: hasAuthoritativeAgreementDocument(),
    attemptedHash: fingerprintAgreementBody(attempted),
    authoritativeHash: sot?.hash ?? frozen?.hash ?? null,
    attemptedLen: attempted.length,
    authoritativeLen: sot?.text.length ?? frozen?.canonicalText?.length ?? null,
  });
}

/**
 * When Paid Pro SoT is frozen, return authoritative display plain without running starter/core builders.
 * Returns null when independent preview generation is still allowed (pre-acceptance).
 */
export function tryReadPaidProFrozenPreviewPlain(args: PostAcceptanceBuilderCallsiteArgs): string | null {
  if (!paidProAuthoritativePreviewReadActive()) return null;
  logPostAcceptanceBuilderCallsite(args);
  return resolvePaidProAuthoritativeDisplayPlain();
}
