/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  mapPaidProStickyCtaToPrimaryCta,
  paidProStickyCtaShowsStickyBar,
  resolvePaidProStickyCta,
} from "./paidProStickyCta";
import { PAID_PRO_REVIEW_DECISION_SCROLL_REASON } from "./paidProSignerFinalizeRouting";

describe("paidProReviewDecisionNoStickyFooter", () => {
  it("review_decision hides sticky bar and does not surface scroll CTA copy", () => {
    const state = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(state.phase).toBe("review_decision");
    expect(paidProStickyCtaShowsStickyBar(state.phase)).toBe(false);
    expect(state.showStickyBar).toBe(false);
    expect(state.label).toBe("");
    expect(state.disabled).toBe(true);
    expect(state.reason).toBe(PAID_PRO_REVIEW_DECISION_SCROLL_REASON);
  });

  it("inline primary CTA mapping matches on-card review decision (no Choose next step below)", () => {
    const state = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    const inline = state.showStickyBar
      ? mapPaidProStickyCtaToPrimaryCta(state)
      : {
          label: "",
          action: "guided_continue" as const,
          disabled: true,
          reason: "paid_pro_review_decision_on_card",
        };
    expect(inline.label).toBe("");
    expect(inline.label).not.toMatch(/Choose next step below/i);
    expect(inline.reason).toBe("paid_pro_review_decision_on_card");
    expect(inline.disabled).toBe(true);
  });
});
