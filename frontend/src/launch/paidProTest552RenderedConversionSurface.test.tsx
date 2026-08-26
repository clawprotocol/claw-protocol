/** @vitest-environment jsdom */
/**
 * TEST552 — rendered anonymous Free Starter conversion surface (extends TEST550 Case 9).
 *
 * Mounts production StarterDraftDocumentSurface with a real starter preview body and
 * verifies AgreementBuilderIntake wiring for unified checkout CTA (not comparison card).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildStarterAgreementPreviewForReview } from "../components/agreements/agreementPreviewFromDraft";
import { shouldShowCreateFlowStarterProRefineUpsell } from "../components/agreements/authoritativeCreateFlowReviewShell";
import { resolveIsFreeStreamlineDraftReview } from "../components/agreements/freeStreamlineDraftReview";
import { enrichStarterPreviewPartiesFromIntake } from "../components/agreements/starterOpeningPartyPreserve";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import { hasPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";
import { CreateUiStage } from "../components/agreements/createUiStage";
import { StarterDraftDocumentSurface } from "../components/agreements/StarterDraftDocumentSurface";
import { TEST550_CEDAR, TEST550_CEDAR_NORTHWIND_INTAKE, TEST550_NORTHWIND } from "../components/agreements/paidProTest550Fixtures";
import {
  PRO_CTA_CONTINUE,
  PRO_CTA_KEEP_FREE_DRAFT,
  PRO_UPGRADE_CARD_HEADING,
} from "./simpleProduct/proConversionCopy";
import { PRO_CAN_TIGHTEN_HEADING } from "./simpleProduct/proTransformationCopy";
import { logStarterUpgradeTransition } from "./simpleProduct/starterUpgradeTransition";

const intakeSrc = readFileSync(join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"), "utf8");
const cardSrc = readFileSync(join(__dirname, "../components/agreements/ProConversionComparisonCard.tsx"), "utf8");

function cedarDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    purpose: "operations consulting",
    payment_terms: "$18,000 in three monthly installments",
    duration: "three months",
    parties: [
      { name: TEST550_CEDAR, role: "Service Provider" },
      { name: TEST550_NORTHWIND, role: "Service Provider" },
    ],
    agreement_family: "services_agreement",
    additional_terms: "",
    termination_summary: "",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
  };
}

function productionStarterPreviewBody(): string {
  const enriched = enrichStarterPreviewPartiesFromIntake(cedarDraft(), TEST550_CEDAR_NORTHWIND_INTAKE);
  return buildStarterAgreementPreviewForReview(enriched, { intakeText: TEST550_CEDAR_NORTHWIND_INTAKE });
}

const streamlineBase = {
  simpleProductFlow: true,
  liveWorkspaceTwoPane: true,
  createProductionTwoPane: true,
  createUiStage: CreateUiStage.DRAFT,
  createFlowPhase: "draft_ready_for_review" as const,
  hasDraft: true,
  paidProAuthoritative: false,
  premiumPaidDocumentSurface: false,
  premiumPersistedFlowActive: false,
  premiumSendPathUnlocked: false,
  hasPaidPremiumCompletionSession,
  showUpgradeToFullDraftOnReview: true,
  tier: "free" as const,
  workspaceProEntitled: false,
};

function launchProCheckoutHandlerBlock(): string {
  const anchor = 'case "launch_pro_checkout":';
  const start = intakeSrc.indexOf(anchor);
  expect(start).toBeGreaterThan(0);
  return intakeSrc.slice(start, start + 1200);
}

function showUpgradeProCtaBlock(): string {
  const anchor = "action: \"launch_pro_checkout\"";
  const start = intakeSrc.indexOf(anchor);
  expect(start).toBeGreaterThan(0);
  return intakeSrc.slice(start - 400, start + 200);
}


beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TEST552 — rendered anonymous Free Starter conversion surface", () => {
  it("Case 9 proof — starter document visible in production document surface", () => {
    const body = productionStarterPreviewBody();
    expect(body).toContain(TEST550_NORTHWIND);
    expect(body).toContain(TEST550_CEDAR);

    render(<StarterDraftDocumentSurface value={body} onChange={() => {}} />);
    expect(screen.getByLabelText(/agreement document preview/i).textContent).toContain(TEST550_NORTHWIND);
    expect(screen.getByLabelText(/agreement document preview/i).textContent).toContain(TEST550_CEDAR);
    expect(screen.getByTestId("starter-draft-copy-text")).toBeTruthy();
  });

  it("Case 9 proof — unified checkout CTA wiring, comparison card shows when parties complete", () => {
    expect(resolveIsFreeStreamlineDraftReview(streamlineBase)).toBe(true);

    // Incomplete parties: card does NOT show (Fix details should appear instead)
    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput: { tier: "free", workspaceProEntitled: false },
        hasPaidPremiumCompletionSession,
        authoritativePremiumUiCommitted: false,
        paidProAuthoritative: false,
        suppressIntakePremiumUpsell: false,
        proAgreementEntitled: false,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        belowDocumentRefineSectionParentEligible: true,
        premiumPaidDocumentSurface: false,
        showStarterProRefineUpsellCardEligible: true,
        draftPartiesAreComplete: false,
      }),
    ).toBe(false);

    // Complete parties: card SHOWS with Pro conversion surface
    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput: { tier: "free", workspaceProEntitled: false },
        hasPaidPremiumCompletionSession,
        authoritativePremiumUiCommitted: false,
        paidProAuthoritative: false,
        suppressIntakePremiumUpsell: false,
        proAgreementEntitled: false,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        belowDocumentRefineSectionParentEligible: true,
        premiumPaidDocumentSurface: false,
        showStarterProRefineUpsellCardEligible: true,
        draftPartiesAreComplete: true,
      }),
    ).toBe(true);

    const bottomCta = showUpgradeProCtaBlock();
    expect(bottomCta).toContain("PRO_CTA_CONTINUE");
    expect(bottomCta).toContain('action: "launch_pro_checkout"');

    expect(intakeSrc).toContain("hideStickyForStarterProContinuation");
    expect(intakeSrc).toContain("!hideStickyForStarterProContinuation");

    const checkoutHandler = launchProCheckoutHandlerBlock();
    expect(checkoutHandler).toContain("logStarterUpgradeTransition");
    expect(checkoutHandler).toContain("launchCreateFlowProCheckoutRef");
    expect(checkoutHandler).not.toMatch(/premium-full-draft|premiumFullDraft/i);
  });

  it("Case 9 proof — obsolete comparison copy absent from anonymous streamline funnel", () => {
    expect(PRO_UPGRADE_CARD_HEADING).toBe("Ready to move this from draft to deal?");
    expect(PRO_CAN_TIGHTEN_HEADING).toBe("What Pro can tighten");
    expect(PRO_CTA_KEEP_FREE_DRAFT).toBe("Keep free draft");
    expect(PRO_CTA_CONTINUE).toBe("Continue with Pro");

    const streamlineBlock = intakeSrc.slice(
      intakeSrc.indexOf("isFreeStreamlineDraftReview &&"),
      intakeSrc.indexOf("isFreeStreamlineDraftReview &&") + 1200,
    );
    expect(streamlineBlock).not.toContain(PRO_UPGRADE_CARD_HEADING);
    expect(streamlineBlock).not.toContain(PRO_CAN_TIGHTEN_HEADING);
    expect(streamlineBlock).not.toContain(PRO_CTA_KEEP_FREE_DRAFT);
    expect(cardSrc).toContain("ProConversionComparisonCard");
  });

  it("Case 9 proof — checkout transition logs paymentRequired and nextStep checkout", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logStarterUpgradeTransition({
      source: "starter_review_bottom_cta",
      component: "unified_bottom_cta",
      nextStep: "checkout",
      paymentRequired: true,
      entitlementPresent: false,
      anonymous: true,
      orgId: "anon-test552",
    });
    expect(spy).toHaveBeenCalledWith(
      "[starter-upgrade-transition]",
      expect.objectContaining({
        source: "starter_review_bottom_cta",
        nextStep: "checkout",
        paymentRequired: true,
        entitlementPresent: false,
        anonymous: true,
      }),
    );
    spy.mockRestore();
  });

  it("RENDERED conversion surface — ProConversionComparisonCard contains heading, body, bullets, price, CTA", async () => {
    const { ProConversionComparisonCard } = await import("../components/agreements/ProConversionComparisonCard");
    const { PRO_UPGRADE_CARD_BODY, PRO_UPGRADE_PRO_BULLETS, PRO_UPGRADE_FREE_BULLETS } = await import("./simpleProduct/proConversionCopy");

    const clickHandler = vi.fn();
    render(
      <ProConversionComparisonCard
        onPrimaryClick={clickHandler}
        showSecondaryActions={true}
        onKeepFreeClick={() => {}}
      />
    );

    // 1. Card heading: "Ready to move this from draft to deal?"
    expect(screen.getByRole("heading", { name: PRO_UPGRADE_CARD_HEADING })).toBeTruthy();

    // 2. Card body explaining free vs pro
    expect(screen.getByText(PRO_UPGRADE_CARD_BODY)).toBeTruthy();

    // 3. Free column bullets
    for (const bullet of PRO_UPGRADE_FREE_BULLETS) {
      expect(screen.getByText(bullet)).toBeTruthy();
    }

    // 4. Pro column bullets
    for (const bullet of PRO_UPGRADE_PRO_BULLETS) {
      expect(screen.getByText(bullet)).toBeTruthy();
    }

    // 5. Price line: LawDog Pro: $49/month
    expect(screen.getByText(/LawDog Pro.*\$49\/month/)).toBeTruthy();

    // 6. Primary CTA: "Continue with Pro"
    const ctaButton = screen.getByRole("button", { name: PRO_CTA_CONTINUE });
    expect(ctaButton).toBeTruthy();
    ctaButton.click();
    expect(clickHandler).toHaveBeenCalledTimes(1);

    // 7. Secondary action: "Keep free draft"
    expect(screen.getByRole("button", { name: PRO_CTA_KEEP_FREE_DRAFT })).toBeTruthy();
  });

  it("RENDERED conversion surface — checkout uses real persisted agreement ID when available", () => {
    // Must use reviewAgreementIdRef.current or readCreateReviewAgreementResumeId() first
    expect(intakeSrc).toContain("reviewAgreementIdRef.current || readCreateReviewAgreementResumeId()");
    
    // The checkout URL must prefer real ID over CREATE_FLOW_CHECKOUT_AGREEMENT_ID
    expect(intakeSrc).toContain("checkoutAgreementId");
    expect(intakeSrc).toMatch(/const checkoutAgreementId[\s\S]*?reviewAgreementIdRef\.current/);
    expect(intakeSrc).toMatch(/const checkoutAgreementId[\s\S]*?CREATE_FLOW_CHECKOUT_AGREEMENT_ID/);
  });
});
