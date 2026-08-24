/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  rebuildBodyFromIntakeForProFailure,
  isNonHollowBody,
} from "./freeStarterReviewBodyResolver";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  canOpenPaidSessionFinalReviewAfterSigners,
  canStartPaidSessionSignatureTrackFromFinalReview,
  isIllegalSilentSendDisabled,
  isVisibleMissingTenetAskLanding,
  resolvePaidSessionTwoSignerNamesEmailsComplete,
  resolvePaidSessionVisibleDealBody,
  shouldRelaxPaidSessionSignatureTrackGates,
  shouldShowPaidSessionFinalReviewActions,
  shouldShowPaidSessionGeneratingOverlay,
  shouldSkipPaidSessionReviewHydrateWait,
  shouldSuppressFreeMissingTenetAskAfterPay,
  shouldTeardownPaidProSignerMetadataFinalizedLatch,
} from "./paidProPaidSessionLanding";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { PAID_PRO_DELIVERY_TRACK_REVIEW_CTA } from "./paidProDeliveryTrackGtmCopy";
import { PAID_PRO_PREPARE_ESIGN_DECISION_CTA } from "./signerSetupPartyIdentity";
import {
  clearPaidPremiumCompletionSession,
  hasPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";

const PRIYA_DIEGO_INTAKE = `
Priya Shah of Northline Studio is hiring Diego Alvarez from Harbor Marks LLC for a branding project.
Payment: $2,400 total.
Governing law: Texas.
The project involves logo design and brand guidelines delivery within 6 weeks.
`;

const MARCUS_ELENA_INTAKE = `
Marcus Thompson from Apex Consulting Group is engaging Elena Rodriguez of Brightwave Marketing Agency.
Payment: $5,500 for a strategic marketing campaign.
Governing law: California.
Deliverables include market research, competitor analysis, and a comprehensive marketing plan over 8 weeks.
`;

const HOLLOW_DRAFT: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "",
  parties: [
    { name: "Party A", role: "Client" },
    { name: "Party B", role: "Service Provider" },
  ],
  purpose: "covers due. Work.",
  payment_terms: "",
  payment: null,
  duration: null,
  due_date: null,
  effective_date: null,
  additional_terms: null,
};

const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

function dumpCase(intake: string, names: [string, string]) {
  const rebuilt = rebuildBodyFromIntakeForProFailure(intake, HOLLOW_DRAFT);
  expect(rebuilt.length).toBeGreaterThanOrEqual(200);
  expect(rebuilt.length).toBeLessThan(1001);
  expect(isNonHollowBody(rebuilt, intake)).toBe(true);
  markPaidPremiumCompletionSession({ source: "settled_checkout" });
  const visible = resolvePaidSessionVisibleDealBody({
    paidSessionActive: hasPaidPremiumCompletionSession(),
    acceptedCanonicalPlain: rebuilt,
    intakeText: intake,
  });
  expect(visible).toBe(true);
  const twoSigners = resolvePaidSessionTwoSignerNamesEmailsComplete({
    signer1Name: names[0],
    signer1Email: `${names[0].split(" ")[0]!.toLowerCase()}.qa@example.com`,
    signer2Name: names[1],
    signer2Email: `${names[1].split(" ")[0]!.toLowerCase()}.qa@example.com`,
  });
  expect(twoSigners).toBe(true);
  expect(
    canOpenPaidSessionFinalReviewAfterSigners({
      paidSessionActive: true,
      visibleDealBody: visible,
      twoSignerNamesAndEmailsComplete: twoSigners,
    }),
  ).toBe(true);
  expect(
    shouldSkipPaidSessionReviewHydrateWait({
      paidSessionActive: true,
      visibleDealBody: visible,
    }),
  ).toBe(true);
  expect(
    shouldShowPaidSessionGeneratingOverlay({
      phase: "processing",
      hasVisibleDealBody: visible,
    }),
  ).toBe(false);
  expect(
    shouldShowPaidSessionFinalReviewActions({
      paidSessionActive: true,
      visibleDealBody: visible,
      twoSignerNamesAndEmailsComplete: twoSigners,
      signerMetadataFinalized: false,
      signaturePreparationRequested: false,
    }),
  ).toBe(false);
  expect(
    shouldShowPaidSessionFinalReviewActions({
      paidSessionActive: true,
      visibleDealBody: visible,
      twoSignerNamesAndEmailsComplete: twoSigners,
      signerMetadataFinalized: true,
      signaturePreparationRequested: false,
    }),
  ).toBe(true);
  expect(
    shouldShowPaidSessionFinalReviewActions({
      paidSessionActive: true,
      visibleDealBody: visible,
      twoSignerNamesAndEmailsComplete: twoSigners,
      signerMetadataFinalized: true,
      signaturePreparationRequested: true,
    }),
  ).toBe(false);
  // After-pay finalize path: ≥200 rebuild is never 1001 SoT. Teardown must
  // keep paidProSignerMetadataFinalizedLatch so final-review actions stay up.
  expect(hasPaidProSourceOfTruth()).toBe(false);
  const skipHydrateWait = shouldSkipPaidSessionReviewHydrateWait({
    paidSessionActive: true,
    visibleDealBody: visible,
  });
  expect(skipHydrateWait).toBe(true);
  expect(
    shouldTeardownPaidProSignerMetadataFinalizedLatch({
      latch: true,
      hasPaidProSourceOfTruth: false,
      paidSessionVisibleDealBody: visible,
      shouldSkipPaidSessionReviewHydrateWait: skipHydrateWait,
    }),
  ).toBe(false);
  expect(
    shouldShowPaidSessionFinalReviewActions({
      paidSessionActive: true,
      visibleDealBody: visible,
      twoSignerNamesAndEmailsComplete: twoSigners,
      signerMetadataFinalized: true,
      signaturePreparationRequested: false,
    }),
  ).toBe(true);
  return rebuilt;
}

