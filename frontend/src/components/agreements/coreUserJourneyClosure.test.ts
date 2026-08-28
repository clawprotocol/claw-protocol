import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOneTimeAgreementUnlockEnabled, isSingleAgreementCheckoutIntent } from "../../launch/oneTimeAgreementUnlock";
import { assessAgreementIntakeCapability } from "./agreementIntakeCapabilityGate";
import { detectIntakeContradictionHints } from "./intakeContradictionHints";
import { buildWeCapturedSummaryBullets } from "./intakeWhatWeUnderstood";
import { computeBlockingIntakeGaps, computeRecommendedIntakeGaps, prepareParsedDraftForIntakeGeneration } from "./intakeClarificationPolicy";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { IntakePaymentField } from "./intakeCurrencyParse";
import {
  addIntakeContractingParty,
  canAddIntakeContractingParty,
  canRemoveIntakeContractingParty,
  namedIntakeContractingParties,
  normalizeIntakePartyEditorRows,
  removeIntakeContractingParty,
  upsertLabeledPartyRows,
} from "./intakeContractingPartyEditor";
import { resolveCustomerJourneyState, CUSTOMER_JOURNEY_STATE } from "./customerJourneyReadiness";
import { resolveFinalizeReadiness } from "./finalizeReadinessModel";
import {
  POST_GENERATION_ADD_PARTY_CONTRACTING_LABEL,
  POST_GENERATION_ADD_PARTY_REVIEWER_LABEL,
  formatPartySetupRowStatus,
  formatSignerSetupBeyondGeneratedWarningBody,
} from "./paidProNPartySignerSetup";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import {
  feedbackAfterGeneration,
  feedbackAfterLinkFailure,
  feedbackAfterPartyAdded,
  feedbackAfterReviewLinksAlreadyReady,
  feedbackAfterReviewLinksCreated,
  feedbackAfterSigningLinksCreated,
  feedbackAfterPreparePlacementOpened,
} from "./journeyActionFeedback";
import { PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION, PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION } from "./paidProDeliveryTrackGtmCopy";
import type { LivePreviewModel } from "./liveDraftHeuristics";
import type { PremiumFinalizeAudit } from "./premiumFinalizeAuditTypes";

const emptyParsed = (): ParsedDraftShape => ({
  title: "",
  jurisdiction: "",
  parties: [],
  purpose: "",
  payment_terms: "",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: {} as IntakePaymentField,
});

const basePreview: LivePreviewModel = {
  docTitle: "Agreement",
  partiesLine: null,
  scopeLine: null,
  servicesLine: null,
  termLine: null,
  obligationsLine: null,
  compensationLine: null,
  scheduleLine: null,
  signerPlaceholdersLine: null,
  hasStructuredSignal: false,
  payment: { amount: null, cadence: null, valid: true },
};

describe("core user journey closure — $9 deferred", () => {
  it("production helpers cannot enable the $9 path from env, intent, or CTA", () => {
    expect(isOneTimeAgreementUnlockEnabled()).toBe(false);
    const params = new URLSearchParams("intent=single_agreement");
    expect(isSingleAgreementCheckoutIntent(params)).toBe(false);
    const sendModal = readFileSync(join(__dirname, "../../launch/simpleProduct/SendConversionModal.tsx"), "utf8");
    expect(sendModal).not.toContain("one-time-agreement-unlock-cta");
    expect(sendModal).not.toContain("intent: \"single_agreement\"");
    const checkout = readFileSync(join(__dirname, "../../launch/simpleProduct/SimpleCheckoutPage.tsx"), "utf8");
    expect(checkout).toContain("isSingleAgreementCheckoutIntent");
    expect(checkout).toMatch(/if \(!isSingleAgreementCheckout\)/);
    expect(checkout).toContain("syncDemoSubscriptionEntitlementIfApplicable");
  });
});

