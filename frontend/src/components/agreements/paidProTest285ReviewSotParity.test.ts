import { afterEach, describe, expect, it, vi } from "vitest";
import type { PremiumRecipientHandoffV2 } from "./premiumPartyNamesHandoff";
import {
  applyPremiumRecipientHandoffReadGate,
  resetPaidProPremiumRecipientHandoffReadGateForTests,
} from "./paidProPremiumRecipientHandoffReadGate";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain as resolveReviewPlain } from "./paidProReviewRenderCorpus";
import { resolveAuthoritativePaidProReviewPlain, resolvePaidProReviewChipState } from "./authoritativePaidProReview";
import { PAID_PRO_REVIEW_CHIP_VERSION, PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS } from "./authoritativePaidProReview";
import {
  recordPaidProCorpusLifecycleCheckpoint,
  resetPaidProCorpusLifecycleDiffForTests,
} from "./paidProCorpusLifecycleDiff";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import {
  resolvePaidProStickyCta,
  resolvePaidProStickyCtaPhase,
} from "./paidProStickyCta";
import { PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA } from "./signerSetupPartyIdentity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { resolveProDeliveryTrackSelected } from "./proDeliveryTrackState";

const FREEZE_BODY = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "This Agreement is between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
  "",
  ...Array.from({ length: 18 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  "Blue Canyon Analytics LLC",
  "By: _________________________________",
  "Name: Anthem H Blanchard",
  "Title: Member",
  "",
  "SERVICE PROVIDER:",
  "Iron Vale Systems Inc.",
  "By: _________________________________",
  "Name: Ivan Vee",
  "Title: Manager",
].join("\n");

function authority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: "Blue Canyon Analytics LLC",
    recipient2Name: "Iron Vale Systems Inc",
    recipient1Email: "a@test.com",
    recipient2Email: "b@test.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Ivan Vee"],
    partySignerTitles: ["Member", "Manager"],
    partyAddresses: ["1027 S. Rainbow Blvd.", "138 Main St."],
  });
}

describe("Test285 paid Pro review SoT parity", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    resetPaidProPremiumRecipientHandoffReadGateForTests();
    resetPaidProCorpusLifecycleDiffForTests();
    vi.restoreAllMocks();
  });

  it("canonical freeze hash equals paid_pro_review_render normalized hash", () => {
    recordPaidProCorpusLifecycleCheckpoint("canonical_freeze", FREEZE_BODY);
    establishPaidProSourceOfTruth({ text: FREEZE_BODY, source: "server_full_draft" });
    const record = getPaidProSourceOfTruth()!;
    setConsumedPaidProSignerMetadataAuthority(authority());

    const reviewPlain = resolveAuthoritativePaidProReviewPlain();
    expect(hashPaidProCorpus(reviewPlain)).toBe(record.hash);
    expect(reviewPlain.length).toBe(record.text.length);

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain });
    expect(parity.invariantOk).toBe(true);
    expect(parity.canonicalHash).toBe(record.hash);
  });

  it("consumed signer metadata does not re-enable structural review sanitizer drift", () => {
    establishPaidProSourceOfTruth({ text: FREEZE_BODY, source: "server_full_draft" });
    const record = getPaidProSourceOfTruth()!;
    setConsumedPaidProSignerMetadataAuthority(authority());

    const review = resolveReviewPlain();
    expect(hashPaidProCorpus(review)).toBe(record.hash);
    expect(countPaidProExecutionBlocks(review)).toBe(1);
  });

  it("signer metadata write 2/2 then read 0/0 keeps final state 2/2", () => {
    const populated: PremiumRecipientHandoffV2 = {
      v: 2,
      party1: {
        name: "Blue Canyon Analytics LLC",
        email: "a@test.com",
        role: "client",
        signerName: "Anthem H Blanchard",
        signerTitle: "Member",
        partyAddress: "",
      },
      party2: {
        name: "Iron Vale Systems Inc.",
        email: "b@test.com",
        role: "service provider",
        signerName: "Ivan Vee",
        signerTitle: "Manager",
        partyAddress: "",
      },
      savedAt: Date.now(),
    };
    applyPremiumRecipientHandoffReadGate(populated, { partySlotCount: 2 });
    const emptyRead: PremiumRecipientHandoffV2 = {
      v: 2,
      party1: {
        name: "Blue Canyon Analytics LLC",
        email: "a@test.com",
        role: "client",
        signerName: "",
        signerTitle: "",
        partyAddress: "",
      },
      party2: {
        name: "Iron Vale Systems Inc.",
        email: "b@test.com",
        role: "service provider",
        signerName: "",
        signerTitle: "",
        partyAddress: "",
      },
      savedAt: Date.now(),
    };
    const gated = applyPremiumRecipientHandoffReadGate(emptyRead, { partySlotCount: 2 });
    expect(gated?.party1.signerName).toBe("Anthem H Blanchard");
    expect(gated?.party2.signerTitle).toBe("Manager");
  });

  it("first paid Pro review chip stays neutral before Prepare signatures", () => {
    expect(
      resolvePaidProReviewChipState({
        signersReady: false,
        reviewFirstNeutral: true,
      }),
    ).toBe(PAID_PRO_REVIEW_CHIP_VERSION);
    expect(
      resolvePaidProReviewChipState({
        signersReady: false,
        reviewFirstNeutral: true,
      }),
    ).not.toBe(PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS);
    expect(
      resolvePaidProReviewChipState({
        signersReady: false,
        reviewFirstNeutral: false,
      }),
    ).toBe(PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS);
  });

  it("signature CTA only appears after Prepare signatures selected", () => {
    expect(
      resolvePaidProStickyCtaPhase({
        hasAuthoritativeSigningSnapshot: false,
        signerDetailsComplete: false,
        inlineSignerSetupLatched: true,
        signaturePreparationRequested: false,
        sendSurfaceReady: false,
      }),
    ).toBe("review_decision");

    expect(
      resolvePaidProStickyCta({
        hasAuthoritativeSigningSnapshot: false,
        signerDetailsComplete: false,
        inlineSignerSetupLatched: true,
        signaturePreparationRequested: false,
        sendSurfaceReady: false,
      }).label,
    ).not.toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);

    expect(
      resolvePaidProStickyCta({
        hasAuthoritativeSigningSnapshot: false,
        signerDetailsComplete: false,
        inlineSignerSetupLatched: true,
        signaturePreparationRequested: true,
        sendSurfaceReady: false,
      }).label,
    ).toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);
  });

  it("selectedTrack is null on first display when send mode untouched", () => {
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: false,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: false,
      }),
    ).toBeNull();
  });
});
