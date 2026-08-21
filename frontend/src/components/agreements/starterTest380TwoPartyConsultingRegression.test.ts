import { describe, expect, it } from "vitest";
import {
  dedupeEntityCandidatesToLegalParties,
} from "../../agreement/partyPlaceholderDisplay";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { resolveStarterGatePartyLegalEntities } from "./labeledPartyBlockParse";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  assessStarterComplexityGate,
  detectSignerCandidateOverflow,
  rejectIneligibleStarterDraftAfterParse,
  shouldDismissStarterPreparingOverlayForProGate,
  shouldResolveStarterHomeTransitionToReviewReady,
} from "./starterMultiPartyProGate";
import { TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE } from "./starterTest379FourPartyLogisticsRegression.test";

export const TEST380_TWO_PARTY_CONSULTING_INTAKE = `
Create a simple consulting agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.
Red Mesa hires Harbor Peak for workflow automation consulting for three months.
Red Mesa pays Harbor Peak $4,000/month.
Either party may terminate with 15 days' notice.
Texas law applies. Electronic signatures okay.
`.trim();

const THREE_DISTINCT_ENTITIES_INTAKE = `
Agreement among Alpha Logistics LLC, Beta Systems Inc., and Gamma Holdings LLC for warehouse software.
Texas law governs.
`.trim();

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false };

function parseStarterDraft(intake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(
    {
      title: "",
      jurisdiction: "",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    },
    intake,
    true,
    defaultIntakePartyRoleLabels(),
  );
}

describe("Test380 two-party consulting starter gate", () => {
  it("extractedEntityCount resolves to 2 for Red Mesa / Harbor Peak consulting prompt", () => {
    const entities = resolveStarterGatePartyLegalEntities(TEST380_TWO_PARTY_CONSULTING_INTAKE);
    expect(entities).toHaveLength(2);
    expect(entities).toContain("Red Mesa Logistics LLC");
    expect(entities).toContain("Harbor Peak Automation LLC");
  });

  it("does not false-positive gate Test380 to multi_party_pro_required", () => {
    const gate = assessStarterComplexityGate(TEST380_TWO_PARTY_CONSULTING_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.partyCount).toBe(2);
    expect(gate.parties).toHaveLength(2);
  });

  it("three months duration does not count as signer overflow", () => {
    expect(detectSignerCandidateOverflow(TEST380_TWO_PARTY_CONSULTING_INTAKE)).toBe(false);
  });

  it("short aliases dedupe into full legal entity names", () => {
    const deduped = dedupeEntityCandidatesToLegalParties([
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
      "Red Mesa",
      "Harbor Peak",
      "Texas law",
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped).toContain("Red Mesa Logistics LLC");
    expect(deduped).toContain("Harbor Peak Automation LLC");
  });

  it("alias-heavy prose extraction still yields only two legal parties for starter gate", () => {
    const withAliases = `${TEST380_TWO_PARTY_CONSULTING_INTAKE}
Red Mesa will provide updates. Harbor Peak will deliver milestones.`;
    expect(resolveStarterGatePartyLegalEntities(withAliases)).toHaveLength(2);
    expect(assessStarterComplexityGate(withAliases).required).toBe(false);
  });

  it("renders starter review draft for Test380", () => {
    const parsed = parseStarterDraft(TEST380_TWO_PARTY_CONSULTING_INTAKE);
    expect(rejectIneligibleStarterDraftAfterParse(TEST380_TWO_PARTY_CONSULTING_INTAKE, parsed)).toBe(
      false,
    );
    const preview = buildAgreementPreviewText(parsed, {
      starterPreview: true,
      intakeText: TEST380_TWO_PARTY_CONSULTING_INTAKE,
    });
    expect(preview.length).toBeGreaterThan(200);
    expect(preview).toMatch(/Red Mesa Logistics LLC/i);
    expect(preview).toMatch(/Harbor Peak Automation LLC/i);
  });

  it("Test379 four-party logistics prompt still gates to Pro", () => {
    expect(assessStarterComplexityGate(TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE).required).toBe(
      true,
    );
  });

  it("three distinct legal entities still gate to Pro", () => {
    const gate = assessStarterComplexityGate(THREE_DISTINCT_ENTITIES_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.parties.length).toBeGreaterThan(2);
  });

  it("dismisses preparing overlay when multi_party_pro_required is applied without draft", () => {
    expect(
      shouldDismissStarterPreparingOverlayForProGate({
        createFlowPhase: "multi_party_pro_required",
        hasDraft: false,
        displayPhase: "preparing_review",
      }),
    ).toBe(true);
    expect(
      shouldDismissStarterPreparingOverlayForProGate({
        createFlowPhase: "multi_party_pro_required",
        hasDraft: false,
        displayPhase: "generating_draft",
      }),
    ).toBe(true);
    expect(
      shouldDismissStarterPreparingOverlayForProGate({
        createFlowPhase: "multi_party_pro_required",
        hasDraft: true,
        displayPhase: "preparing_review",
      }),
    ).toBe(false);
    expect(
      shouldDismissStarterPreparingOverlayForProGate({
        createFlowPhase: "draft_ready_for_review",
        hasDraft: false,
        displayPhase: "preparing_review",
      }),
    ).toBe(false);
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: "DRAFT",
        createFlowPhase: "multi_party_pro_required",
        isGenerating: false,
        starterMultiPartyProGate: { required: true },
      }),
    ).toBe(true);
  });

  it("dismisses home transition overlay on failsafe timeout (emptyAuthorityPrepFailSafe)", () => {
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: "INPUT",
        createFlowPhase: "capturing_input",
        isGenerating: false,
        emptyAuthorityPrepFailSafe: true,
      }),
    ).toBe(true);
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: "INPUT",
        createFlowPhase: "generating_draft",
        isGenerating: true,
        emptyAuthorityPrepFailSafe: true,
      }),
    ).toBe(true);
  });

  it("dismisses home transition overlay on hard error", () => {
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: "INPUT",
        createFlowPhase: "capturing_input",
        isGenerating: false,
        hardError: "LawDog could not save this draft. Try again in a moment.",
      }),
    ).toBe(true);
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: "INPUT",
        createFlowPhase: "capturing_input",
        isGenerating: true,
        hardError: "Network error — try again in a moment.",
      }),
    ).toBe(false);
  });

  it("does not dismiss overlay when no failure conditions and no draft", () => {
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: "INPUT",
        createFlowPhase: "capturing_input",
        isGenerating: false,
        emptyAuthorityPrepFailSafe: false,
        hardError: null,
      }),
    ).toBe(false);
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: "INPUT",
        createFlowPhase: "generating_draft",
        isGenerating: true,
        emptyAuthorityPrepFailSafe: false,
        hardError: null,
      }),
    ).toBe(false);
  });

  it("dismisses home transition overlay on intake clarification (missing_named_parties)", () => {
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: "INPUT",
        createFlowPhase: "capturing_input",
        isGenerating: false,
        intakeClarification: {
          kind: "missing_named_parties",
          title: "Name the parties to continue",
          why: "We can see commercial details, but not clear legal names.",
          whatWeHeard: [],
          guidedSteps: [],
          suggestedRewrite: null,
          primaryCtaLabel: "Use suggested draft request",
          secondaryCtaLabel: "I'll add parties myself",
        },
      }),
    ).toBe(true);
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: "INPUT",
        createFlowPhase: "capturing_input",
        isGenerating: true,
        intakeClarification: { kind: "missing_named_parties" },
      }),
    ).toBe(false);
  });
});
