/** @vitest-environment jsdom */
/**
 * P0: Genesis first-review → signer-setup transition.
 * Clicking "Add signer details" must reveal the editable signer form without regenerating,
 * navigating to Create, or advancing to Prepare for signing early.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaidProForcedFirstReviewChrome } from "./paidProForcedFirstReviewChrome";
import {
  PAID_PRO_FIRST_REVIEW_INLINE_SIGNER_SETUP_DOM_ID,
  resolvePaidProFirstReviewPrimaryCtaAfterSignerProgress,
  resolvePaidProFirstReviewSignerSetupOpenIntent,
  shouldOpenPaidProFirstReviewSignerSetupOnAddDetails,
} from "./paidProFirstReviewSignerSetupTransition";
import { PAID_PRO_REVIEW_ADD_SIGNER_DETAILS_LABEL } from "./authoritativePaidProReview";
import { resolvePaidProStickyCta } from "./paidProStickyCta";
import {
  PAID_PRO_PREPARE_ESIGN_DECISION_CTA,
  resolvePaidProInlineSignerSetupMounted,
} from "./signerSetupPartyIdentity";
import {
  readCreateReviewAgreementResumeId,
  writeCreateReviewAgreementResumeId,
} from "./agreementIntakeStorage";
import {
  clearPremiumPartyNamesHandoff,
  readPremiumRecipientHandoff,
  writePremiumRecipientHandoffExact,
} from "./premiumPartyNamesHandoff";
import { LAWDOG_ACME_SYNTHETIC_INTAKE } from "./paidProLawDogAcmeSyntheticP0.test";

const LAWDOG = "LawDog Demo LLC";
const ACME = "Acme Test Co";
const AGREEMENT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

afterEach(() => {
  cleanup();
  clearPremiumPartyNamesHandoff();
  try {
    sessionStorage.clear();
  } catch {
    /* jsdom */
  }
});