describe("after-pay review-screen gate — Continue after signers", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearPaidPremiumCompletionSession();
  });

  afterEach(() => {
    clearPaidPremiumCompletionSession();
  });

  it("sample dump 1 (Priya/Diego/Texas): paid session + visible rebuild + two signers opens review gate", () => {
    const rebuilt = dumpCase(PRIYA_DIEGO_INTAKE, ["Diego Alvarez", "Priya Shah"]);
    expect(rebuilt).toContain("Priya");
    expect(rebuilt).toContain("Diego");
    expect(rebuilt.toLowerCase()).toContain("texas");

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      intakeText: PRIYA_DIEGO_INTAKE,
      draftPartyNames: ["Priya Shah", "Diego Alvarez"],
      partySignerNames: ["", ""],
      recipient1Name: "Diego Alvarez",
      recipient2Name: "Priya Shah",
      recipient1Email: "diego.alvarez.qa@example.com",
      recipient2Email: "priya.shah.qa@example.com",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(true);
    expect(gate.blockers.some((b) => b.field === "signer_name")).toBe(false);
    expect(gate.ctaLabel).not.toMatch(/title|address/i);
  });

  it("sample dump 2 (Marcus/Elena/California): paid session + visible rebuild + two signers opens review gate", () => {
    const rebuilt = dumpCase(MARCUS_ELENA_INTAKE, ["Marcus Thompson", "Elena Rodriguez"]);
    expect(rebuilt).toContain("Marcus");
    expect(rebuilt).toContain("Elena");
    expect(rebuilt.toLowerCase()).toContain("california");

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      intakeText: MARCUS_ELENA_INTAKE,
      draftPartyNames: ["Marcus Thompson", "Elena Rodriguez"],
      partySignerNames: ["", ""],
      recipient1Name: "Marcus Thompson",
      recipient2Name: "Elena Rodriguez",
      recipient1Email: "marcus.thompson.qa@example.com",
      recipient2Email: "elena.rodriguez.qa@example.com",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(true);
    expect(gate.blockers.some((b) => b.field === "signer_name")).toBe(false);
  });

  it("3 complete names+emails (Priya/Diego/Maya) opens the same final-review gate", () => {
    const intake = `
Priya Shah of Northline Studio, Diego Alvarez of Harbor Marks LLC, and Maya Chen of Westfield Counsel
agree that Harbor Marks will design a logo and brand kit for Northline for $2,400 due on signing,
30 days starting August 22, 2026, Texas law. Maya reviews as counsel.
`;
    const rebuilt = rebuildBodyFromIntakeForProFailure(intake, HOLLOW_DRAFT);
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    expect(isNonHollowBody(rebuilt, intake)).toBe(true);
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    const visible = resolvePaidSessionVisibleDealBody({
      paidSessionActive: hasPaidPremiumCompletionSession(),
      acceptedCanonicalPlain: rebuilt,
      intakeText: intake,
    });
    expect(visible).toBe(true);
    const threeSigners = resolvePaidSessionTwoSignerNamesEmailsComplete({
      signer1Name: "Priya Shah of Northline Studio",
      signer1Email: "priya.shah.qa@example.com",
      signer2Name: "Diego Alvarez of Harbor Marks LLC",
      signer2Email: "diego.alvarez.qa@example.com",
      extraSigners: [{ name: "Maya Chen of Westfield Counsel", email: "maya.chen.qa@example.com" }],
    });
    expect(threeSigners).toBe(true);
    expect(
      resolvePaidSessionTwoSignerNamesEmailsComplete({
        signer1Name: "Priya Shah of Northline Studio",
        signer1Email: "priya.shah.qa@example.com",
        signer2Name: "Diego Alvarez of Harbor Marks LLC",
        signer2Email: "diego.alvarez.qa@example.com",
        extraSigners: [{ name: "Maya Chen of Westfield Counsel", email: "" }],
      }),
    ).toBe(false);
    expect(
      canOpenPaidSessionFinalReviewAfterSigners({
        paidSessionActive: true,
        visibleDealBody: visible,
        twoSignerNamesAndEmailsComplete: threeSigners,
      }),
    ).toBe(true);
    expect(
      shouldShowPaidSessionFinalReviewActions({
        paidSessionActive: true,
        visibleDealBody: visible,
        twoSignerNamesAndEmailsComplete: threeSigners,
        signerMetadataFinalized: true,
        signaturePreparationRequested: false,
      }),
    ).toBe(true);
    expect(
      shouldTeardownPaidProSignerMetadataFinalizedLatch({
        latch: true,
        hasPaidProSourceOfTruth: false,
        paidSessionVisibleDealBody: visible,
        shouldSkipPaidSessionReviewHydrateWait: shouldSkipPaidSessionReviewHydrateWait({
          paidSessionActive: true,
          visibleDealBody: visible,
        }),
      }),
    ).toBe(false);
  });

  it("4 complete names+emails opens the same final-review gate", () => {
    const fourSigners = resolvePaidSessionTwoSignerNamesEmailsComplete({
      signer1Name: "Priya Shah of Northline Studio",
      signer1Email: "priya.shah.qa@example.com",
      signer2Name: "Diego Alvarez of Harbor Marks LLC",
      signer2Email: "diego.alvarez.qa@example.com",
      extraSigners: [
        { name: "Maya Chen of Westfield Counsel", email: "maya.chen.qa@example.com" },
        { name: "Jordan Hale of Pine Street Media LLC", email: "jordan.hale.qa@example.com" },
      ],
    });
    expect(fourSigners).toBe(true);
    expect(
      canOpenPaidSessionFinalReviewAfterSigners({
        paidSessionActive: true,
        visibleDealBody: true,
        twoSignerNamesAndEmailsComplete: fourSigners,
      }),
    ).toBe(true);
    expect(
      shouldShowPaidSessionFinalReviewActions({
        paidSessionActive: true,
        visibleDealBody: true,
        twoSignerNamesAndEmailsComplete: fourSigners,
        signerMetadataFinalized: true,
      }),
    ).toBe(true);
  });

  it("does not open review when only one signer name+email is filled", () => {
    expect(
      resolvePaidSessionTwoSignerNamesEmailsComplete({
        signer1Name: "Diego Alvarez",
        signer1Email: "diego.alvarez.qa@example.com",
        signer2Name: "",
        signer2Email: "",
      }),
    ).toBe(false);
    expect(
      canOpenPaidSessionFinalReviewAfterSigners({
        paidSessionActive: true,
        visibleDealBody: true,
        twoSignerNamesAndEmailsComplete: false,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidSessionFinalReviewActions({
        paidSessionActive: true,
        visibleDealBody: true,
        twoSignerNamesAndEmailsComplete: false,
        signerMetadataFinalized: true,
      }),
    ).toBe(false);
  });

  it("teardown still clears the finalize latch on a true session reset (no visible deal, no SoT)", () => {
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(
      shouldTeardownPaidProSignerMetadataFinalizedLatch({
        latch: true,
        hasPaidProSourceOfTruth: false,
        paidSessionVisibleDealBody: false,
        shouldSkipPaidSessionReviewHydrateWait: false,
      }),
    ).toBe(true);
    expect(
      shouldTeardownPaidProSignerMetadataFinalizedLatch({
        latch: true,
        hasPaidProSourceOfTruth: true,
        paidSessionVisibleDealBody: false,
        shouldSkipPaidSessionReviewHydrateWait: false,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidSessionFinalReviewActions({
        paidSessionActive: true,
        visibleDealBody: false,
        twoSignerNamesAndEmailsComplete: true,
        signerMetadataFinalized: false,
      }),
    ).toBe(false);
  });

  it("does not skip hydrate wait when the card has no visible deal", () => {
    expect(
      shouldSkipPaidSessionReviewHydrateWait({
        paidSessionActive: true,
        visibleDealBody: false,
      }),
    ).toBe(false);
    expect(
      canOpenPaidSessionFinalReviewAfterSigners({
        paidSessionActive: true,
        visibleDealBody: false,
        twoSignerNamesAndEmailsComplete: true,
      }),
    ).toBe(false);
  });

  it("entity parties still require a human signer name (title/address stay optional)", () => {
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: ["Northline Studio LLC", "Harbor Marks LLC"],
      partySignerNames: ["", ""],
      recipient1Name: "Northline Studio LLC",
      recipient2Name: "Harbor Marks LLC",
      recipient1Email: "priya.shah.qa@example.com",
      recipient2Email: "diego.alvarez.qa@example.com",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(false);
    expect(gate.blockers.some((b) => b.field === "signer_name")).toBe(true);
    expect(gate.blockers.some((b) => b.field === "email")).toBe(false);
  });
});

describe("after-pay review-screen gate — intake wiring", () => {
  it("Continue after signers still opens SimpleProFinalReviewScreen (no new page)", () => {
    expect(intakeSrc).toContain("Continue after complete signers opens SimpleProFinalReviewScreen");
    expect(intakeSrc).toContain("<SimpleProFinalReviewScreen");
    expect(intakeSrc).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    expect(intakeSrc).toContain("paidSessionSkipReviewHydrateWait");
    expect(intakeSrc).toContain("canOpenPaidSessionFinalReviewAfterSigners");
    expect(intakeSrc).toContain("nameEmailOnlySignerFields");
  });

  it("visible paid-session deal skips 1001-char SoT / agreement GET and Preparing overlay", () => {
    const finalizeStart = intakeSrc.indexOf(
      "const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback",
    );
    expect(finalizeStart).toBeGreaterThan(-1);
    const finalizeEnd = intakeSrc.indexOf("const continueGuidedFinalReviewToSigning", finalizeStart);
    const finalize = intakeSrc.slice(finalizeStart, finalizeEnd);
    expect(finalize).toContain("paidSessionSkipReviewHydrateWait");
    expect(finalize).toContain("setGuidedFinalReviewExplicitlyOpened(true)");
    expect(finalize).toContain('setCreateFlowPhase("draft_ready_for_review")');
    expect(finalize).toContain("onHomeGuidedTransitionPhase?.(\"review_ready\")");
    expect(finalize).not.toContain("enterGuidedSignatureTrackRoute");
    expect(finalize).not.toContain("/app/esign");

    const completeStart = intakeSrc.indexOf('case "complete_recipient_details"');
    const completeEnd = intakeSrc.indexOf('case "premium_continue_to_signers"', completeStart);
    const complete = intakeSrc.slice(completeStart, completeEnd);
    expect(complete).toContain("paidSessionSkipReviewHydrateWait");
    expect(complete.indexOf("finalizePaidProSignerMetadataAndOpenReviewDecision")).toBeGreaterThan(-1);
    expect(complete.indexOf("finalizePaidProSignerMetadataAndOpenReviewDecision")).toBeLessThan(
      complete.indexOf("void onGenerate()"),
    );
    expect(complete.indexOf("demo_session_signer_details_incomplete")).toBeLessThan(
      complete.indexOf("void onGenerate()"),
    );

    expect(intakeSrc).toContain("if (paidSessionVisibleDealBody)");
    expect(intakeSrc).toContain('onHomeGuidedTransitionPhase("review_ready")');
  });

  it("does not require extra address/title to Continue after two names+emails", () => {
    expect(intakeSrc).toContain("nameEmailOnlySignerFields");
    expect(intakeSrc).toContain("paidSessionTwoSignersReady");
    expect(intakeSrc).toContain("extraSigners: paidSessionExtraSigners");
    expect(intakeSrc).toMatch(/nameEmailOnlySignerFields\s*\n\s*\?\s*false/);
  });

  it("N complete names+emails (2–4) + Complete signer details opens final review without remount or email wipe", () => {
    expect(intakeSrc).toContain("extraSigners: paidSessionExtraSigners");
    expect(intakeSrc).toContain("paidProSignerDetailsGate.complete || paidSessionTwoSignersReady");

    const completeStart = intakeSrc.indexOf('case "complete_recipient_details"');
    const complete = intakeSrc.slice(completeStart, completeStart + 2400);
    expect(complete).toContain("paidSessionTwoSignersReady");
    expect(complete).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    expect(complete).toContain("demo_session_signer_details_incomplete");
    expect(complete).toContain("demo_session_signer_details_incomplete_fallback");
    expect(complete.indexOf("void onGenerate()")).toBeGreaterThan(complete.indexOf("demo_session_signer_details_incomplete"));
    expect(complete).not.toContain("stripPremiumCompletionQueryParam");
    expect(complete).not.toContain('navigate("/app/create")');

    const runPrimaryStart = intakeSrc.indexOf("console.log(\"[CTA CLICK]\", unifiedPrimaryCta)");
    expect(runPrimaryStart).toBeGreaterThan(-1);
    const runPrimaryBlock = intakeSrc.slice(runPrimaryStart, runPrimaryStart + 1400);
    expect(runPrimaryBlock).toContain('unifiedPrimaryCta.action === "complete_recipient_details"');
    expect(runPrimaryBlock).toContain("paidSessionTwoSignersReady");
    expect(runPrimaryBlock).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    expect(runPrimaryBlock).not.toContain("stripPremiumCompletionQueryParam");
    expect(runPrimaryBlock).not.toContain("void onGenerate()");

    const finalizeStart = intakeSrc.indexOf(
      "const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback",
    );
    const finalize = intakeSrc.slice(
      finalizeStart,
      intakeSrc.indexOf("finalizePaidProSignerMetadataAndOpenReviewDecisionRef.current", finalizeStart),
    );
    expect(finalize).toContain("!paidSessionTwoSignersReady");
    expect(finalize).not.toContain("stripPremiumCompletionQueryParam");
    expect(finalize).not.toContain("setRecipient1Email(\"\")");
    expect(finalize).not.toContain("setRecipient2Email(\"\")");
    expect(finalize).not.toContain("setExtraPartyReviewEmails([])");
    expect(finalize).not.toContain("setExtraPartyReviewEmails([");
  });

  it("guided_continue with paid_pro_signer_details_complete finalizes even when inline latch is false", () => {
    const continueStart = intakeSrc.indexOf(
      "Continue after complete signers opens SimpleProFinalReviewScreen",
    );
    expect(continueStart).toBeGreaterThan(-1);
    const continueBlock = intakeSrc.slice(
      continueStart,
      intakeSrc.indexOf("isPaidProReviewDecisionScrollReason", continueStart),
    );
    expect(continueBlock).toContain('cta.reason === "paid_pro_signer_details_complete"');
    expect(continueBlock).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    expect(continueBlock).toContain("paidSessionSkipReviewHydrateWait");
    expect(continueBlock).toContain("paidSessionFinalReviewAfterSignersReady");
    expect(continueBlock).toContain("paidSessionTwoSignersReady");
    expect(continueBlock).toMatch(/paidProInlineSignerSetupLatched\s*\|\|/);
    expect(continueBlock).not.toMatch(
      /paid_pro_signer_details_complete" &&\s*paidProInlineSignerSetupLatched &&/,
    );
    expect(continueBlock).not.toContain("void onGenerate()");
    expect(continueBlock).not.toContain("enterGuidedSignatureTrackRoute");

    const runPrimaryStart = intakeSrc.indexOf("console.log(\"[CTA CLICK]\", unifiedPrimaryCta)");
    expect(runPrimaryStart).toBeGreaterThan(-1);
    const runPrimaryBlock = intakeSrc.slice(runPrimaryStart, runPrimaryStart + 1400);
    expect(runPrimaryBlock).toContain('unifiedPrimaryCta.reason === "paid_pro_signer_details_complete"');
    expect(runPrimaryBlock).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    expect(runPrimaryBlock).toContain("paidSessionSkipReviewHydrateWait");
    expect(runPrimaryBlock).toMatch(/paidProInlineSignerSetupLatched\s*\|\|/);
    expect(runPrimaryBlock).not.toMatch(
      /paid_pro_signer_details_complete" &&\s*paidProInlineSignerSetupLatched &&/,
    );
  });

  it("after two names+emails, Continue opens final-review actions — not a second Continue", () => {
    expect(PAID_PRO_DELIVERY_TRACK_REVIEW_CTA).toBe("Send for review");
    expect(PAID_PRO_PREPARE_ESIGN_DECISION_CTA).toBe("Prepare for signing");
    expect(intakeSrc).toContain("shouldShowPaidSessionFinalReviewActions");
    expect(intakeSrc).toContain("paidSessionFinalReviewDecisionReady");
    expect(intakeSrc).toContain("PAID_PRO_DELIVERY_TRACK_REVIEW_CTA");
    expect(intakeSrc).toContain("PAID_PRO_PREPARE_ESIGN_DECISION_CTA");
    expect(intakeSrc).toContain("onSendForReview={() => void handleProSendForReview()}");
    expect(intakeSrc).toContain('reason: "paid_pro_review_decision_on_card"');

    const afterPayFinalizeCta = intakeSrc.slice(
      intakeSrc.indexOf("After-pay visitor + finalized N signers (2–4): existing final-review decision"),
      intakeSrc.indexOf("After-pay visitor + finalized N signers (2–4): existing final-review decision") + 700,
    );
    expect(afterPayFinalizeCta).toContain("paidSessionFinalReviewDecisionReady");
    expect(afterPayFinalizeCta).toContain("paid_pro_review_decision_on_card");
    expect(afterPayFinalizeCta).not.toContain('"Continue"');
    expect(afterPayFinalizeCta).not.toContain("Links created");

    const suppressStart = intakeSrc.indexOf("suppressFinalReviewActions={");
    expect(suppressStart).toBeGreaterThan(-1);
    const suppressBlock = intakeSrc.slice(suppressStart, suppressStart + 420);
    expect(suppressBlock).toContain("paidProCanonicalReviewSignerSetupActive");
    expect(suppressBlock).toContain("!paidSessionFinalReviewDecisionReady");

    const chooserStart = intakeSrc.indexOf("const showPaidProForcedFirstReviewTrackChooser");
    const chooser = intakeSrc.slice(chooserStart, chooserStart + 700);
    expect(chooser).toContain("if (paidSessionFinalReviewDecisionReady) return false");

    expect(intakeSrc).toContain("!paidSessionFinalReviewDecisionReady &&");
  });

  it("teardown effect keeps the finalize latch on a paid session with a visible deal", () => {
    expect(intakeSrc).toContain("shouldTeardownPaidProSignerMetadataFinalizedLatch");
    const teardownStart = intakeSrc.indexOf(
      "shouldTeardownPaidProSignerMetadataFinalizedLatch({",
    );
    expect(teardownStart).toBeGreaterThan(-1);
    const teardown = intakeSrc.slice(teardownStart, teardownStart + 520);
    expect(teardown).toContain("paidSessionVisibleDealBody");
    expect(teardown).toContain(
      "shouldSkipPaidSessionReviewHydrateWait: paidSessionSkipReviewHydrateWait",
    );
    expect(teardown).toContain("hasPaidProSourceOfTruth: hasPaidProSourceOfTruth()");
    expect(teardown).toContain("setPaidProSignerMetadataFinalizedLatch(false)");
    expect(intakeSrc).not.toMatch(
      /if \(paidProSignerMetadataFinalizedLatch && !hasPaidProSourceOfTruth\(\)\) \{\s*setPaidProSignerMetadataFinalizedLatch\(false\);/,
    );
  });

  it("after-pay leftover free missing-tenet ask is cleared and not shown", () => {
    expect(intakeSrc).toContain("shouldSuppressFreeMissingTenetAskAfterPay");
    expect(intakeSrc).toContain("freeMissingTenetAskVisible");
    expect(intakeSrc).toContain("suppressFreeMissingTenetAskAfterPay");
    expect(intakeSrc).toContain("paidSessionSignerEmailsInteractive");
    expect(intakeSrc).toContain("shouldKeepPaidSessionSignerEmailsInteractive");
    const beginAsk = intakeSrc.indexOf("const beginFreeMissingTenetAsk");
    expect(beginAsk).toBeGreaterThan(-1);
    const beginAskEnd = intakeSrc.indexOf("const resolvePaidCreateGateBypassContext", beginAsk);
    const beginAskBody = intakeSrc.slice(beginAsk, beginAskEnd);
    expect(beginAskBody).toContain("shouldSuppressFreeMissingTenetAskAfterPay");
    expect(beginAskBody).toContain("setFreeMissingTenetAsk(null)");
    expect(beginAskBody.indexOf("setFreeMissingTenetAsk(null)")).toBeLessThan(
      beginAskBody.indexOf("evaluateFreeStarterMissingTenetAsk"),
    );
    expect(beginAskBody.indexOf("return true")).toBeGreaterThan(-1);
    expect(beginAskBody.indexOf("return true")).toBeLessThan(
      beginAskBody.indexOf("evaluateFreeStarterMissingTenetAsk"),
    );
    expect(beginAskBody.indexOf("return true")).toBeGreaterThan(
      beginAskBody.indexOf("setFreeMissingTenetAsk(null)"),
    );

    const leftoverStart = intakeSrc.indexOf("{freeMissingTenetAskVisible &&");
    expect(leftoverStart).toBeGreaterThan(-1);
    expect(intakeSrc).not.toMatch(
      /\{freeMissingTenetAsk &&\s*\n\s*!\(createProductionTwoPane && createUiStage === CreateUiStage\.INPUT/,
    );

    expect(
      shouldSuppressFreeMissingTenetAskAfterPay({
        paidSessionActive: true,
        premiumCompletionReturn: true,
      }),
    ).toBe(true);
    expect(
      isVisibleMissingTenetAskLanding({
        phase: null,
        freeStarterAskQuestionCount: 3,
        paidSessionActive: true,
        premiumCompletionReturn: true,
      }),
    ).toBe(false);
  });
});

describe("after-pay Send for signature — names+emails start the existing signing track", () => {
  it("2, 3, and 4 complete name+email slots may start the signing track", () => {
    const two = resolvePaidSessionTwoSignerNamesEmailsComplete({
      signer1Name: "Priya Shah",
      signer1Email: "priya.shah.qa@example.com",
      signer2Name: "Diego Alvarez",
      signer2Email: "diego.alvarez.qa@example.com",
    });
    const three = resolvePaidSessionTwoSignerNamesEmailsComplete({
      signer1Name: "Priya Shah",
      signer1Email: "priya.shah.qa@example.com",
      signer2Name: "Diego Alvarez",
      signer2Email: "diego.alvarez.qa@example.com",
      extraSigners: [{ name: "Sam Rivera", email: "sam.rivera.qa@example.com" }],
    });
    const four = resolvePaidSessionTwoSignerNamesEmailsComplete({
      signer1Name: "Priya Shah",
      signer1Email: "priya.shah.qa@example.com",
      signer2Name: "Diego Alvarez",
      signer2Email: "diego.alvarez.qa@example.com",
      extraSigners: [
        { name: "Sam Rivera", email: "sam.rivera.qa@example.com" },
        { name: "Jordan Lee", email: "jordan.lee.qa@example.com" },
      ],
    });
    expect(two).toBe(true);
    expect(three).toBe(true);
    expect(four).toBe(true);
    expect(canStartPaidSessionSignatureTrackFromFinalReview({ namesAndEmailsComplete: two })).toBe(true);
    expect(canStartPaidSessionSignatureTrackFromFinalReview({ namesAndEmailsComplete: three })).toBe(true);
    expect(canStartPaidSessionSignatureTrackFromFinalReview({ namesAndEmailsComplete: four })).toBe(true);
  });

  it("does not require authorized-signer-name / title / address once names+emails are complete", () => {
    expect(
      canStartPaidSessionSignatureTrackFromFinalReview({ namesAndEmailsComplete: true }),
    ).toBe(true);
    expect(
      shouldRelaxPaidSessionSignatureTrackGates({
        paidSessionActive: true,
        visibleDealBody: true,
        namesAndEmailsComplete: true,
      }),
    ).toBe(true);
    expect(intakeSrc).not.toMatch(
      /canStartPaidSessionSignatureTrackFromFinalReview[\s\S]{0,400}authorized.?signer.?name/,
    );
  });

  it("incomplete extra party email cannot start the signing track", () => {
    const incompleteThird = resolvePaidSessionTwoSignerNamesEmailsComplete({
      signer1Name: "Priya Shah",
      signer1Email: "priya.shah.qa@example.com",
      signer2Name: "Diego Alvarez",
      signer2Email: "diego.alvarez.qa@example.com",
      extraSigners: [{ name: "Sam Rivera", email: "" }],
    });
    expect(incompleteThird).toBe(false);
    expect(
      canStartPaidSessionSignatureTrackFromFinalReview({ namesAndEmailsComplete: incompleteThird }),
    ).toBe(false);
  });

  it("disabled-without-reason is illegal when names+emails are complete", () => {
    expect(
      isIllegalSilentSendDisabled({
        namesAndEmailsComplete: true,
        sendDisabled: true,
        sendDisabledReason: null,
      }),
    ).toBe(true);
    expect(
      isIllegalSilentSendDisabled({
        namesAndEmailsComplete: true,
        sendDisabled: true,
        sendDisabledReason: "Saving agreement…",
      }),
    ).toBe(false);
    expect(
      isIllegalSilentSendDisabled({
        namesAndEmailsComplete: true,
        sendDisabled: false,
        sendDisabledReason: null,
      }),
    ).toBe(false);
  });

  it("click path is wired to handleProSendForSignature / enterGuidedSignatureTrackRoute", () => {
    const sendStart = intakeSrc.indexOf("const handleProSendForSignature = React.useCallback");
    expect(sendStart).toBeGreaterThan(-1);
    const sendEnd = intakeSrc.indexOf("const handlePaidProPrepareSignaturesFromFirstReview", sendStart);
    const sendBlock = intakeSrc.slice(sendStart, sendEnd > sendStart ? sendEnd : sendStart + 4500);
    expect(sendBlock).toContain("canStartPaidSessionSignatureTrackFromFinalReview");
    expect(sendBlock).toContain("paidSessionTwoSignersReady");
    expect(sendBlock).toContain('traceSigningAdvance("handleProSendForSignature:names_emails_complete")');
    expect(sendBlock).toContain("feedbackCreatingLinks(\"signing\")");
    expect(sendBlock).toContain("enterGuidedSignatureTrackRoute");
    expect(sendBlock).not.toContain("authorized-signer-name");
    const namesAt = sendBlock.indexOf("handleProSendForSignature:names_emails_complete");
    const incompleteAt = sendBlock.indexOf("handleProSendForSignature:finalize_incomplete");
    expect(namesAt).toBeGreaterThan(-1);
    expect(incompleteAt).toBeGreaterThan(namesAt);

    const screenMount = intakeSrc.slice(
      intakeSrc.indexOf("<SimpleProFinalReviewScreen"),
      intakeSrc.indexOf("onSendForReview={() => void handleProSendForReview()}"),
    );
    expect(screenMount).toContain("canStartPaidSessionSignatureTrackFromFinalReview");
    expect(screenMount).toContain("void handleProSendForSignature()");

    const trackStart = intakeSrc.indexOf("const enterGuidedSignatureTrackRoute = React.useCallback");
    const track = intakeSrc.slice(trackStart, trackStart + 25000);
    expect(track).toContain("shouldRelaxPaidSessionSignatureTrackGates");
    expect(track).toContain("relaxPaidSessionSignatureGates");
    expect(track).toContain("PAID_PRO_FALLBACK_REBUILD_MIN_LEN");
    expect(track).toContain("draftSnapshotRef.current");
    expect(track).not.toMatch(/\bdraftRef\b/);
    expect(track).toContain("relaxPaidSessionCorpusAssert: relaxPaidSessionSignatureGates");
    expect(track).toContain("failSignatureTrackVisible");
  });

  it("Send for review path is unchanged", () => {
    const reviewStart = intakeSrc.indexOf("const handleProSendForReview = React.useCallback");
    const reviewEnd = intakeSrc.indexOf("const handleFinalizeRoutePrimaryAction", reviewStart);
    const review = intakeSrc.slice(reviewStart, reviewEnd > reviewStart ? reviewEnd : reviewStart + 4000);
    expect(review).toContain("completeGuidedPaidProReviewFirstHandoff(\"simple_pro_send_for_review\")");
    expect(review).toContain("enterFinalReviewRecipientSetup(\"review_only\")");
    expect(review).not.toContain("enterGuidedSignatureTrackRoute");
    expect(intakeSrc).toContain("onSendForReview={() => void handleProSendForReview()}");
  });
});
