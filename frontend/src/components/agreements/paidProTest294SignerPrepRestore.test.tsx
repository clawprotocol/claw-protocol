/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PaidProForcedFirstReviewChrome } from "./paidProForcedFirstReviewChrome";
import { PaidProSignerFieldsMountShell } from "./paidProSignerFieldsMountShell";
import {
  resetPaidProSignaturePrepUiLogsForTests,
} from "./paidProSignaturePrepUi";
import { resetPaidProDocumentBodyRouterLogsForTests } from "./paidProDocumentBodyRouter";
import { resetPaidProVisibleDocumentShellLogsForTests } from "./paidProVisibleDocumentShell";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resolvePaidProInlineSignerSetupMounted } from "./signerSetupPartyIdentity";
import { resolveProDeliveryTrackSelected } from "./proDeliveryTrackState";

describe("Test294 forced first review restores signer prep UI", () => {
  afterEach(() => {
    resetPaidProSignaturePrepUiLogsForTests();
    resetPaidProDocumentBodyRouterLogsForTests();
    resetPaidProVisibleDocumentShellLogsForTests();
    clearPaidProSourceOfTruth();
    cleanup();
    vi.restoreAllMocks();
  });

  it("first review chrome shows review + prepare signatures without signer fields", () => {
    render(
      <PaidProForcedFirstReviewChrome
        signersReady={false}
        signerMetadataFinalized={false}
        getCopyPlainText={() => "Agreement body for copy."}
        onEditAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
        onShareForReview={vi.fn()}
        onPrepareSignatures={vi.fn()}
      />,
    );
    expect(screen.getByTestId("paid-pro-forced-share-for-review")).toBeTruthy();
    expect(screen.getByTestId("paid-pro-forced-prepare-signatures")).toBeTruthy();
    expect(screen.queryByTestId("paid-pro-inline-signer-setup")).toBeNull();
  });

  it("clicking Prepare signatures invokes handler without auto-mounting signer fields", () => {
    const onPrepare = vi.fn();
    render(
      <PaidProForcedFirstReviewChrome
        signersReady={false}
        signerMetadataFinalized={false}
        getCopyPlainText={() => "Agreement body for copy."}
        onEditAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
        onShareForReview={vi.fn()}
        onPrepareSignatures={onPrepare}
      />,
    );
    fireEvent.click(screen.getByTestId("paid-pro-forced-prepare-signatures"));
    expect(onPrepare).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("paid-pro-inline-signer-setup")).toBeNull();
  });

  it("signer fields mount only when inline signer setup latch is active", () => {
    establishPaidProSourceOfTruth({
      text: `AGREEMENT. ${"Clause. ".repeat(900)}`,
      source: "server_full_document_text",
    });
    expect(
      resolvePaidProInlineSignerSetupMounted({
        hasAcceptedPaidProAuthority: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        signerSetupLatched: false,
        signaturePreparationRequested: false,
      }),
    ).toBe(false);
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

    render(
      <PaidProSignerFieldsMountShell
        partySlotCount={2}
        slotsWithSignerName={2}
        slotsWithSignerTitle={2}
        gateComplete={false}
        requiredCount={2}
      >
        <div data-testid="signer-field-stub">Party 1 signer name</div>
      </PaidProSignerFieldsMountShell>,
    );
    const shell = screen.getByTestId("paid-pro-inline-signer-setup");
    expect(within(shell).getByTestId("signer-field-stub")).toBeTruthy();
  });

  it("selectedTrack stays null until send mode is touched", () => {
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: false,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: false,
      }),
    ).toBeNull();
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: true,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: false,
      }),
    ).toBe("signature");
  });

  it("AgreementBuilderIntake keeps forced document inside white card with signer prep chrome", () => {
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intakeSrc).toContain("paidProForcedFirstReviewActive");
    expect(intakeSrc).toContain("PaidProForcedFirstReviewChrome");
    expect(intakeSrc).toContain("handlePaidProPrepareSignaturesFromFirstReview");
    expect(intakeSrc).toContain("PaidProSignerFieldsMountShell");
    const prepUiSrc = readFileSync(join(__dirname, "paidProSignaturePrepUi.ts"), "utf8");
    expect(prepUiSrc).toContain("[paid-pro-signature-prep-cta-visible]");
    expect(prepUiSrc).toContain("[paid-pro-signature-prep-selected]");
    expect(prepUiSrc).toContain("[paid-pro-signer-fields-mounted]");
    expect(prepUiSrc).toContain("[paid-pro-signer-fields-ready]");
    expect(intakeSrc).toContain("paidProForcedFirstReviewActive ? (");
    expect(intakeSrc).toContain("handlePaidProPrepareSignaturesFromFirstReview()");
    const chromeSrc = readFileSync(join(__dirname, "paidProForcedFirstReviewChrome.tsx"), "utf8");
    expect(chromeSrc).toContain("paid-pro-forced-prepare-signatures");
    expect(chromeSrc).toContain("paid-pro-forced-share-for-review");
    const forcedIdx = intakeSrc.indexOf("paidProForcedFirstReviewActive ? (");
    const legacySimpleIdx = intakeSrc.indexOf(
      "simpleProFinalReviewShellActive && !failedPremiumCorpusActive",
    );
    expect(forcedIdx).toBeGreaterThan(0);
    expect(legacySimpleIdx).toBeGreaterThan(forcedIdx);
  });

  it("first review surface active includes forced route for sticky CTA and latch arming", () => {
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intakeSrc).toContain(
      "const paidProFirstReviewSurfaceActive = simpleProFinalReviewShellActive || paidProForcedFirstReviewActive",
    );
    expect(intakeSrc).toContain("!paidProFirstReviewSurfaceActive) return null");
    expect(intakeSrc).toContain("shouldArmPaidProFirstReviewSignerSetupLatch");
    expect(intakeSrc).toContain("paidProFirstReviewSignerSetupRequired");
  });
});
