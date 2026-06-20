import { describe, expect, it } from "vitest";
import { countRealParties } from "./starterPartyLimits";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  parseQuotedRolePartyLines,
  quotedRolePartyLegalEntities,
  resolveStarterGatePartyLegalEntities,
} from "./labeledPartyBlockParse";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import {
  assessStarterComplexityGate,
  buildStarterProCheckoutPendingDraft,
  rejectIneligibleStarterDraftAfterParse,
  shouldDismissStarterPreparingOverlayForProGate,
  shouldResolveStarterHomeTransitionToReviewReady,
} from "./starterMultiPartyProGate";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE } from "./starterTest379FourPartyLogisticsRegression.test";
import { TEST380_TWO_PARTY_CONSULTING_INTAKE } from "./starterTest380TwoPartyConsultingRegression.test";
import { TEST381_SHORT_NAME_CONSULTING_INTAKE } from "./starterTest381QualityRegression.test";
import { TEST382_ROLE_ALIAS_PRO_INTAKE } from "./starterTest382ReadonlySignerCountRegression.test";
import { CreateUiStage } from "./createUiStage";

export const TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE = `
Create an agreement between:

North Star Manufacturing LLC ("Client")
Summit Process Automation LLC ("Prime Contractor")
Delta Integration Services LLC ("Subcontractor")

Client hires Prime Contractor to oversee a factory automation upgrade.

Prime Contractor may engage Subcontractor to perform onsite installation and testing.

Client will pay Prime Contractor $120,000.

Prime Contractor will pay Subcontractor separately.

The project will last nine months.

Oklahoma law applies.

Electronic signatures are permitted.
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

describe("Test384 three-party quoted-role Pro gate", () => {
  it("parses all three quoted-role legal entities with role labels", () => {
    const quoted = parseQuotedRolePartyLines(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE);
    expect(quoted).toHaveLength(3);
    expect(quoted.map((entry) => entry.legalEntity)).toEqual([
      "North Star Manufacturing LLC",
      "Summit Process Automation LLC",
      "Delta Integration Services LLC",
    ]);
    expect(quoted[0]?.roleLabel).toBe("Client");
    expect(quoted[1]?.roleLabel).toBe("Prime Contractor");
    expect(quoted[2]?.roleLabel).toBe("Subcontractor");
  });

  it("gates to Pro with extractedEntityCount 3 and no starter draft eligibility", () => {
    const gate = assessStarterComplexityGate(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
    expect(gate.parties).toHaveLength(3);
    expect(gate.partyCount).toBe(3);
    expect(resolveStarterGatePartyLegalEntities(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE)).toHaveLength(3);
    expect(quotedRolePartyLegalEntities(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE)).toHaveLength(3);

    const parsed = parseStarterDraft(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE);
    expect(rejectIneligibleStarterDraftAfterParse(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE, parsed)).toBe(true);
  });

  it("resolves canonical signer authority to 3 for Test384 intake", () => {
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE,
    });
    expect(resolution.count).toBe(3);
    expect(resolution.source).toBe("labeled_parties");
    expect(resolution.labeledCount).toBe(3);
    expect(resolution.partySlotCount).toBe(3);
  });

  it("preserves three parties when building the Pro checkout pending draft", () => {
    const pending = buildStarterProCheckoutPendingDraft(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE);
    expect(countRealParties(pending.parties)).toBe(3);
    expect(pending.parties.map((party) => party.name)).toEqual([
      "North Star Manufacturing LLC",
      "Summit Process Automation LLC",
      "Delta Integration Services LLC",
    ]);
  });

  it("structured intake model carries three parties and role hints", () => {
    const structured = parseIntakeToStructuredAgreement(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE);
    expect(structured.parties).toHaveLength(3);
    expect(structured.partyRoleHints["north star manufacturing llc"]).toBe("Client");
    expect(structured.partyRoleHints["summit process automation llc"]).toBe("Prime Contractor");
    expect(structured.partyRoleHints["delta integration services llc"]).toBe("Subcontractor");
  });

  it("dismisses preparing overlay and home transition when multi_party_pro_required has no draft", () => {
    const gate = assessStarterComplexityGate(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE);
    expect(
      shouldDismissStarterPreparingOverlayForProGate({
        createFlowPhase: "multi_party_pro_required",
        hasDraft: false,
        displayPhase: "preparing_review",
      }),
    ).toBe(true);
    expect(
      shouldResolveStarterHomeTransitionToReviewReady({
        draft: null,
        createUiStage: CreateUiStage.DRAFT,
        createFlowPhase: "multi_party_pro_required",
        isGenerating: false,
        starterMultiPartyProGate: gate,
      }),
    ).toBe(true);
  });
});

describe("Test384 regression guards", () => {
  it("Test379 remains Pro-gated with four parties", () => {
    const gate = assessStarterComplexityGate(TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.partyCount).toBeGreaterThanOrEqual(4);
  });

  it("Test380 remains two-party starter", () => {
    const gate = assessStarterComplexityGate(TEST380_TWO_PARTY_CONSULTING_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.partyCount).toBe(2);
    expect(resolveAuthoritativeSignerCount({ intakeText: TEST380_TWO_PARTY_CONSULTING_INTAKE }).count).toBe(2);
  });

  it("Test381 remains two-party starter", () => {
    const gate = assessStarterComplexityGate(TEST381_SHORT_NAME_CONSULTING_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.partyCount).toBe(2);
    expect(resolveAuthoritativeSignerCount({ intakeText: TEST381_SHORT_NAME_CONSULTING_INTAKE }).count).toBe(2);
  });

  it("Test382 remains two-party starter", () => {
    const parties = resolveStarterGatePartyLegalEntities(TEST382_ROLE_ALIAS_PRO_INTAKE);
    expect(parties).toHaveLength(2);
    const gate = assessStarterComplexityGate(TEST382_ROLE_ALIAS_PRO_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.partyCount).toBe(2);
    expect(resolveAuthoritativeSignerCount({ intakeText: TEST382_ROLE_ALIAS_PRO_INTAKE }).count).toBe(2);
  });
});
