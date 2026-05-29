import { describe, expect, it } from "vitest";
import {
  collectPaidProQaInvariantViolations,
  isFailedPremiumCorpusState,
  paidProReviewStateAllowsRecipientSetup,
  paidProReviewStateAllowsVs01,
  paidProReviewStateBlocksReviewRender,
  paidProReviewStateBlocksStarterSurface,
  paidProReviewStateForbidsProUpsellCta,
  resolvePaidProReviewState,
} from "./paidProReviewStateMachine";

const baseArgs = {
  premiumPaidDocumentSurface: false,
  premiumCheckoutCompleted: false,
  premiumGenerationInFlight: false,
  hasValidAuthoritativeCorpus: false,
  premiumCorpusValidationFailed: false,
};

describe("resolvePaidProReviewState", () => {
  it("NOT_PAID when no paid surface and no checkout completion", () => {
    expect(resolvePaidProReviewState(baseArgs)).toBe("NOT_PAID");
  });

  it("AUTHORITATIVE_READY when valid corpus exists (wins over everything)", () => {
    expect(
      resolvePaidProReviewState({
        ...baseArgs,
        premiumCheckoutCompleted: true,
        hasValidAuthoritativeCorpus: true,
        premiumCorpusValidationFailed: true,
      }),
    ).toBe("AUTHORITATIVE_READY");
  });

  it("GENERATING while premium generation still in flight without corpus", () => {
    expect(
      resolvePaidProReviewState({
        ...baseArgs,
        premiumCheckoutCompleted: true,
        premiumGenerationInFlight: true,
      }),
    ).toBe("GENERATING");
  });

  it("FAILED_PREMIUM_CORPUS when validation failed after payment", () => {
    expect(
      resolvePaidProReviewState({
        ...baseArgs,
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: true,
        premiumCorpusValidationFailed: true,
      }),
    ).toBe("FAILED_PREMIUM_CORPUS");
  });

  it("FAILED_PREMIUM_CORPUS when checkout completed, generation finished, but corpus is null", () => {
    expect(
      resolvePaidProReviewState({
        ...baseArgs,
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: true,
        premiumGenerationInFlight: false,
        hasValidAuthoritativeCorpus: false,
        premiumCorpusValidationFailed: false,
      }),
    ).toBe("FAILED_PREMIUM_CORPUS");
  });

  it("QA bypass path with rejected premium candidate fails closed (not starter degrade)", () => {
    const state = resolvePaidProReviewState({
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      premiumGenerationInFlight: false,
      hasValidAuthoritativeCorpus: false,
      premiumCorpusValidationFailed: true,
    });
    expect(state).toBe("FAILED_PREMIUM_CORPUS");
    expect(paidProReviewStateBlocksStarterSurface(state)).toBe(true);
  });

  it("premium_network_retryable during paid checkout is a recovery state, never starter/guided", () => {
    // Network retry in flight: a paid recovery state (GENERATING), not a starter degrade.
    const retrying = resolvePaidProReviewState({
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      premiumGenerationInFlight: true, // premium_network_retryable in flight
      hasValidAuthoritativeCorpus: false,
      premiumCorpusValidationFailed: false,
    });
    expect(retrying).toBe("GENERATING");
    expect(paidProReviewStateBlocksStarterSurface(retrying)).toBe(true);
    expect(paidProReviewStateBlocksReviewRender(retrying)).toBe(true);

    // Retries exhausted with no valid corpus: fail closed to recovery, not starter/guided Q&A.
    const exhausted = resolvePaidProReviewState({
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      premiumGenerationInFlight: false,
      hasValidAuthoritativeCorpus: false,
      premiumCorpusValidationFailed: true,
    });
    expect(exhausted).toBe("FAILED_PREMIUM_CORPUS");
    expect(paidProReviewStateBlocksStarterSurface(exhausted)).toBe(true);
  });

  it("short guided/starter corpus after checkout never reads as authoritative paid body", () => {
    // docLen ~725/791/946 short corpus is rejected upstream => hasValidAuthoritativeCorpus false.
    const state = resolvePaidProReviewState({
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      premiumGenerationInFlight: false,
      hasValidAuthoritativeCorpus: false,
      premiumCorpusValidationFailed: false,
    });
    expect(state).toBe("FAILED_PREMIUM_CORPUS");
    expect(state).not.toBe("AUTHORITATIVE_READY");
    expect(paidProReviewStateAllowsRecipientSetup(state)).toBe(false);
  });

  it("refresh during failed premium state stays FAILED_PREMIUM_CORPUS (deterministic)", () => {
    const args = {
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      premiumGenerationInFlight: false,
      hasValidAuthoritativeCorpus: false,
      premiumCorpusValidationFailed: true,
    };
    expect(resolvePaidProReviewState(args)).toBe("FAILED_PREMIUM_CORPUS");
    expect(resolvePaidProReviewState(args)).toBe("FAILED_PREMIUM_CORPUS");
  });
});

