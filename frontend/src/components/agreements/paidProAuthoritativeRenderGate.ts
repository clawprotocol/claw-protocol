/**
 * Paid Pro first-review render gate — after SoT acceptance, visible review must show the accepted
 * corpus only (display-only strip), not starter preview, integrity repair, or signature rebuilds.
 */

import { hasAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN,
  readPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import {
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProFrozenDisplayPlain } from "./paidProPostFreezeCorpusInvariant";
import type { ResolvePaidProReviewRenderPartiesArgs } from "./paidProReviewRenderParties";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { applyPaidProSoTSignerExecutionOverlay } from "./paidProSoTSignerExecutionOverlay";
import { applyFrozenManifestPaidProDisplayAuthority } from "./paidProFrozenManifestDisplayAuthority";
import { preparePaidProReviewDisplayPlain, preparePaidProFrozenDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { shouldApplyExecutionBlockSignerOverlay } from "./paidProSignerMetadataCommitPolicy";
import { isPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";

export type ResolvePaidProAuthoritativeDisplayPlainArgs = ResolvePaidProReviewRenderPartiesArgs;

/** True when review should show frozen SoT only (no signer hydration / sanitizer recompute). */
export function shouldUsePaidProSourceOfTruthDisplayOnly(): boolean {
  if (!hasPaidProSourceOfTruth()) return false;
  if (getPaidProSourceOfTruthText().trim().length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  if (hasAuthoritativeSigningSnapshot()) return false;
  if (readPaidProPinnedSignerAppliedCorpus().trim().length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return false;
  }
  return true;
}

/** Frozen SoT plain — byte-aligned with canonical freeze; applies render-time signer overlay when staged. */
export function resolvePaidProAuthoritativeDisplayPlain(
  args?: ResolvePaidProAuthoritativeDisplayPlainArgs,
): string {
  const displayOnly = shouldUsePaidProSourceOfTruthDisplayOnly();
  const prepared = displayOnly
    ? preparePaidProFrozenDisplayPlain(resolvePaidProFrozenDisplayPlain(), {
        intakeText: args?.intakeText ?? null,
        draftPartyNames:
          args?.draft?.parties?.map((p) => String((p as { name?: string }).name ?? "").trim()) ?? null,
      }).text
    : preparePaidProReviewDisplayPlain(resolvePaidProFrozenDisplayPlain()).text;
  const base = displayOnly
    ? prepared
    : applyFrozenManifestPaidProDisplayAuthority(prepared, {
        intakeText: args?.intakeText ?? null,
        draft: args?.draft ?? null,
      }).text;
  const parties = resolvePartiesForReviewRender(args);
  const needsOverlay =
    isPaidProReviewSignerMetadataSessionActive() ||
    shouldApplyExecutionBlockSignerOverlay({
      parties,
      intakeText: args?.intakeText ?? null,
    });
  if (!needsOverlay || parties.length < 2) return base;
  const roleContext = {
    intakeText: args?.intakeText ?? null,
    draftPartyNames:
      args?.draft?.parties?.map((p) => String((p as { name?: string }).name ?? "").trim()) ?? null,
    acceptedCorpus: base,
  };
  return applyPaidProSoTSignerExecutionOverlay(base, parties, roleContext);
}

export function paidProAuthoritativeRenderGateMeta(): { len: number; hash: string } | null {
  if (!shouldUsePaidProSourceOfTruthDisplayOnly()) return null;
  const text = getPaidProSourceOfTruthText().trim();
  return { len: text.length, hash: hashPaidProCorpus(text) };
}

/** Block integrity/compiler/signature repair and starter preview replacement after acceptance. */
export function shouldBlockPaidProStructuralMutationAfterAcceptance(_surface?: string | null): boolean {
  return shouldUsePaidProSourceOfTruthDisplayOnly();
}

export function paidProSourceOfTruthAcceptedAndValid(): boolean {
  const record = getPaidProSourceOfTruth();
  return Boolean(record && record.text.trim().length >= PAID_PRO_AUTHORITY_MIN_LEN);
}

/** Strip embedded corpus signature from readonly HTML when external signer setup owns execution. */
export function shouldSuppressCorpusEmbeddedSignatureForProReview(args: {
  paidProAuthoritative: boolean;
  paidProRecipientSetupOnDraft?: boolean;
  guidedInlineSignerSetupActive?: boolean;
  paidProInlineSignerSetupLatched?: boolean;
  paidProSignerMetadataSessionActive?: boolean;
  paidProPostSignerMetadataFreezeActive?: boolean;
}): boolean {
  if (hasAuthoritativeSigningSnapshot()) return false;
  if (!args.paidProAuthoritative) return false;
  if (args.paidProPostSignerMetadataFreezeActive) return false;
  return Boolean(
    args.paidProRecipientSetupOnDraft ||
      args.guidedInlineSignerSetupActive ||
      args.paidProInlineSignerSetupLatched ||
      args.paidProSignerMetadataSessionActive,
  );
}
