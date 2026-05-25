import { describe, expect, it } from "vitest";
import {
  buildPinnedFinalizedSignerCorpus,
  isGuidedFinalCorpusPinActive,
  resolvePersistAgreementIdAfterHydrate,
  shouldBlockGuidedFinalReviewPhaseRollback,
  shouldRejectHydratedCorpusOverPin,
} from "./guidedFinalCorpusPin";
import { fingerprintAgreementBody } from "./guidedSigningPacketVersion";

describe("guidedFinalCorpusPin (test71 sequence)", () => {
  const corpus = `${"Signer-applied finalized corpus. ".repeat(90)}IN WITNESS WHEREOF

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Brown
By: ______________________
Name: Joe Brown
Date: ____________________`;

  it("pins hash and rejects hydrated server body with different hash", () => {
    const pinned = buildPinnedFinalizedSignerCorpus(corpus);
    expect(pinned).not.toBeNull();
    const stale = `${corpus}\nStale server_full_document_text appendix.`;
    expect(shouldRejectHydratedCorpusOverPin({ pinnedHash: pinned!.hash, incomingBody: stale })).toBe(true);
    expect(shouldRejectHydratedCorpusOverPin({ pinnedHash: pinned!.hash, incomingBody: corpus })).toBe(false);
  });

  it("blocks rollback to draft_ready_for_review while guided final review is anchored", () => {
    const pinned = buildPinnedFinalizedSignerCorpus(corpus)!;
    expect(
      shouldBlockGuidedFinalReviewPhaseRollback({
        targetPhase: "draft_ready_for_review",
        currentPhase: "guided_final_review",
        pinnedHash: pinned.hash,
        guidedCompletionPhase: "applied",
        finalReviewExplicitlyOpened: true,
        guidedSignatureTrackInFlight: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockGuidedFinalReviewPhaseRollback({
        targetPhase: "ready_to_send",
        currentPhase: "guided_final_review",
        pinnedHash: pinned.hash,
        guidedCompletionPhase: "applied",
        finalReviewExplicitlyOpened: true,
      }),
    ).toBe(false);
  });

  it("resolvePersistAgreementIdAfterHydrate prefers posted id immediately after hydrate", () => {
    const postedId = "bd73-test-agreement-id";
    expect(
      resolvePersistAgreementIdAfterHydrate({
        postedId,
        reviewAgreementIdRef: null,
        reviewAgreementId: null,
        productionSendBarAgreementId: null,
      }),
    ).toBe(postedId);
  });

  it("pin is active only when guidedCompletionPhase is applied", () => {
    const hash = fingerprintAgreementBody(corpus);
    expect(isGuidedFinalCorpusPinActive({ pinnedHash: hash, guidedCompletionPhase: "applied" })).toBe(true);
    expect(isGuidedFinalCorpusPinActive({ pinnedHash: hash, guidedCompletionPhase: "applying_all" })).toBe(false);
  });
});