describe("core user journey closure — intake min facts", () => {
  it("1. sparse prompt names the exact missing facts", () => {
    const decision = assessAgreementIntakeCapability("need an NDA");
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.clarification.why).toMatch(/two legal names/i);
    expect(decision.clarification.why).toMatch(/one sentence/i);
    expect(decision.userMessage).not.toMatch(/Not enough information|Complete the required fields|Try again/i);
  });

  it("2. partial prompt with parties + purpose proceeds without payment", () => {
    const decision = assessAgreementIntakeCapability(
      "Draft an agreement between Acme LLC and Beta Inc for website redesign work.",
    );
    expect(decision.ok).toBe(true);
    const { blockingGaps } = prepareParsedDraftForIntakeGeneration(emptyParsed(), 
      "Draft an agreement between Acme LLC and Beta Inc for website redesign work.",
    );
    expect(blockingGaps).not.toContain("payment_terms");
    expect(blockingGaps).not.toContain("duration");
    expect(blockingGaps).not.toContain("jurisdiction");
  });

  it("3. detailed prompt is not told that LawDog will drop the rest", () => {
    const longNotes =
      "Monthly retainer $5,000 for warehouse automation, inventory reporting, and dashboard work. ".repeat(12) +
      "We still have not named the contracting parties.";
    const c = assessAgreementIntakeCapability(longNotes);
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(`${c.clarification.why} ${c.clarification.whatWeHeard.join(" ")}`).not.toMatch(/drop the rest/i);
    expect(c.clarification.why).toMatch(/legal names|preserved|original text|summarized/i);
  });

  it("4. conflicting payment amounts ask the user to choose", () => {
    const hints = detectIntakeContradictionHints(
      "Services agreement. Fee $5,000. Total price $7,500. No milestones.",
    );
    expect(hints.some((h) => h.kind === "payment_amount")).toBe(true);
    expect(hints.find((h) => h.kind === "payment_amount")?.message).toMatch(/\$5,000/);
    expect(hints.find((h) => h.kind === "payment_amount")?.message).toMatch(/\$7,500/);
    expect(hints.find((h) => h.kind === "payment_amount")?.message).toMatch(/Which amount should govern/);
  });

  it("does not block generation on title, payment, or dates when parties and purpose exist", () => {
    const parsed: ParsedDraftShape = {
      ...emptyParsed(),
      parties: [
        { name: "Acme LLC", role: "client" },
        { name: "Beta LLC", role: "vendor" },
      ],
      purpose: "Website redesign and related deliverables.",
    };
    const gaps = computeBlockingIntakeGaps(parsed, "Acme LLC and Beta LLC website redesign.");
    expect(gaps).toEqual([]);
    expect(computeRecommendedIntakeGaps(parsed, "Acme LLC and Beta LLC website redesign.").length).toBeLessThanOrEqual(3);
  });
});

describe("core user journey closure — understood checkpoint and parties", () => {
  it("shows type, parties, scope, payment, timing, and special terms without numeric scores", () => {
    const raw =
      "Consulting agreement between Peaceful Journey LLC and Harbor Peak LLC. $5k monthly. 12 months. Confidentiality required.";
    const model: LivePreviewModel = {
      ...basePreview,
      docTitle: "Consulting Agreement",
      partiesStructured: { party_1: "Peaceful Journey LLC", party_2: "Harbor Peak LLC" },
      scopeLine: "Advisory consulting",
      termLine: "12 months",
      compensationLine: "$5k monthly",
      obligationsLine: "Confidentiality",
    };
    const bullets = buildWeCapturedSummaryBullets(raw, model);
    expect(bullets.map((b) => b.kind)).toEqual(["type", "parties", "scope", "payment", "term", "special"]);
    expect(JSON.stringify(bullets)).not.toMatch(/0\.\d{2}/);
    expect(bullets.every((b) => b.provenance)).toBe(true);
  });

  it("7–8. three- and four-party names stay in the editor and labeled lines", () => {
    const three = normalizeIntakePartyEditorRows(["Alpha LLC", "Beta Inc", "Gamma LP"]);
    expect(three).toEqual(["Alpha LLC", "Beta Inc", "Gamma LP"]);
    const four = addIntakeContractingParty(three);
    expect(four).toHaveLength(4);
    expect(canAddIntakeContractingParty(four.length)).toBe(false);
    expect(canRemoveIntakeContractingParty(3, 4)).toBe(true);
    const labeled = upsertLabeledPartyRows("Draft a services agreement.", four.map((n, i) => n || `Party ${i + 1} LLC`));
    expect(labeled).toMatch(/Party 1: /);
    expect(labeled).toMatch(/Party 4: /);
    expect(namedIntakeContractingParties(["Alpha LLC", "Beta Inc"])).toHaveLength(2);
    expect(removeIntakeContractingParty(four, 3)).toHaveLength(3);
  });

  it("9. adding a person after generation requires an explicit contracting-party or reviewer choice", () => {
    expect(POST_GENERATION_ADD_PARTY_CONTRACTING_LABEL).toMatch(/contracting party and update the agreement/i);
    expect(POST_GENERATION_ADD_PARTY_REVIEWER_LABEL).toMatch(/reviewer only/i);
    expect(formatSignerSetupBeyondGeneratedWarningBody()).toMatch(/reviewer only/i);
    expect(formatSignerSetupBeyondGeneratedWarningBody()).toMatch(/never changed silently/i);
  });
});

