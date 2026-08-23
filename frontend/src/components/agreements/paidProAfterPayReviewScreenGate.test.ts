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
  resolvePaidSessionTwoSignerNamesEmailsComplete,
  resolvePaidSessionVisibleDealBody,
  shouldShowPaidSessionGeneratingOverlay,
  shouldSkipPaidSessionReviewHydrateWait,
} from "./paidProPaidSessionLanding";
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
    const complete = intakeSrc.slice(completeStart, completeStart + 1800);
    expect(complete).toContain("paidSessionSkipReviewHydrateWait");
    expect(complete.indexOf("finalizePaidProSignerMetadataAndOpenReviewDecision")).toBeGreaterThan(-1);
    expect(complete.indexOf("void onGenerate()")).toBe(-1);

    expect(intakeSrc).toContain("if (paidSessionVisibleDealBody)");
    expect(intakeSrc).toContain('onHomeGuidedTransitionPhase("review_ready")');
  });

  it("does not require extra address/title to Continue after two names+emails", () => {
    expect(intakeSrc).toContain("nameEmailOnlySignerFields");
    expect(intakeSrc).toContain("paidSessionTwoSignersReady");
    expect(intakeSrc).toMatch(/nameEmailOnlySignerFields\s*\n\s*\?\s*false/);
  });
});
