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
import { PAID_PRO_REVIEW_DECISION_SCROLL_REASON } from "./paidProSignerFinalizeRouting";
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

describe("paidPro signer finalize → review decision", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("finalize snapshot lands on review_decision without early signing proceed", () => {
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

    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties, []),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
    });

    expect(hasAuthoritativeSigningSnapshot()).toBe(true);
    expect(
      resolvePaidProStickyCtaPhase({
        hasAuthoritativeSigningSnapshot: true,
        signerDetailsComplete: true,
        inlineSignerSetupLatched: false,
        signaturePreparationRequested: false,
        sendSurfaceReady: false,
      }),
    ).toBe("review_decision");

    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(paidProStickyCtaShowsStickyBar(sticky.phase)).toBe(false);
    expect(mapPaidProStickyCtaToPrimaryCta(sticky).reason).toBe(PAID_PRO_REVIEW_DECISION_SCROLL_REASON);

    expect(
      canProceedFromGuidedFinalReviewToSigning({
        paidProAuthoritative: true,
        acceptedPaidProAuthority: true,
        hasAuthoritativeSigningSnapshot: true,
        signaturePreparationRequested: false,
        guidedCompletionPhase: "inactive",
        finalReviewExplicitlyOpened: true,
        createFlowPhase: "draft_ready_for_review",
        authoritativeCorpusLen: hydrated.corpus.length,
        signersComplete: true,
      }),
    ).toBe(false);
  });
});