describe("paid review state predicates", () => {
  it("blocks starter surface in every paid state", () => {
    for (const state of ["GENERATING", "AUTHORITATIVE_READY", "FAILED_PREMIUM_CORPUS"] as const) {
      expect(paidProReviewStateBlocksStarterSurface(state)).toBe(true);
    }
    expect(paidProReviewStateBlocksStarterSurface("NOT_PAID")).toBe(false);
  });

  it("blocks review render in failed and generating states", () => {
    expect(paidProReviewStateBlocksReviewRender("FAILED_PREMIUM_CORPUS")).toBe(true);
    expect(paidProReviewStateBlocksReviewRender("GENERATING")).toBe(true);
    expect(paidProReviewStateBlocksReviewRender("AUTHORITATIVE_READY")).toBe(false);
  });

  it("recipient setup + VS01 require AUTHORITATIVE_READY", () => {
    expect(paidProReviewStateAllowsRecipientSetup("AUTHORITATIVE_READY")).toBe(true);
    expect(paidProReviewStateAllowsRecipientSetup("FAILED_PREMIUM_CORPUS")).toBe(false);
    expect(paidProReviewStateAllowsVs01("FAILED_PREMIUM_CORPUS")).toBe(false);
    expect(paidProReviewStateAllowsVs01("AUTHORITATIVE_READY")).toBe(true);
  });

  it("forbids Pro upsell CTA whenever paid", () => {
    expect(paidProReviewStateForbidsProUpsellCta("FAILED_PREMIUM_CORPUS")).toBe(true);
    expect(paidProReviewStateForbidsProUpsellCta("AUTHORITATIVE_READY")).toBe(true);
    expect(paidProReviewStateForbidsProUpsellCta("NOT_PAID")).toBe(false);
  });

  it("isFailedPremiumCorpusState", () => {
    expect(isFailedPremiumCorpusState("FAILED_PREMIUM_CORPUS")).toBe(true);
    expect(isFailedPremiumCorpusState("AUTHORITATIVE_READY")).toBe(false);
  });
});

describe("collectPaidProQaInvariantViolations", () => {
  it("no violations for a healthy authoritative-ready review", () => {
    expect(
      collectPaidProQaInvariantViolations({
        state: "AUTHORITATIVE_READY",
        authoritativeBodySource: "paid_pro_source_of_truth",
        authoritativeLen: 10847,
        freeStarterShellResolved: false,
        ctaLabel: "Add signer details",
        starterLabelRendered: false,
      }),
    ).toEqual([]);
  });

  it("flags authoritative source none + zero length", () => {
    const v = collectPaidProQaInvariantViolations({
      state: "AUTHORITATIVE_READY",
      authoritativeBodySource: "none",
      authoritativeLen: 0,
      freeStarterShellResolved: false,
      ctaLabel: "Continue to recipients",
      starterLabelRendered: false,
    });
    expect(v).toContain("authoritative_body_source_none");
    expect(v).toContain("authoritative_len_zero");
  });

  it("flags free starter shell + starter label + Continue with Pro after payment", () => {
    const v = collectPaidProQaInvariantViolations({
      state: "FAILED_PREMIUM_CORPUS",
      authoritativeBodySource: "none",
      authoritativeLen: 0,
      freeStarterShellResolved: true,
      ctaLabel: "Continue with Pro",
      starterLabelRendered: true,
    });
    expect(v).toContain("free_starter_shell_resolved_after_paid");
    expect(v).toContain("starter_label_rendered_after_paid");
    expect(v).toContain("continue_with_pro_cta_after_paid");
  });

  it("source none / len 0 is a violation only when the paid final review claims AUTHORITATIVE_READY", () => {
    // After checkout, a "ready" review must never log source:none / authoritativeLen:0 ...
    const ready = collectPaidProQaInvariantViolations({
      state: "AUTHORITATIVE_READY",
      authoritativeBodySource: "none",
      authoritativeLen: 0,
      freeStarterShellResolved: false,
      ctaLabel: "Continue to recipients",
      starterLabelRendered: false,
    });
    expect(ready).toContain("authoritative_body_source_none");
    expect(ready).toContain("authoritative_len_zero");

    // ... unless it is the explicit FAILED_PREMIUM_CORPUS recovery state, which has no body yet.
    const recovery = collectPaidProQaInvariantViolations({
      state: "FAILED_PREMIUM_CORPUS",
      authoritativeBodySource: "none",
      authoritativeLen: 0,
      freeStarterShellResolved: false,
      ctaLabel: "Retry Pro draft",
      starterLabelRendered: false,
    });
    expect(recovery).toEqual([]);
  });

  it("does not require authoritative body in failed state (recovery only)", () => {
    const v = collectPaidProQaInvariantViolations({
      state: "FAILED_PREMIUM_CORPUS",
      authoritativeBodySource: "none",
      authoritativeLen: 0,
      freeStarterShellResolved: false,
      ctaLabel: "Retry Pro draft",
      starterLabelRendered: false,
    });
    expect(v).not.toContain("authoritative_body_source_none");
    expect(v).not.toContain("authoritative_len_zero");
    expect(v).toEqual([]);
  });
});
