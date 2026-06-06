/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
  resolvePaidProInlineSignerSetupMounted,
  shouldArmPaidProFirstReviewSignerSetupLatch,
  shouldShowPaidProForcedFirstReviewTrackChooser,
} from "./signerSetupPartyIdentity";
import {
  resolvePaidProStickyCta,
  resolvePaidProStickyCtaPhase,
} from "./paidProStickyCta";
import { resolveProDeliveryTrackSelected } from "./proDeliveryTrackState";

describe("Test297 paid Pro signer-details-first on forced render path", () => {
  const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("shouldArmPaidProFirstReviewSignerSetupLatch arms on first review without Prepare signatures", () => {
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        hasAcceptedPaidProAuthority: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        firstReviewSurfaceActive: true,
        hasCanonicalReviewCorpus: true,
        paidProSignatureDetailsReady: false,
        signerMetadataFinalized: false,
        signaturePreparationRequested: false,
        alreadyLatched: false,
      }),
    ).toBe(true);
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        hasAcceptedPaidProAuthority: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        firstReviewSurfaceActive: true,
        hasCanonicalReviewCorpus: true,
        paidProSignatureDetailsReady: false,
        signerMetadataFinalized: false,
        signaturePreparationRequested: true,
        alreadyLatched: false,
      }),
    ).toBe(false);
  });

  it("forced route hides track chooser until signer details complete", () => {
    expect(
      shouldShowPaidProForcedFirstReviewTrackChooser({
        forcedFirstReviewActive: true,
        inlineSignerSetupMounted: true,
        signerDetailsReady: false,
        signerMetadataFinalized: false,
        signaturePreparationRequested: false,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidProForcedFirstReviewTrackChooser({
        forcedFirstReviewActive: true,
        inlineSignerSetupMounted: false,
        signerDetailsReady: true,
        signerMetadataFinalized: false,
        signaturePreparationRequested: false,
      }),
    ).toBe(true);
  });

  it("latched inline signer setup mounts on forced first review", () => {
    expect(
      resolvePaidProInlineSignerSetupMounted({
        hasAcceptedPaidProAuthority: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        signerSetupLatched: true,
        signaturePreparationRequested: false,
      }),
    ).toBe(true);
  });

  it("sticky CTA is Complete signer details on first paint with latch armed", () => {
    expect(
      resolvePaidProStickyCtaPhase({
        hasAuthoritativeSigningSnapshot: false,
        signerDetailsComplete: false,
        inlineSignerSetupLatched: true,
        signaturePreparationRequested: false,
        sendSurfaceReady: false,
      }),
    ).toBe("signer_details_required");
    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(sticky.label).toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);
    expect(sticky.showStickyBar).toBe(true);
  });

  it("selectedTrack stays null before send mode is touched", () => {
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: false,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: false,
      }),
    ).toBeNull();
  });

  it("AgreementBuilderIntake wires signer-details-first on forced route", () => {
    expect(intakeSrc).toContain("shouldArmPaidProFirstReviewSignerSetupLatch");
    expect(intakeSrc).toContain("paidProFirstReviewSignerSetupRequired");
    expect(intakeSrc).toContain("showPaidProForcedFirstReviewTrackChooser");
    expect(intakeSrc).toContain("paidProInlineRecipientShell ? true : resolvedSendMode === \"signature\"");
    const forcedBlock = intakeSrc.slice(
      intakeSrc.indexOf("paidProForcedFirstReviewActive ? ("),
      intakeSrc.indexOf("paidProForcedFirstReviewActive ? (") + 6500,
    );
    expect(forcedBlock).toContain("showPaidProForcedFirstReviewTrackChooser");
    expect(forcedBlock).toContain("paidProCanonicalReviewSignerSetupActive");
    expect(forcedBlock).toContain("CreateFlowSendRecipientsPanel");
    expect(forcedBlock).not.toMatch(
      /\{!paidProCanonicalReviewSignerSetupActive \? \([\s\S]{0,400}<PaidProForcedFirstReviewChrome/,
    );
  });

  it("AgreementBuilderIntake exposes signer metadata field labels in inline shell", () => {
    expect(intakeSrc).toContain("Signer name");
    expect(intakeSrc).toContain("Signer title (optional)");
    expect(intakeSrc).toContain("Party address (optional)");
    expect(intakeSrc).toContain("Signer 1 email");
  });
});
