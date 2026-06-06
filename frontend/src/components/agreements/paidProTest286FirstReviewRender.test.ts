/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PremiumRecipientHandoffV2 } from "./premiumPartyNamesHandoff";
import {
  applyPremiumRecipientHandoffReadGate,
  resetPaidProPremiumRecipientHandoffReadGateForTests,
} from "./paidProPremiumRecipientHandoffReadGate";
import {
  logSignerMetadataEffective,
  resetSignerMetadataEffectiveMaxForTests,
} from "./signerMetadataEffective";
import {
  resetPaidProFirstReviewRenderGuardForTests,
  resolvePaidProFirstReviewDocumentPresentation,
} from "./paidProFirstReviewRenderGuard";
import {
  capturePaidProDeferredStarterSignatureIntent,
  peekPaidProDeferredStarterSignatureIntent,
  resetPaidProDeferredStarterSignatureIntentForTests,
} from "./paidProDeferredSignatureIntent";
import { resolveProDeliveryTrackSelected } from "./proDeliveryTrackState";
import {
  resolvePaidProStickyCta,
  resolvePaidProStickyCtaPhase,
} from "./paidProStickyCta";
import { PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA } from "./signerSetupPartyIdentity";
import { armPaidProStarterSignatureSendFromCreateFlow } from "../../launch/simpleProduct/premiumSendIntent";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";

const CANONICAL_PLAIN = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "This Agreement is between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
  "",
  ...Array.from({ length: 20 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n");

describe("Test286 paid Pro first-review render + signer metadata", () => {
  afterEach(() => {
    resetPaidProPremiumRecipientHandoffReadGateForTests();
    resetSignerMetadataEffectiveMaxForTests();
    resetPaidProFirstReviewRenderGuardForTests();
    resetPaidProDeferredStarterSignatureIntentForTests();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("falls back to canonical plain when HTML shell is long but visually empty", () => {
    const html = `<div class="premium-doc-body">${" ".repeat(PAID_PRO_AUTHORITY_MIN_LEN)}</div>`;
    const presentation = resolvePaidProFirstReviewDocumentPresentation({
      agreementHtml: html,
      paidReviewPlain: CANONICAL_PLAIN,
      canonicalPaidProReview: true,
    });
    expect(presentation.mode).toBe("canonical_plain");
    expect(presentation.blockedBlankWithCanonical).toBe(true);
    expect(presentation.fallbackApplied).toBe(true);
    expect(presentation.renderedVisibleTextLen).toBe(CANONICAL_PLAIN.length);
  });

  it("populated signer metadata then empty read keeps 2/2 with ignoredEmptyRead true", () => {
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
      party1: { name: "", email: "", role: "client", signerName: "", signerTitle: "", partyAddress: "" },
      party2: { name: "", email: "", role: "provider", signerName: "", signerTitle: "", partyAddress: "" },
      savedAt: Date.now(),
    };
    const gated = applyPremiumRecipientHandoffReadGate(emptyRead, { partySlotCount: 2 });
    expect(gated?.party1.signerName).toBe("Anthem H Blanchard");
    expect(gated?.party2.signerTitle).toBe("Manager");
  });

  it("dedupes repeated signer-metadata-effective logs", () => {
    vi.stubEnv("MODE", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const payload = {
      source: "handoff_read_populated",
      partySlots: 2,
      slotsWithSignerName: 2,
      slotsWithSignerTitle: 2,
      ignoredEmptyRead: false,
    };
    logSignerMetadataEffective(payload);
    logSignerMetadataEffective(payload);
    logSignerMetadataEffective(payload);
    const logs = info.mock.calls.filter((c) => c[0] === "[signer-metadata-effective]");
    expect(logs).toHaveLength(1);
    info.mockRestore();
  });

  it("first review delivery track stays null until signature preparation", () => {
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: true,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: false,
      }),
    ).toBe("signature");
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: false,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: false,
      }),
    ).toBeNull();
  });

  it("sticky CTA stays review_decision until Prepare signatures", () => {
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
  });

  it("defers starter signature intent until prepare signatures", () => {
    armPaidProStarterSignatureSendFromCreateFlow();
    expect(capturePaidProDeferredStarterSignatureIntent()).toBe(true);
    expect(peekPaidProDeferredStarterSignatureIntent()).toBe(true);
  });
});
