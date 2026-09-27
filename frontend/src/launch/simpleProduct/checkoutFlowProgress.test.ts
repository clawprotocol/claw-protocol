import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../../components/agreements/agreementAdvancedDraftAccess";
import {
  CHECKOUT_STARTER_UPGRADE_SUBTITLE,
  checkoutProgressStepIsComplete,
  checkoutProgressStepIsCurrent,
  isCreateFlowAgreementCheckout,
  resolveCheckoutFlowProgress,
  STARTER_UPGRADE_CHECKOUT_PROGRESS_LABELS,
} from "./checkoutFlowProgress";

describe("isCreateFlowAgreementCheckout", () => {
  const realId = "8f3a1c2e-4b5d-6789-abcd-ef0123456789";

  it("is true for placeholder create-flow id", () => {
    expect(
      isCreateFlowAgreementCheckout({
        agreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
        isSingleAgreementCheckout: false,
        returnTo: "/app/create?restore=starterReview",
      }),
    ).toBe(true);
  });

  it("is true for a real persisted agreement id returning to create", () => {
    expect(
      isCreateFlowAgreementCheckout({
        agreementId: realId,
        isSingleAgreementCheckout: false,
        returnTo: "/app/create?restore=starterReview",
      }),
    ).toBe(true);
  });

  it("is false for send-path checkout even with a real id", () => {
    expect(
      isCreateFlowAgreementCheckout({
        agreementId: realId,
        isSingleAgreementCheckout: false,
        returnTo: `/app/send/${realId}?phase=send`,
      }),
    ).toBe(false);
  });
});

describe("resolveCheckoutFlowProgress", () => {
  it("starter upgrade checkout: Review active, Draft complete, Proof not current", () => {
    const p = resolveCheckoutFlowProgress({
      agreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
      isSingleAgreementCheckout: false,
      returnTo: "/app/create?premiumCompletion=1",
    });
    expect(p.variant).toBe("starter_upgrade");
    expect(p.labels).toEqual([...STARTER_UPGRADE_CHECKOUT_PROGRESS_LABELS]);
    expect(p.step).toBe(2);
    expect(checkoutProgressStepIsComplete(p, 0)).toBe(true);
    expect(checkoutProgressStepIsCurrent(p, 1)).toBe(true);
    expect(p.labels[1]).toBe("Review");
    expect(checkoutProgressStepIsComplete(p, 2)).toBe(false);
    expect(checkoutProgressStepIsComplete(p, 3)).toBe(false);
    expect(checkoutProgressStepIsCurrent(p, 3)).toBe(false);
    expect(p.labels).toContain("Sign");
    expect(checkoutProgressStepIsCurrent(p, p.labels.length - 2)).toBe(false);
  });

  it("direct send checkout: Review active on lifecycle rail, Sign not current", () => {
    const p = resolveCheckoutFlowProgress({
      agreementId: "agr-send-1",
      isSingleAgreementCheckout: false,
      returnTo: "/app/send/agr-send-1?phase=send",
    });
    expect(p.variant).toBe("direct_send");
    expect(p.step).toBe(2);
    expect(p.labels[1]).toBe("Review");
    expect(checkoutProgressStepIsComplete(p, 0)).toBe(true);
    expect(checkoutProgressStepIsCurrent(p, 1)).toBe(true);
    expect(checkoutProgressStepIsComplete(p, 1)).toBe(false);
    expect(checkoutProgressStepIsCurrent(p, 2)).toBe(false);
    expect(p.labels[2]).toBe("Sign");
    expect(checkoutProgressStepIsComplete(p, 2)).toBe(false);
  });

  it("real persisted agreement ID + create returnTo is still starter upgrade checkout", () => {
    const p = resolveCheckoutFlowProgress({
      agreementId: "8f3a1c2e-4b5d-6789-abcd-ef0123456789",
      isSingleAgreementCheckout: false,
      returnTo: "/app/create?restore=starterReview",
    });
    expect(p.variant).toBe("starter_upgrade");
    expect(p.step).toBe(2);
    expect(p.labels).toEqual([...STARTER_UPGRADE_CHECKOUT_PROGRESS_LABELS]);
  });

  it("single-agreement unlock: Send active, Sign not highlighted", () => {
    const p = resolveCheckoutFlowProgress({
      agreementId: "agr-1",
      isSingleAgreementCheckout: true,
      returnTo: "/app/send/agr-1?phase=send",
    });
    expect(p.variant).toBe("single_agreement");
    expect(p.step).toBe(2);
    expect(checkoutProgressStepIsCurrent(p, 2)).toBe(false);
  });
});

describe("SimpleCheckoutPage checkout copy (static)", () => {
  it("uses review-before-send subtitle and does not imply signing on starter upgrade", () => {
    const page = readFileSync(join(__dirname, "SimpleCheckoutPage.tsx"), "utf8");
    expect(page).toContain("CHECKOUT_STARTER_UPGRADE_SUBTITLE");
    expect(page).toContain("CheckoutTrustPanel");
    expect(page).toContain("resolveCheckoutFlowProgress");
    expect(page).not.toContain(
      "Full send, collaboration, and tracked signing — then back to your agreement",
    );
    expect(CHECKOUT_STARTER_UPGRADE_SUBTITLE).toMatch(/before anything is sent or signed/i);
    expect(page).toContain("CHECKOUT_FOOTER");
    expect(page).toContain("CHECKOUT_CTA");
    expect(page).toContain("checkoutFlowProgress.step");
    expect(page).not.toMatch(/step=\{3\}/);
  });
});