describe("core user journey closure — review vs signature", () => {
  it("5–6 and 12. review path needs emails, not signer names or titles", () => {
    expect(PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION).toMatch(/private review links/i);
    expect(PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION).toMatch(/Nothing is emailed automatically/i);
    expect(PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION).not.toMatch(/authorized signer/i);
    expect(
      formatPartySetupRowStatus({
        partyIndex: 0,
        legalEntity: "Acme LLC",
        signerName: "",
        email: "review@acme.test",
        signaturePrepMode: false,
      }),
    ).toBe("Party 1 — complete.");
    expect(
      formatPartySetupRowStatus({
        partyIndex: 1,
        legalEntity: "Beta Inc",
        signerName: "",
        email: "",
        signaturePrepMode: false,
      }),
    ).toBe("Party 2 — reviewer email needed.");
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain('resolvedSendMode === "review"');
    expect(intake).toContain("{signaturePrepMode ? (");
  });

  it("6 and 13. signature path requires an authorized signer for each party", () => {
    expect(PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION).toMatch(/authorized signer for each contracting party/i);
    expect(PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION).toMatch(/Nothing is emailed automatically/i);
    expect(
      formatPartySetupRowStatus({
        partyIndex: 0,
        legalEntity: "Acme LLC",
        signerName: "Ada Signer",
        email: "ada@acme.test",
        signaturePrepMode: true,
      }),
    ).toBe("Party 1 — complete.");
    expect(
      formatPartySetupRowStatus({
        partyIndex: 1,
        legalEntity: "Beta Inc",
        signerName: "Ada Signer",
        email: "",
        signaturePrepMode: true,
      }),
    ).toBe("Party 2 — signer email needed.");
  });

  it("10. a company name does not satisfy the human signer-name requirement", () => {
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: ["Harbor LLC", "Beta Inc"],
      partySignerNames: ["Harbor LLC", "Ira Vee"],
      recipient1Name: "Harbor LLC",
      recipient2Name: "Beta Inc",
      recipient1Email: "ops@harbor.test",
      recipient2Email: "ira@beta.test",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(false);
    expect(gate.blockerMessage).toMatch(/authorized signer name for Harbor LLC/i);
    expect(gate.firstIncompleteFieldKey).toBe("r1-signer-name");
    expect(
      formatPartySetupRowStatus({
        partyIndex: 2,
        legalEntity: "Gamma LP",
        signerName: "",
        email: "g@gamma.test",
        signaturePrepMode: true,
      }),
    ).toBe("Party 3 — authorized signer name needed.");
  });

  it("11. invalid signer email names the exact field remedy", () => {
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: ["Acme LLC", "Beta Inc"],
      partySignerNames: ["Ada Signer", "Ira Vee"],
      recipient1Name: "Acme LLC",
      recipient2Name: "Beta Inc",
      recipient1Email: "ada@acme.test",
      recipient2Email: "not-an-email",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(false);
    expect(gate.blockerMessage).toMatch(/valid signer email for Beta Inc/i);
    expect(gate.firstIncompleteFieldKey).toBe("r2-email");
  });

  it("route choice does not make an incomplete agreement ready for signature or review", () => {
    const audit: PremiumFinalizeAudit = {
      deal_specific_missing_terms: ["Clarify cash controls"],
      placeholder_terms_found: ["[Effective Date]"],
      resolved_strengths: [],
      best_next_step: "edit",
      confidence: "low",
    };
    const reviewChoice = resolveFinalizeReadiness({
      sendMode: "review",
      sendModeTouched: true,
      notOkCount: 0,
      priorityScore: 0,
      lastRefine: null,
      audit,
      documentText: "Compensation to be agreed. [Effective Date]",
    });
    expect(reviewChoice).not.toBe("ready_for_review");
    const signatureChoice = resolveFinalizeReadiness({
      sendMode: "signature",
      sendModeTouched: true,
      notOkCount: 0,
      priorityScore: 0,
      lastRefine: null,
      audit,
      documentText: "Compensation to be agreed. [Effective Date]",
    });
    expect(signatureChoice).not.toBe("ready_for_signature");
  });
});

