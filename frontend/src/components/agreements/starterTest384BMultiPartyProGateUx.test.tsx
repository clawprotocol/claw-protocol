/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StarterMultiPartyProGatePanel } from "./StarterMultiPartyProGatePanel";
import {
  assessStarterComplexityGate,
  buildStarterProCheckoutPendingDraft,
  MULTI_PARTY_PRO_GATE_BODY,
  MULTI_PARTY_PRO_GATE_PRIMARY_CTA,
  resolveStarterMultiPartyProGatePresentation,
  shouldHideStarterReviewCtaForCreateFlowPhase,
} from "./starterMultiPartyProGate";
import { countRealParties } from "./starterPartyLimits";
import { TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE } from "./starterTest384ThreePartyQuotedRoleRegression.test";
import { TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE } from "./starterTest379FourPartyLogisticsRegression.test";
import { TEST380_TWO_PARTY_CONSULTING_INTAKE } from "./starterTest380TwoPartyConsultingRegression.test";
import { TEST381_SHORT_NAME_CONSULTING_INTAKE } from "./starterTest381QualityRegression.test";
import { TEST382_ROLE_ALIAS_PRO_INTAKE } from "./starterTest382ReadonlySignerCountRegression.test";

describe("Test384B multi-party Pro gate UX", () => {
  const gate384 = assessStarterComplexityGate(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE);

  it("shows party-count-specific copy for three-party intake", () => {
    const presentation = resolveStarterMultiPartyProGatePresentation(gate384);
    expect(presentation.title).toBe("This agreement includes 3 parties and requires Pro.");
    expect(presentation.body).toBe(MULTI_PARTY_PRO_GATE_BODY);
    expect(presentation.primaryCtaLabel).toBe(MULTI_PARTY_PRO_GATE_PRIMARY_CTA);
    expect(presentation.showSimplifiedStarterOption).toBe(false);
    expect(presentation.hideStarterReviewCta).toBe(true);
  });

  it("renders multi-party panel without simplified starter or review CTAs", () => {
    render(
      <StarterMultiPartyProGatePanel
        assessment={gate384}
        onBuildPro={() => {}}
        onEditPrompt={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: /includes 3 parties and requires Pro/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: MULTI_PARTY_PRO_GATE_PRIMARY_CTA })).toBeTruthy();
    expect(screen.getByRole("button", { name: /edit prompt/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /try simplified starting point/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^review$/i })).toBeNull();
    expect(screen.queryByText(/consulting \/ business agreement with custom terms/i)).toBeNull();
  });

  it("hides starter review CTA for multi_party_pro_required phase", () => {
    expect(shouldHideStarterReviewCtaForCreateFlowPhase("multi_party_pro_required")).toBe(true);
    expect(shouldHideStarterReviewCtaForCreateFlowPhase("complexity_choice_required")).toBe(false);
    expect(shouldHideStarterReviewCtaForCreateFlowPhase("draft_ready_for_review")).toBe(false);
  });

  it("continue with Pro preserves all three parties", () => {
    const pending = buildStarterProCheckoutPendingDraft(TEST384_THREE_PARTY_QUOTED_ROLE_INTAKE);
    expect(countRealParties(pending.parties)).toBe(3);
  });
});

describe("Test384B regression guards", () => {
  it("Test379 four-party gate uses multi-party-specific copy", () => {
    const gate = assessStarterComplexityGate(TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE);
    const presentation = resolveStarterMultiPartyProGatePresentation(gate);
    expect(presentation.title).toMatch(/includes 4 parties and requires Pro/i);
    expect(presentation.showSimplifiedStarterOption).toBe(false);
  });

  it("Test380 two-party consulting intake stays starter-eligible", () => {
    expect(assessStarterComplexityGate(TEST380_TWO_PARTY_CONSULTING_INTAKE).required).toBe(false);
  });

  it("Test381 two-party short-name intake stays starter-eligible", () => {
    expect(assessStarterComplexityGate(TEST381_SHORT_NAME_CONSULTING_INTAKE).required).toBe(false);
  });

  it("Test382 two-party role-alias intake stays starter-eligible", () => {
    expect(assessStarterComplexityGate(TEST382_ROLE_ALIAS_PRO_INTAKE).required).toBe(false);
  });
});
