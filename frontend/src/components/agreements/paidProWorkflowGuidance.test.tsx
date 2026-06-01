/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CreateFlowAgreementCheckoutPricing } from "../../launch/simpleProduct/CreateFlowAgreementCheckoutPricing";
import { LAUNCH_PRICING_TIERS } from "../../launch/pricingTiersData";
import { PaidProReviewNextStepCallout } from "./PaidProReviewNextStepCallout";
import { PaidProSignerSetupOrientationBanner } from "./PaidProSignerSetupOrientationBanner";
import { PaidProStickyCtaDirectionCue } from "./PaidProStickyCtaDirectionCue";
import {
  PAID_PRO_REVIEW_STEP_NEXT_SIGNER_SETUP,
  PAID_PRO_SIGNER_SETUP_ORIENTATION_BODY,
  markPaidProCtaDirectionCueSeen,
  resetPaidProCtaDirectionCueSeenForTests,
  resolvePaidProReviewNextStepCopy,
  shouldShowPaidProCtaDirectionPulse,
} from "./paidProWorkflowGuidance";

const PRO_TIER = LAUNCH_PRICING_TIERS.find((t) => t.id === "pro")!;

describe("paidProWorkflowGuidance", () => {
  afterEach(() => {
    resetPaidProCtaDirectionCueSeenForTests();
  });

  it("review next-step copy states signer setup is not signing", () => {
    const copy = resolvePaidProReviewNextStepCopy({ signersReady: false });
    expect(copy.stepLabel).toMatch(/Step 3 of 4/i);
    expect(copy.nextLine).toContain("not signing");
    expect(copy.nextLine).toMatch(/signer details/i);
  });

  it("review callout renders step guidance above document flow", () => {
    render(<PaidProReviewNextStepCallout signersReady={false} />);
    const callout = screen.getByTestId("paid-pro-review-next-step-callout");
    expect(callout.textContent).toContain("Review your agreement");
    expect(callout.textContent).toContain(PAID_PRO_REVIEW_STEP_NEXT_SIGNER_SETUP);
  });

  it("signer setup orientation uses tighter copy and workflow trail", () => {
    render(<PaidProSignerSetupOrientationBanner />);
    const banner = screen.getByTestId("paid-pro-signer-setup-orientation");
    expect(banner.textContent).toContain("Add signer details");
    expect(banner.textContent).toContain(PAID_PRO_SIGNER_SETUP_ORIENTATION_BODY);
    expect(banner.textContent).toMatch(/No one signs here/i);
    expect(screen.getByTestId("paid-pro-signer-setup-workflow-trail").textContent).toMatch(
      /Review → Signer details → Signature links → Signing/,
    );
  });

  it("monthly plan selection shows selected plan badge and checkmark", () => {
    render(
      <CreateFlowAgreementCheckoutPricing
        tier={PRO_TIER}
        cadence="monthly"
        onCadenceChange={() => {}}
      />,
    );
    expect(screen.getAllByText(/Selected plan/i).length).toBeGreaterThan(0);
    const monthlyTab = screen.getByRole("tab", { name: /Monthly/i });
    expect(monthlyTab.getAttribute("aria-selected")).toBe("true");
  });

  it("CTA direction cue renders continue-below helper", () => {
    render(<PaidProStickyCtaDirectionCue showFirstVisitPulse />);
    expect(screen.getByTestId("paid-pro-sticky-cta-direction-cue").textContent).toMatch(/Continue below/i);
    expect(screen.getByTestId("paid-pro-sticky-cta-direction-cue").textContent).toMatch(/Next step/i);
  });

  it("first-visit pulse eligibility clears after mark seen", () => {
    expect(shouldShowPaidProCtaDirectionPulse()).toBe(true);
    markPaidProCtaDirectionCueSeen();
    expect(shouldShowPaidProCtaDirectionPulse()).toBe(false);
  });

  it("intake wires signer orientation and sticky direction cue; review screen wires callout", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("PaidProSignerSetupOrientationBanner");
    expect(intake).toContain("PaidProStickyCtaDirectionCue");
    const reviewScreen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(reviewScreen).toContain("PaidProReviewNextStepCallout");
    const calloutModule = readFileSync(join(__dirname, "PaidProReviewNextStepCallout.tsx"), "utf8");
    expect(calloutModule).toContain("paid-pro-review-next-step-callout");
  });
});