describe("core user journey closure — readiness and feedback", () => {
  it("exposes one next action from internal dimensions", () => {
    expect(
      resolveCustomerJourneyState({
        hasTwoParties: true,
        hasSubstantivePurpose: true,
        draftCreated: false,
        contentBlockers: false,
        partiesComplete: false,
        signerDetailsComplete: false,
        reviewRecipientsComplete: false,
        deliveryTrack: "none",
        linksCreated: false,
        waitingForReview: false,
        waitingForSignatures: false,
        fullyExecuted: false,
        actionNeedsAttention: false,
        creatingAgreement: true,
      }),
    ).toBe(CUSTOMER_JOURNEY_STATE.creatingAgreement);
    expect(
      resolveCustomerJourneyState({
        hasTwoParties: true,
        hasSubstantivePurpose: true,
        draftCreated: false,
        contentBlockers: false,
        partiesComplete: false,
        signerDetailsComplete: false,
        reviewRecipientsComplete: false,
        deliveryTrack: "none",
        linksCreated: false,
        waitingForReview: false,
        waitingForSignatures: false,
        fullyExecuted: false,
        actionNeedsAttention: false,
      }),
    ).toBe(CUSTOMER_JOURNEY_STATE.readyToCreate);
    expect(
      resolveCustomerJourneyState({
        hasTwoParties: true,
        hasSubstantivePurpose: true,
        draftCreated: true,
        contentBlockers: false,
        partiesComplete: true,
        signerDetailsComplete: false,
        reviewRecipientsComplete: false,
        deliveryTrack: "signature",
        linksCreated: false,
        waitingForReview: false,
        waitingForSignatures: false,
        fullyExecuted: false,
        actionNeedsAttention: false,
      }),
    ).toBe(CUSTOMER_JOURNEY_STATE.addSignerDetails);
    expect(
      resolveCustomerJourneyState({
        hasTwoParties: true,
        hasSubstantivePurpose: true,
        draftCreated: true,
        contentBlockers: true,
        partiesComplete: true,
        signerDetailsComplete: true,
        reviewRecipientsComplete: true,
        deliveryTrack: "signature",
        linksCreated: false,
        waitingForReview: false,
        waitingForSignatures: false,
        fullyExecuted: false,
        actionNeedsAttention: false,
      }),
    ).toBe(CUSTOMER_JOURNEY_STATE.decisionsNeededBeforeSignature);
  });

  it("action feedback answers what succeeded, what remains, and what is next", () => {
    expect(feedbackAfterGeneration({ captured: ["parties", "scope", "price", "term"], confirmBeforeSignature: "Confirm the effective date" })).toMatch(
      /Agreement created/,
    );
    expect(feedbackAfterPartyAdded("Harbor LLC", 3)).toMatch(/Harbor LLC was added as Party 3/);
    expect(feedbackAfterReviewLinksCreated(3)).toMatch(/Nothing was emailed/);
    expect(feedbackAfterReviewLinksAlreadyReady()).toBe("Existing review links were kept. Nothing new was created.");
    expect(feedbackAfterSigningLinksCreated(3)).toMatch(/Each signer receives a different link/);
    expect(feedbackAfterPreparePlacementOpened()).toMatch(/Private signing links appear after placement/);
    expect(
      feedbackAfterLinkFailure({ kind: "signing", saved: true, fieldRemedy: "Correct Party 2’s email" }),
    ).toMatch(/Signing links were not created/);
  });

  it("14–15. reload resume and in-flight retry guards remain wired", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("resume_signer_setup");
    expect(intake).toContain("if (guidedReviewFirstHandoffInFlightRef.current) return");
    expect(intake).toContain("guidedReviewFirstHandoffInFlightRef.current = true");
  });
});
