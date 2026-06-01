import { describe, expect, it } from "vitest";
import {
  mapPaidProStickyCtaToPrimaryCta,
  PAID_PRO_SIGNER_COMPLETE_STICKY_HELPER,
  PAID_PRO_SIGNER_SETUP_STICKY_HELPER,
  paidProStickyCtaShowsStickyBar,
  resolvePaidProStickyBarHeadlines,
  resolvePaidProStickyCta,
  resolvePaidProStickyCtaPhase,
  shouldClearSigningSnapshotOnSignerMetadataDrift,
} from "./paidProStickyCta";
import {
  PAID_PRO_PREPARE_ESIGN_DECISION_CTA,
  PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA,
} from "./signerSetupPartyIdentity";

describe("paidProStickyCta", () => {
  it("progresses phases in canonical order", () => {
    expect(
      resolvePaidProStickyCtaPhase({
        hasAuthoritativeSigningSnapshot: false,
        signerDetailsComplete: false,
        inlineSignerSetupLatched: true,
        signaturePreparationRequested: false,
        sendSurfaceReady: false,
      }),
    ).toBe("signer_details_required");

    expect(
      resolvePaidProStickyCtaPhase({
        hasAuthoritativeSigningSnapshot: false,
        signerDetailsComplete: true,
        inlineSignerSetupLatched: true,
        signaturePreparationRequested: false,
        sendSurfaceReady: false,
      }),
    ).toBe("signer_details_complete");

    expect(
      resolvePaidProStickyCtaPhase({
        hasAuthoritativeSigningSnapshot: true,
        signerDetailsComplete: true,
        inlineSignerSetupLatched: false,
        signaturePreparationRequested: false,
        sendSurfaceReady: false,
      }),
    ).toBe("review_decision");

    expect(
      resolvePaidProStickyCtaPhase({
        hasAuthoritativeSigningSnapshot: true,
        signerDetailsComplete: true,
        inlineSignerSetupLatched: false,
        signaturePreparationRequested: true,
        sendSurfaceReady: true,
      }),
    ).toBe("send_ready");
  });

  it("review_decision keeps sticky bar with Prepare for signing CTA", () => {
    const state = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(state.phase).toBe("review_decision");
    expect(paidProStickyCtaShowsStickyBar(state.phase)).toBe(true);
    expect(state.disabled).toBe(false);
    expect(state.label).toBe(PAID_PRO_PREPARE_ESIGN_DECISION_CTA);
    expect(state.reason).toBe("paid_pro_review_decision_prepare_signing");
    const mapped = mapPaidProStickyCtaToPrimaryCta(state);
    expect(mapped.disabled).toBe(false);
    expect(mapped.label).toBe(PAID_PRO_PREPARE_ESIGN_DECISION_CTA);
  });

  it("signer_details_complete maps to a single finalize CTA reason", () => {
    const mapped = mapPaidProStickyCtaToPrimaryCta(
      resolvePaidProStickyCta({
        hasAuthoritativeSigningSnapshot: false,
        signerDetailsComplete: true,
        inlineSignerSetupLatched: true,
        signaturePreparationRequested: false,
        sendSurfaceReady: false,
      }),
    );
    expect(mapped.reason).toBe("paid_pro_signer_details_complete");
    expect(mapped.label).toBe(PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA);
    expect(mapped.action).toBe("guided_continue");
    expect(mapped.disabled).toBe(false);
  });

  it("prepare_signing phase when signing requested with finalized snapshot", () => {
    expect(
      resolvePaidProStickyCtaPhase({
        hasAuthoritativeSigningSnapshot: true,
        signerDetailsComplete: true,
        inlineSignerSetupLatched: false,
        signaturePreparationRequested: true,
        sendSurfaceReady: false,
      }),
    ).toBe("prepare_signing");
  });

  it("sticky helper copy matches signer phase (no send-ready language during setup)", () => {
    expect(resolvePaidProStickyBarHeadlines("signer_details_required").subline).toBe(
      PAID_PRO_SIGNER_SETUP_STICKY_HELPER,
    );
    expect(resolvePaidProStickyBarHeadlines("signer_details_complete").subline).toBe(
      PAID_PRO_SIGNER_COMPLETE_STICKY_HELPER,
    );
    expect(resolvePaidProStickyBarHeadlines("review_decision").subline).toBeNull();
    expect(PAID_PRO_SIGNER_SETUP_STICKY_HELPER).not.toMatch(/ready to create links/i);
  });

  it("does not clear finalized snapshot on drift unless latch is armed", () => {
    expect(
      shouldClearSigningSnapshotOnSignerMetadataDrift({
        hasSnapshot: true,
        drifted: true,
        inlineSignerSetupLatched: false,
        signaturePreparationRequested: false,
      }),
    ).toBe(false);
    expect(
      shouldClearSigningSnapshotOnSignerMetadataDrift({
        hasSnapshot: true,
        drifted: true,
        inlineSignerSetupLatched: true,
        signaturePreparationRequested: false,
      }),
    ).toBe(true);
  });
});
