import { describe, expect, it } from "vitest";
import {
  acceptUploadedRevision,
  applyUploadedRevisionCandidate,
  assertGuidedPostFinalReviewTransition,
  buildCanonicalSignerManifest,
  canProceedFromGuidedFinalReviewToSigning,
  createInitialReviewContinuityState,
  markReviewApprovedForSigning,
} from "./guidedReviewSigningContinuity";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";

const LONG_CORPUS = [
  "MASTER SERVICES AGREEMENT",
  "This agreement is made by the parties.",
  "1. Services\nThe provider shall perform the services.",
  "2. Fees\nThe client shall pay all approved fees.",
  "3. Confidentiality\nThe parties shall protect confidential information.",
].join("\n\n").repeat(120);

const IDENTITIES: CanonicalPartyIdentity[] = [
  {
    index: 0,
    partyDisplayName: "Genesis Dogs LLC",
    email: "owner@genesis.test",
    representativeName: "Anthem Blanchard",
    title: "Founder",
    blockHeading: "CLIENT",
    isIndividual: false,
  },
  {
    index: 1,
    partyDisplayName: "Trainer Co LLC",
    email: "trainer@example.test",
    representativeName: "Taylor Trainer",
    title: "Manager",
    blockHeading: "SERVICE PROVIDER",
    isIndividual: false,
  },
];

describe("guidedReviewSigningContinuity", () => {
  it("freezes an accepted corpus and asserts signing can only use that snapshot", () => {
    const manifest = buildCanonicalSignerManifest({ identities: IDENTITIES, signFirst: true });
    const state = createInitialReviewContinuityState(LONG_CORPUS);
    expect(state.latestAcceptedCorpus.length).toBeGreaterThan(8000);
    expect(manifest.entries).toHaveLength(2);

    const assertion = assertGuidedPostFinalReviewTransition({
      action: "signature",
      acceptedCorpus: state.latestAcceptedCorpus,
      authoritativeCorpus: LONG_CORPUS,
      signerManifest: manifest,
      renderablePreview: state.latestAcceptedCorpus,
    });
    expect(assertion.ok).toBe(true);
  });

  it("uploaded revision replaces latestAcceptedCorpus only after approval", () => {
    const revision = `${LONG_CORPUS}\n\nAPPROVED REVISION`;
    const state = createInitialReviewContinuityState(LONG_CORPUS);
    const candidate = applyUploadedRevisionCandidate(state, revision);
    expect(candidate.latestAcceptedCorpus).toBe(LONG_CORPUS.trim());
    expect(candidate.uploadedRevisionCorpus).toContain("APPROVED REVISION");

    const accepted = acceptUploadedRevision(candidate);
    expect(accepted.latestAcceptedCorpus).toContain("APPROVED REVISION");
    expect(accepted.uploadedRevisionCorpus).toBe("");

    const approved = markReviewApprovedForSigning(accepted);
    expect(approved.reviewAcceptedByParties).toBe(true);
    expect(approved.reviewSessionState).toBe("approved_for_signing");
  });

  it("canProceedFromGuidedFinalReviewToSigning allows post-apply signing when corpus and signers ready", () => {
    expect(
      canProceedFromGuidedFinalReviewToSigning({
        paidProAuthoritative: true,
        guidedCompletionPhase: "applied",
        finalReviewExplicitlyOpened: true,
        createFlowPhase: "guided_final_review",
        authoritativeCorpusLen: LONG_CORPUS.length,
        signersComplete: true,
      }),
    ).toBe(true);
    expect(
      canProceedFromGuidedFinalReviewToSigning({
        paidProAuthoritative: true,
        guidedCompletionPhase: "applied",
        finalReviewExplicitlyOpened: false,
        createFlowPhase: "recipient_setup_required",
        authoritativeCorpusLen: LONG_CORPUS.length,
        signersComplete: true,
      }),
    ).toBe(true);
    expect(
      canProceedFromGuidedFinalReviewToSigning({
        paidProAuthoritative: true,
        guidedCompletionPhase: "applied",
        finalReviewExplicitlyOpened: true,
        createFlowPhase: "guided_final_review",
        authoritativeCorpusLen: 500,
        signersComplete: true,
      }),
    ).toBe(false);
    expect(
      canProceedFromGuidedFinalReviewToSigning({
        paidProAuthoritative: true,
        guidedCompletionPhase: "applied",
        finalReviewExplicitlyOpened: true,
        createFlowPhase: "guided_final_review",
        authoritativeCorpusLen: LONG_CORPUS.length,
        signersComplete: false,
      }),
    ).toBe(false);
  });

  it("blocks transition when preview is blank but authoritative body was full", () => {
    const manifest = buildCanonicalSignerManifest({ identities: IDENTITIES, signFirst: false });
    const assertion = assertGuidedPostFinalReviewTransition({
      action: "signature",
      acceptedCorpus: LONG_CORPUS,
      authoritativeCorpus: LONG_CORPUS,
      signerManifest: manifest,
      renderablePreview: "",
    });
    expect(assertion.ok).toBe(false);
    expect(assertion.reason).toBe("preview_not_renderable");
  });

  it("signer manifest survives review corpus replacement", () => {
    const manifest = buildCanonicalSignerManifest({ identities: IDENTITIES, signFirst: true });
    const state = createInitialReviewContinuityState(LONG_CORPUS);
    const accepted = acceptUploadedRevision(
      applyUploadedRevisionCandidate(state, `${LONG_CORPUS}\n\nRevision accepted.`),
    );
    expect(accepted.latestAcceptedCorpus).toContain("Revision accepted");
    expect(manifest.entries[0].partyName).toBe("Genesis Dogs LLC");
    expect(manifest.entries[1].email).toBe("trainer@example.test");
  });
});
