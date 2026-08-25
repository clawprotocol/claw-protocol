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
import {
  PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN,
  shouldRelaxPaidSessionWorkspaceCorpus,
} from "../components/agreements/paidProPaidSessionLanding";
import {
  resolveFinalVs01CorpusOrBlock,
  VS01_SIGNING_CORPUS_MIN_LEN,
  type ResolveFinalVs01CorpusOrBlockArgs,
} from "./vs01SigningCorpus";

/** Resolve signing corpus after review approval when bridge session may omit agreementCorpusText. */
export function resolveAgreementCorpusForPrepareHandoff(args: {
  agreementId: string;
  draft: AgreementDraft | null;
  bridgeCorpusText?: string | null;
  bridge?: AgreementVs01BridgeSession | null;
}): string {
  const fromBridge = (args.bridgeCorpusText ?? args.bridge?.agreementCorpusText ?? "").trim();
  // After-pay painted deal: keep this body. Do not revive leftover 1500-char SoT.
  if (
    shouldRelaxPaidSessionWorkspaceCorpus({
      bridge: args.bridge,
      corpusText: fromBridge,
    })
  ) {
    return fromBridge;
  }

  // Accepted SoT wins when present — VS01 must not invent a second freeze or prefer a divergent bridge body.
  if (hasPaidProSourceOfTruth()) {
    const sot = getPaidProSourceOfTruthText().trim();
    if (sot.length >= VS01_SIGNING_CORPUS_MIN_LEN) return sot;
  }

  if (fromBridge.length >= VS01_SIGNING_CORPUS_MIN_LEN) return fromBridge;

  const handoff = resolveGuidedVs01SigningHandoffForBridge(undefined);
  const fromHandoff = (handoff?.corpusText ?? "").trim();
  if (fromHandoff.length >= VS01_SIGNING_CORPUS_MIN_LEN) return fromHandoff;

  const fromSnapshot = (getAuthoritativeSigningSnapshot()?.corpus ?? "").trim();
  if (fromSnapshot.length >= VS01_SIGNING_CORPUS_MIN_LEN) return fromSnapshot;

  const fromPinned = (peekReviewFirstPinnedCorpus(args.agreementId) ?? "").trim();
  if (fromPinned.length >= VS01_SIGNING_CORPUS_MIN_LEN) return fromPinned;

  return resolveBridgeAgreementCorpusFromDraft(args.draft);
}

export function buildPrepareBridgeCorpusGateArgs(args: {
  agreementCorpusText: string;
  bridge?: AgreementVs01BridgeSession | null;
  draft?: AgreementDraft | null;
}): Omit<ResolveFinalVs01CorpusOrBlockArgs, "agreementCorpusText" | "guidedPro"> {
  const corpus = (args.agreementCorpusText ?? "").trim();
  const handoff = resolveGuidedVs01SigningHandoffForBridge(undefined);
  const relaxPaidSessionCorpusAssert = shouldRelaxPaidSessionWorkspaceCorpus({
    bridge: args.bridge,
    corpusText: corpus,
  });
  return {
    bridge: args.bridge ?? null,
    draft: args.draft ?? null,
    guidedSigningHandoff: handoff,
    prepareSignatureLinksRequested: true,
    signaturePreparationRequested: true,
    premiumComplete:
      corpus.length >=
      (relaxPaidSessionCorpusAssert
        ? PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN
        : VS01_SIGNING_CORPUS_MIN_LEN),
    signatureRebuilt: handoff?.signatureRebuilt,
    relaxPaidSessionCorpusAssert,
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
    bridge: args.bridge,
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
