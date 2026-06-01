import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  markSigningPreparationRequested,
} from "./authoritativeSigningSnapshot";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  buildCanonicalSignerManifest,
  canProceedFromGuidedFinalReviewToSigning,
} from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  PAID_PRO_REVIEW_DECISION_LEGACY_PREPARE_REASON,
  PAID_PRO_REVIEW_DECISION_SCROLL_REASON,
  PAID_PRO_SIGNER_DETAILS_FINALIZE_REASON,
  paidProSignerFinalizeBlockContainsForbiddenRoutes,
} from "./paidProSignerFinalizeRouting";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import {
  mapPaidProStickyCtaToPrimaryCta,
  paidProStickyCtaShowsStickyBar,
  resolvePaidProStickyCta,
  resolvePaidProStickyCtaPhase,
} from "./paidProStickyCta";

const FIXTURE_CORPUS = readFileSync(
  join(__dirname, "qa/paidProHardening/fixtures/freeProQaTemplateATest204.txt"),
  "utf8",
).trim();

const LIVE_UI = {
  partyCount: 2,
  recipient1Name: "Blue Canyon Analytics LLC",
  recipient2Name: "Iron Vale Systems Inc.",
  recipient1Email: "signer1@example.com",
  recipient2Email: "signer2@example.com",
  extraPartyReviewEmails: [] as string[],
  partySignerNames: ["Anthem H Blanchard", "Anthem H Blanchard"],
  partySignerTitles: ["Member", "Member"],
  partyAddresses: ["123 Main St", ""],
};

function armPaidProSigningSnapshot(): string {
  establishPaidProSourceOfTruth({ text: FIXTURE_CORPUS, source: "server_full_draft" });
  const authority = buildLivePaidProSignerMetadataAuthority(LIVE_UI);
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: getPaidProSourceOfTruthText(),
    authority,
    intakeRaw: "mutual consulting agreement",
    surface: "test216a_snapshot",
    signatureRegionOnly: true,
    repairRecital: false,
  });
  createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties, []),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({
      identities: hydrated.identities,
      signFirst: true,
    }),
  });
  return hydrated.corpus;
}

describe("paidPro Test216A routing", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("signer_details_complete finalize CTA does not map to VS01 prepare reason", () => {
    const state = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    const mapped = mapPaidProStickyCtaToPrimaryCta(state);
    expect(mapped.reason).toBe(PAID_PRO_SIGNER_DETAILS_FINALIZE_REASON);
    expect(mapped.reason).not.toBe(PAID_PRO_REVIEW_DECISION_LEGACY_PREPARE_REASON);
  });

  it("after snapshot, review_decision hides sticky and uses scroll-to-choices reason (not VS01)", () => {
    armPaidProSigningSnapshot();
    expect(resolvePaidProStickyCtaPhase({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    })).toBe("review_decision");

    const state = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(paidProStickyCtaShowsStickyBar(state.phase)).toBe(false);
    expect(state.reason).toBe(PAID_PRO_REVIEW_DECISION_SCROLL_REASON);
    expect(state.reason).not.toBe(PAID_PRO_REVIEW_DECISION_LEGACY_PREPARE_REASON);
  });

  it("cannot proceed to signing until Prepare signature links is explicitly requested", () => {
    const corpusLen = armPaidProSigningSnapshot().length;
    expect(
      canProceedFromGuidedFinalReviewToSigning({
        paidProAuthoritative: true,
        acceptedPaidProAuthority: true,
        hasAuthoritativeSigningSnapshot: true,
        signaturePreparationRequested: false,
        guidedCompletionPhase: "inactive",
        finalReviewExplicitlyOpened: true,
        createFlowPhase: "draft_ready_for_review",
        authoritativeCorpusLen: corpusLen,
        signersComplete: true,
      }),
    ).toBe(false);

    markSigningPreparationRequested();
    expect(
      canProceedFromGuidedFinalReviewToSigning({
        paidProAuthoritative: true,
        acceptedPaidProAuthority: true,
        hasAuthoritativeSigningSnapshot: true,
        signaturePreparationRequested: true,
        guidedCompletionPhase: "inactive",
        finalReviewExplicitlyOpened: true,
        createFlowPhase: "draft_ready_for_review",
        authoritativeCorpusLen: corpusLen,
        signersComplete: true,
      }),
    ).toBe(true);
  });

  describe("AgreementBuilderIntake guards", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

    it("finalize block never calls VS01/signing bridge handlers", () => {
      expect(paidProSignerFinalizeBlockContainsForbiddenRoutes(intake)).toEqual([]);
    });

    it("green finalize routes to finalizePaidProSignerMetadata only, not handleProSendForSignature", () => {
      expect(intake).toMatch(
        /paid_pro_signer_details_complete[\s\S]{0,500}finalizePaidProSignerMetadataAndOpenReviewDecision\(\)/,
      );
      expect(intake).not.toMatch(
        /paid_pro_signer_details_complete[\s\S]{0,500}handleProSendForSignature\(\)/,
      );
      expect(intake).not.toMatch(
        /paid_pro_signer_details_complete[\s\S]{0,500}continueGuidedFinalReviewToSigning\(\{ intent: "signature" \}\)/,
      );
    });

    it("review_decision scroll reason does not call handleProSendForSignature", () => {
      expect(intake).toContain("isPaidProReviewDecisionScrollReason");
      expect(intake).toMatch(
        /isPaidProReviewDecisionScrollReason[\s\S]{0,120}scrollPaidProReviewDecisionIntoView/,
      );
      expect(intake).not.toMatch(
        /paid_pro_review_decision_prepare_signing[\s\S]{0,200}handleProSendForSignature/,
      );
    });

    it("inline signer panel hides duplicate green send when canonical sticky is visible", () => {
      expect(intake).toMatch(
        /paidProCanonicalReviewSignerSetupActive[\s\S]{0,1200}hidePrimarySendCta=\{Boolean\(\s*paidProCanonicalStickyCta\?\.showStickyBar/,
      );
    });

    it("handleProSendForSignature arms preparation before guided signing track", () => {
      const start = intake.indexOf("const handleProSendForSignature = React.useCallback");
      const block = intake.slice(start, start + 2200);
      expect(block).toContain("hasAuthoritativeSigningSnapshot()");
      expect(block).toContain("markSigningPreparationRequested()");
      expect(block).toContain("enterGuidedSignatureTrackRoute");
      expect(block).toContain("markSigningPreparationRequested()");
    });
  });
});