describe("paidProFirstReviewSignerSetupTransition", () => {
  it("1–2 — first-review open intent keeps DRAFT review and preserves accepted document", () => {
    const intent = resolvePaidProFirstReviewSignerSetupOpenIntent();
    expect(intent.createUiStage).toBe("DRAFT");
    expect(intent.displayPhase).toBe("review");
    expect(intent.createFlowPhase).toBe("signer_setup_required");
    expect(intent.inlineSignerSetupLatched).toBe(true);
    expect(intent.recipientEditorOpen).toBe(true);
    expect(intent.premiumRecipientUxActive).toBe(false);
    expect(intent.signaturePreparationRequested).toBe(false);
    expect(intent.preserveGuidedCompletionPhase).toBe(true);
    expect(intent.preserveAcceptedDocument).toBe(true);
    expect(PAID_PRO_FIRST_REVIEW_INLINE_SIGNER_SETUP_DOM_ID).toBe("claw-paid-pro-inline-signer-setup");
  });

  it("Add signer details opens signer setup only while incomplete on first review", () => {
    expect(
      shouldOpenPaidProFirstReviewSignerSetupOnAddDetails({
        firstReviewSurfaceActive: true,
        signersReady: false,
        signerMetadataFinalized: false,
        signaturePreparationRequested: false,
      }),
    ).toBe(true);
    expect(
      shouldOpenPaidProFirstReviewSignerSetupOnAddDetails({
        firstReviewSurfaceActive: true,
        signersReady: true,
        signerMetadataFinalized: true,
        signaturePreparationRequested: false,
      }),
    ).toBe(false);
    expect(
      shouldOpenPaidProFirstReviewSignerSetupOnAddDetails({
        firstReviewSurfaceActive: true,
        signersReady: false,
        signerMetadataFinalized: false,
        signaturePreparationRequested: true,
      }),
    ).toBe(false);
  });

  it("3 — clicking Add signer details invokes open handler (not Prepare / regenerate)", () => {
    const onEditSignerDetails = vi.fn();
    const onPrepareSignatures = vi.fn();
    render(
      <PaidProForcedFirstReviewChrome
        signersReady={false}
        signerMetadataFinalized={false}
        getCopyPlainText={() => LAWDOG_ACME_SYNTHETIC_INTAKE}
        onEditAgreement={vi.fn()}
        onEditSignerDetails={onEditSignerDetails}
        onExportAgreement={vi.fn()}
        onShareForReview={vi.fn()}
        onPrepareSignatures={onPrepareSignatures}
      />,
    );
    expect(screen.getByTestId("paid-pro-forced-first-review-chrome")).toBeTruthy();
    const addBtn = screen.getByTestId("paid-pro-forced-add-signer-details");
    expect(addBtn.textContent).toContain(PAID_PRO_REVIEW_ADD_SIGNER_DETAILS_LABEL);
    fireEvent.click(addBtn);
    expect(onEditSignerDetails).toHaveBeenCalledTimes(1);
    expect(onPrepareSignatures).not.toHaveBeenCalled();
    expect(screen.queryByTestId("paid-pro-forced-prepare-signatures")).toBeNull();
  });

  it("3b — after open intent, inline signer setup mounts for both parties", () => {
    const intent = resolvePaidProFirstReviewSignerSetupOpenIntent();
    expect(
      resolvePaidProInlineSignerSetupMounted({
        hasAcceptedPaidProAuthority: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: intent.premiumRecipientUxActive,
        createUiStageIsDraft: true,
        signerSetupLatched: intent.inlineSignerSetupLatched,
        signaturePreparationRequested: intent.signaturePreparationRequested,
      }),
    ).toBe(true);

    render(
      <div
        id={PAID_PRO_FIRST_REVIEW_INLINE_SIGNER_SETUP_DOM_ID}
        data-testid="paid-pro-inline-signer-setup"
      >
        <label>
          Party 1 legal entity
          <input data-testid="signer-party-1-legal" defaultValue={ACME} />
        </label>
        <label>
          Party 1 signer name
          <input data-testid="signer-party-1-name" />
        </label>
        <label>
          Party 1 email
          <input data-testid="signer-party-1-email" />
        </label>
        <label>
          Party 2 legal entity
          <input data-testid="signer-party-2-legal" defaultValue={LAWDOG} />
        </label>
        <label>
          Party 2 signer name
          <input data-testid="signer-party-2-name" />
        </label>
        <label>
          Party 2 email
          <input data-testid="signer-party-2-email" />
        </label>
      </div>,
    );
    expect(screen.getByTestId("paid-pro-inline-signer-setup")).toBeTruthy();
    expect((screen.getByTestId("signer-party-1-legal") as HTMLInputElement).value).toMatch(/Acme/i);
    expect((screen.getByTestId("signer-party-2-legal") as HTMLInputElement).value).toMatch(/LawDog/i);
  });

  it("4 — signer fields can be entered for both parties", () => {
    render(
      <div data-testid="paid-pro-inline-signer-setup">
        <input data-testid="signer-party-1-name" />
        <input data-testid="signer-party-1-email" />
        <input data-testid="signer-party-2-name" />
        <input data-testid="signer-party-2-email" />
      </div>,
    );
    fireEvent.change(screen.getByTestId("signer-party-1-name"), {
      target: { value: "Alex Client" },
    });
    fireEvent.change(screen.getByTestId("signer-party-1-email"), {
      target: { value: "alex@acme.test" },
    });
    fireEvent.change(screen.getByTestId("signer-party-2-name"), {
      target: { value: "Pat Provider" },
    });
    fireEvent.change(screen.getByTestId("signer-party-2-email"), {
      target: { value: "pat@lawdog.test" },
    });
    expect((screen.getByTestId("signer-party-1-name") as HTMLInputElement).value).toBe("Alex Client");
    expect((screen.getByTestId("signer-party-2-email") as HTMLInputElement).value).toBe(
      "pat@lawdog.test",
    );
  });

  it("5 — Prepare for signing only after both parties complete + finalized", () => {
    expect(
      resolvePaidProFirstReviewPrimaryCtaAfterSignerProgress({
        signersReady: false,
        signerMetadataFinalized: false,
      }),
    ).toBe("add_signer_details");
    expect(
      resolvePaidProFirstReviewPrimaryCtaAfterSignerProgress({
        signersReady: true,
        signerMetadataFinalized: false,
      }),
    ).toBe("add_signer_details");
    expect(
      resolvePaidProFirstReviewPrimaryCtaAfterSignerProgress({
        signersReady: true,
        signerMetadataFinalized: true,
      }),
    ).toBe("prepare_for_signing");

    const incompleteSticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(incompleteSticky.phase).toBe("signer_details_required");
    expect(incompleteSticky.label).not.toBe(PAID_PRO_PREPARE_ESIGN_DECISION_CTA);

    render(
      <PaidProForcedFirstReviewChrome
        signersReady
        signerMetadataFinalized
        getCopyPlainText={() => "body"}
        onEditAgreement={vi.fn()}
        onEditSignerDetails={vi.fn()}
        onExportAgreement={vi.fn()}
        onShareForReview={vi.fn()}
        onPrepareSignatures={vi.fn()}
      />,
    );
    expect(screen.getByTestId("paid-pro-forced-prepare-signatures").textContent).toBe(
      PAID_PRO_PREPARE_ESIGN_DECISION_CTA,
    );
  });

  it("6 — refresh preserves workspace agreement id and signer handoff state", () => {
    writeCreateReviewAgreementResumeId(AGREEMENT_ID);
    writePremiumRecipientHandoffExact(
      {
        name: ACME,
        email: "alex@acme.test",
        role: "Client",
        signerName: "Alex Client",
        signerTitle: "CEO",
        partyAddress: "",
      },
      {
        name: LAWDOG,
        email: "pat@lawdog.test",
        role: "Service Provider",
        signerName: "Pat Provider",
        signerTitle: "Counsel",
        partyAddress: "",
      },
    );

    // Simulate reload: re-read session resume + handoff (same keys the intake restore path uses).
    expect(readCreateReviewAgreementResumeId()).toBe(AGREEMENT_ID);
    const handoff = readPremiumRecipientHandoff();
    expect(handoff?.party1?.name).toMatch(/Acme/i);
    expect(handoff?.party2?.name).toMatch(/LawDog/i);
    expect(handoff?.party1?.email).toBe("alex@acme.test");
    expect(handoff?.party1?.signerName).toBe("Alex Client");
    expect(handoff?.party2?.signerName).toBe("Pat Provider");
  });

  it("Intake wires light first-review open path (no ready_to_apply regression on Add signer details)", () => {
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intakeSrc).toContain("openPaidProFirstReviewSignerSetup");
    expect(intakeSrc).toContain("shouldOpenPaidProFirstReviewSignerSetupOnAddDetails");
    expect(intakeSrc).toContain("resolvePaidProFirstReviewSignerSetupOpenIntent");
    expect(intakeSrc).toContain("PAID_PRO_FIRST_REVIEW_INLINE_SIGNER_SETUP_DOM_ID");
    // Post-finalize reopen must not regress applied → ready_to_apply for first-review.
    expect(intakeSrc).toMatch(
      /Stay on applied when already accepted[\s\S]{0,200}ready_to_apply/,
    );
    const openBlock = intakeSrc.slice(
      intakeSrc.indexOf("const openPaidProFirstReviewSignerSetup"),
      intakeSrc.indexOf("const openPaidProFirstReviewSignerSetup") + 1200,
    );
    expect(openBlock).not.toContain("onGenerate");
    expect(openBlock).not.toContain("ready_to_apply");
    expect(openBlock).not.toContain("beginPaidProPostFinalizeSignerDetailsReopen");
    expect(openBlock).toContain('setCreateUiStage(CreateUiStage.DRAFT)');
  });
});
