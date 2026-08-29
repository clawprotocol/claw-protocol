/**
 * Corpus + gate args for paid Pro prepare-signature bridge (post-review dashboard handoff).
 */

import type { AgreementDraft } from "../agreement/agreementTypes";
import { getAuthoritativeSigningSnapshot } from "../components/agreements/authoritativeSigningSnapshot";
import { resolveGuidedVs01SigningHandoffForBridge } from "../components/agreements/guidedDealCompletion/guidedVs01SigningHandoffSession";
import {
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "../components/agreements/paidProSourceOfTruth";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { resolveBridgeAgreementCorpusFromDraft } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { peekReviewFirstPinnedCorpus } from "../launch/simpleProduct/reviewFirstSendSurface";
import { readVerifiedCommercialDisplayCorpus } from "../agreement/canonicalReviewSnapshotApi";
import {
  pickCurrentReviewSotForSigningSeed,
  readAcceptedReviewCorpusFromDraftLike,
} from "./vs01CurrentReviewSotForSeed";
import {
  resolveFinalVs01CorpusOrBlock,
  VS01_SIGNING_CORPUS_MIN_LEN,
  type ResolveFinalVs01CorpusOrBlockArgs,
} from "./vs01SigningCorpus";
import { pickAuthoritativePrepareHandoffCorpus } from "./vs01ReviewCorpusSeedRefresh";

/** Resolve signing corpus after review approval when bridge session may omit agreementCorpusText. */
export function resolveAgreementCorpusForPrepareHandoff(args: {
  agreementId: string;
  draft: AgreementDraft | null;
  bridgeCorpusText?: string | null;
}): string {
  // Accepted Review snapshot wins over older premium/server draft fields and stale client cache.
  const accepted = readAcceptedReviewCorpusFromDraftLike(args.draft);
  const verified = (readVerifiedCommercialDisplayCorpus(args.agreementId)?.corpusPlain ?? "").trim();
  const sot = hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText().trim() : "";
  const fromBridge = (args.bridgeCorpusText ?? "").trim();
  const handoff = resolveGuidedVs01SigningHandoffForBridge(undefined);
  const fromHandoff = (handoff?.corpusText ?? "").trim();
  const fromSnapshot = (getAuthoritativeSigningSnapshot()?.corpus ?? "").trim();
  const fromPinned = (peekReviewFirstPinnedCorpus(args.agreementId) ?? "").trim();
  const fromDraft = resolveBridgeAgreementCorpusFromDraft(args.draft);
  const certified = pickCurrentReviewSotForSigningSeed([accepted, verified]);
  if (certified) return certified;
  const picked = pickAuthoritativePrepareHandoffCorpus([
    sot,
    fromBridge,
    fromHandoff,
    fromSnapshot,
    fromPinned,
    fromDraft,
  ]);
  if (picked) return picked;
  if (sot.length >= VS01_SIGNING_CORPUS_MIN_LEN) return sot;
  return pickCurrentReviewSotForSigningSeed([fromDraft]) || fromDraft;
}

export function buildPrepareBridgeCorpusGateArgs(args: {
  agreementCorpusText: string;
  bridge?: AgreementVs01BridgeSession | null;
  draft?: AgreementDraft | null;
}): Omit<ResolveFinalVs01CorpusOrBlockArgs, "agreementCorpusText" | "guidedPro"> {
  const corpus = (args.agreementCorpusText ?? "").trim();
  const handoff = resolveGuidedVs01SigningHandoffForBridge(undefined);
  return {
    bridge: args.bridge ?? null,
    draft: args.draft ?? null,
    guidedSigningHandoff: handoff,
    prepareSignatureLinksRequested: true,
    signaturePreparationRequested: true,
    premiumComplete: corpus.length >= VS01_SIGNING_CORPUS_MIN_LEN,
    signatureRebuilt: handoff?.signatureRebuilt,
  };
}

export function resolvePrepareBridgeSigningCorpus(args: {
  agreementId: string;
  draft: AgreementDraft | null;
  bridge?: AgreementVs01BridgeSession | null;
}): ReturnType<typeof resolveFinalVs01CorpusOrBlock> {
  const agreementCorpusText = resolveAgreementCorpusForPrepareHandoff({
    agreementId: args.agreementId,
    draft: args.draft,
    bridgeCorpusText: args.bridge?.agreementCorpusText,
  });
  return resolveFinalVs01CorpusOrBlock({
    agreementCorpusText,
    guidedPro: true,
    ...buildPrepareBridgeCorpusGateArgs({
      agreementCorpusText,
      bridge: args.bridge,
      draft: args.draft,
    }),
  });
}
