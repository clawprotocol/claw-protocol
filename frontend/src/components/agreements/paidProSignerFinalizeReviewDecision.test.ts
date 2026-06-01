import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  hasAuthoritativeSigningSnapshot,
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
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import {
  mapPaidProStickyCtaToPrimaryCta,
  resolvePaidProStickyCta,
  resolvePaidProStickyCtaPhase,
} from "./paidProStickyCta";
import { PAID_PRO_PREPARE_ESIGN_DECISION_CTA } from "./signerSetupPartyIdentity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";

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

describe("paidPro signer finalize → review decision (Test216)", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("finalize snapshot enables review_decision sticky Prepare for signing", () => {
    establishPaidProSourceOfTruth({ text: FIXTURE_CORPUS, source: "server_full_draft" });
    const authority = buildLivePaidProSignerMetadataAuthority(LIVE_UI);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: getPaidProSourceOfTruthText(),
      authority,
      intakeRaw: "mutual consulting agreement",
      surface: "test_finalize_review_decision",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.corpus.length).toBeGreaterThan(1500);
    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);

    const partyManifest = buildCanonicalFinalPartyManifestFromAuthority(authority);
    const signatureBlockModel = buildCanonicalSignerManifest({
      identities: hydrated.identities,
      signFirst: true,
    });
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties, []),
      partyManifest,
      signatureBlockModel,
    });

    expect(hasAuthoritativeSigningSnapshot()).toBe(true);
    expect(resolvePaidProStickyCtaPhase({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    })).toBe("review_decision");

    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    const mapped = mapPaidProStickyCtaToPrimaryCta(sticky);
    expect(mapped.label).toBe(PAID_PRO_PREPARE_ESIGN_DECISION_CTA);
    expect(mapped.disabled).toBe(false);
    expect(mapped.reason).toBe("paid_pro_review_decision_prepare_signing");
  });

  it("can proceed to signing prep with snapshot without guided apply phase", () => {
    establishPaidProSourceOfTruth({ text: FIXTURE_CORPUS, source: "server_full_draft" });
    const authority = buildLivePaidProSignerMetadataAuthority(LIVE_UI);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FIXTURE_CORPUS,
      authority,
      intakeRaw: "",
      surface: "test_can_proceed_snapshot",
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

    expect(
      canProceedFromGuidedFinalReviewToSigning({
        paidProAuthoritative: true,
        acceptedPaidProAuthority: true,
        hasAuthoritativeSigningSnapshot: true,
        guidedCompletionPhase: "inactive",
        finalReviewExplicitlyOpened: true,
        createFlowPhase: "draft_ready_for_review",
        authoritativeCorpusLen: hydrated.corpus.length,
        signersComplete: true,
      }),
    ).toBe(true);
  });

  it("intake wires finalize then prepare-signing without direct esign route on green continue", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toMatch(
      /paid_pro_signer_details_complete[\s\S]{0,500}finalizePaidProSignerMetadataAndOpenReviewDecision\(\)/,
    );
    expect(intake).not.toMatch(
      /paid_pro_signer_details_complete[\s\S]{0,500}continueGuidedFinalReviewToSigning\(\{ intent: "signature" \}\)/,
    );
    expect(intake).toContain("paid_pro_review_decision_prepare_signing");
    expect(intake).toMatch(
      /paid_pro_review_decision_prepare_signing[\s\S]{0,200}handleProSendForSignature\(\)/,
    );
    expect(intake).toContain('getElementById("simple-pro-final-review-actions")');
    const reviewScreen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(reviewScreen).toContain('data-testid="simple-pro-final-review-actions"');
    expect(reviewScreen).toContain('data-testid="simple-pro-send-for-signature"');
  });
});
