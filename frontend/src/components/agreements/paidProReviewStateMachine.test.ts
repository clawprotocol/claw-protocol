import { describe, expect, it, vi } from "vitest";
import {
  collectPaidProQaInvariantViolations,
  isFailedPremiumCorpusState,
  paidProReviewStateAllowsRecipientSetup,
  paidProReviewStateAllowsVs01,
  paidProReviewStateBlocksReviewRender,
  paidProReviewStateBlocksStarterSurface,
  paidProReviewStateForbidsProUpsellCta,
  paidProSignerMetadataEditActive,
  paidProSignerMetadataSessionActive,
  paidProSignerSetupDefersHandoffRecompute,
  paidProSignerSetupSuppressesGuidedAndStarter,
  paidProSigningCorpusFreezeActive,
  resolveOrReuseFrozenForSignerEdit,
  resolvePaidProReviewState,
  resolvePaidProSignerMetadataEditGuard,
} from "./paidProReviewStateMachine";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";

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

  it("AUTHORITATIVE_READY requires a non-empty body — valid corpus with len 0 stays GENERATING", () => {
    // QA: after signer hydration the active review predicate flips false so the visible body is
    // momentarily empty while paid authority still exists. This must never report AUTHORITATIVE_READY
    // (which would emit authoritativeLen:0); it recovers as GENERATING until the SoT body resolves.
    const emptyBody = resolvePaidProReviewState({
      ...baseArgs,
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      hasValidAuthoritativeCorpus: true,
      authoritativeBodyLen: 0,
    });
    expect(emptyBody).toBe("GENERATING");
    expect(emptyBody).not.toBe("AUTHORITATIVE_READY");

    const withBody = resolvePaidProReviewState({
      ...baseArgs,
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      hasValidAuthoritativeCorpus: true,
      authoritativeBodyLen: 12_967,
    });
    expect(withBody).toBe("AUTHORITATIVE_READY");
  });

  it("omitting authoritativeBodyLen preserves legacy AUTHORITATIVE_READY behavior", () => {
    expect(
      resolvePaidProReviewState({
        ...baseArgs,
        premiumCheckoutCompleted: true,
        hasValidAuthoritativeCorpus: true,
      }),
    ).toBe("AUTHORITATIVE_READY");
  });

  it("rejected/degraded paid corpus after checkout shows retry recovery, never a Pro review shell", () => {
    // QA: HTTP 200 but generation_outcome degraded + json_parse rejected by client gates. No valid
    // corpus was committed (rejected/short corpus must never become the SoT), so the surface must be
    // a clean recovery — NOT an authoritative review render and NOT recipient/VS01 surfaces.
    const state = resolvePaidProReviewState({
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      premiumGenerationInFlight: false,
      hasValidAuthoritativeCorpus: false,
      premiumCorpusValidationFailed: true,
      authoritativeBodyLen: 0,
    });
    expect(state).toBe("FAILED_PREMIUM_CORPUS");
    expect(state).not.toBe("AUTHORITATIVE_READY");
    expect(paidProReviewStateBlocksReviewRender(state)).toBe(true);
    expect(paidProReviewStateBlocksStarterSurface(state)).toBe(true);
    expect(paidProReviewStateAllowsRecipientSetup(state)).toBe(false);
    expect(paidProReviewStateAllowsVs01(state)).toBe(false);
    // The recovery surface shows "Retry Pro draft" and logs no invariant violation (no body yet).
    expect(
      collectPaidProQaInvariantViolations({
        state,
        authoritativeBodySource: "none",
        authoritativeLen: 0,
        freeStarterShellResolved: false,
        ctaLabel: "Retry Pro draft",
        starterLabelRendered: false,
      }),
    ).toEqual([]);
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
        ctaLabel: "Complete signer details",
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

describe("paid Pro signer-setup isolation", () => {
  it("suppresses guided queue + starter refresh while signer setup is active over an accepted SoT", () => {
    expect(
      paidProSignerSetupSuppressesGuidedAndStarter({
        signerSetupActive: true,
        hasPaidProSourceOfTruth: true,
      }),
    ).toBe(true);
  });

  it("does NOT suppress guided/starter before an accepted SoT exists (pre-acceptance discovery flow)", () => {
    expect(
      paidProSignerSetupSuppressesGuidedAndStarter({
        signerSetupActive: true,
        hasPaidProSourceOfTruth: false,
      }),
    ).toBe(false);
  });

  it("does NOT suppress guided/starter when signer setup is not the active surface", () => {
    expect(
      paidProSignerSetupSuppressesGuidedAndStarter({
        signerSetupActive: false,
        hasPaidProSourceOfTruth: true,
      }),
    ).toBe(false);
  });

  it("defers VS01/handoff recompute during signer metadata entry (no Prepare click yet)", () => {
    expect(
      paidProSignerSetupDefersHandoffRecompute({
        signerSetupActive: true,
        hasPaidProSourceOfTruth: true,
        prepareSignatureLinksRequested: false,
      }),
    ).toBe(true);
  });

  it("allows VS01/handoff recompute once the user clicks Prepare signature links", () => {
    expect(
      paidProSignerSetupDefersHandoffRecompute({
        signerSetupActive: true,
        hasPaidProSourceOfTruth: true,
        prepareSignatureLinksRequested: true,
      }),
    ).toBe(false);
  });
});

describe("paid Pro signer-metadata edit hard guard", () => {
  it("is active only when signer setup is active AND a paid SoT exists AND prepare not clicked", () => {
    expect(
      paidProSignerMetadataEditActive({ signerSetupActive: true, hasPaidProSourceOfTruth: true }),
    ).toBe(true);
    expect(
      paidProSignerMetadataEditActive({ signerSetupActive: true, hasPaidProSourceOfTruth: false }),
    ).toBe(false);
    expect(
      paidProSignerMetadataEditActive({ signerSetupActive: false, hasPaidProSourceOfTruth: true }),
    ).toBe(false);
    // Inline latch alone keeps the session active on canonical final-review signer setup.
    expect(
      paidProSignerMetadataSessionActive({
        signerSetupActive: false,
        hasPaidProSourceOfTruth: true,
        signerSetupLatched: true,
      }),
    ).toBe(true);
    expect(
      paidProSignerMetadataEditActive({
        signerSetupActive: false,
        hasPaidProSourceOfTruth: true,
        signerSetupLatched: true,
      }),
    ).toBe(true);
    // Prepare signature links is the single release event.
    expect(
      paidProSignerMetadataEditActive({
        signerSetupActive: true,
        hasPaidProSourceOfTruth: true,
        prepareSignatureLinksRequested: true,
      }),
    ).toBe(false);
  });

  it("suppresses every discovery/derivation recompute while active", () => {
    const guard = resolvePaidProSignerMetadataEditGuard({
      signerSetupActive: true,
      hasPaidProSourceOfTruth: true,
    });
    expect(guard.active).toBe(true);
    expect(guard.returnFrozenSotForSurfaces).toBe(true);
    expect(guard.suppressGuidedQuestionQueue).toBe(true);
    expect(guard.suppressGuidedAuthoritativeBodyRecompute).toBe(true);
    expect(guard.suppressFreeStarterPreviewRefresh).toBe(true);
    expect(guard.suppressPremiumRenderSourceRecompute).toBe(true);
    expect(guard.suppressHandoffAndVs01Recompute).toBe(true);
    expect(guard.suppressDeliveryFlowRecompute).toBe(true);
    expect(guard.suppressFailedPremiumCorpusTransition).toBe(true);
  });

  it("Prepare signature links is the ONLY recompute-release event (full release)", () => {
    const guard = resolvePaidProSignerMetadataEditGuard({
      signerSetupActive: true,
      hasPaidProSourceOfTruth: true,
      prepareSignatureLinksRequested: true,
    });
    expect(guard.active).toBe(false);
    expect(guard.suppressHandoffAndVs01Recompute).toBe(false);
    expect(guard.suppressDeliveryFlowRecompute).toBe(false);
    expect(guard.suppressGuidedQuestionQueue).toBe(false);
    expect(guard.suppressFailedPremiumCorpusTransition).toBe(false);
  });

  it("suppresses everything when inactive (no paid SoT / not on signer setup)", () => {
    const guard = resolvePaidProSignerMetadataEditGuard({
      signerSetupActive: false,
      hasPaidProSourceOfTruth: true,
    });
    expect(guard.active).toBe(false);
    expect(guard.suppressGuidedQuestionQueue).toBe(false);
    expect(guard.suppressFailedPremiumCorpusTransition).toBe(false);
  });

  describe("resolvePaidProReviewState never fails closed during signer-metadata edit", () => {
    it("does NOT enter FAILED_PREMIUM_CORPUS while editing even if validation momentarily failed", () => {
      const state = resolvePaidProReviewState({
        ...baseArgs,
        premiumCheckoutCompleted: true,
        premiumPaidDocumentSurface: true,
        hasValidAuthoritativeCorpus: false,
        premiumCorpusValidationFailed: true,
        signerMetadataEditActive: true,
      });
      expect(state).not.toBe("FAILED_PREMIUM_CORPUS");
      expect(state).toBe("GENERATING");
    });

    it("does NOT fail closed while editing even when checkout completed and no corpus is resolvable", () => {
      const state = resolvePaidProReviewState({
        ...baseArgs,
        premiumCheckoutCompleted: true,
        premiumPaidDocumentSurface: true,
        hasValidAuthoritativeCorpus: false,
        premiumGenerationInFlight: false,
        signerMetadataEditActive: true,
      });
      expect(state).not.toBe("FAILED_PREMIUM_CORPUS");
    });

    it("stays AUTHORITATIVE_READY while editing when the SoT body is present", () => {
      const state = resolvePaidProReviewState({
        ...baseArgs,
        premiumCheckoutCompleted: true,
        premiumPaidDocumentSurface: true,
        hasValidAuthoritativeCorpus: true,
        authoritativeBodyLen: 2822,
        signerMetadataEditActive: true,
      });
      expect(state).toBe("AUTHORITATIVE_READY");
    });

    it("WITHOUT the edit guard, a validation failure after checkout still fails closed (unchanged)", () => {
      const state = resolvePaidProReviewState({
        ...baseArgs,
        premiumCheckoutCompleted: true,
        premiumPaidDocumentSurface: true,
        hasValidAuthoritativeCorpus: false,
        premiumCorpusValidationFailed: true,
        signerMetadataEditActive: false,
      });
      expect(state).toBe("FAILED_PREMIUM_CORPUS");
    });
  });

  describe("resolveOrReuseFrozenForSignerEdit (VS01/handoff freeze)", () => {
    it("does NOT call compute while the edit guard is active and a frozen value exists", () => {
      const compute = vi.fn(() => "fresh");
      const out = resolveOrReuseFrozenForSignerEdit({
        editGuardActive: true,
        frozen: "frozen-gate",
        compute,
      });
      expect(compute).not.toHaveBeenCalled();
      expect(out.computed).toBe(false);
      expect(out.value).toBe("frozen-gate");
    });

    it("computes ONCE to capture the frozen value at signer-setup entry (no prior frozen)", () => {
      const compute = vi.fn(() => "entry-gate");
      const out = resolveOrReuseFrozenForSignerEdit({
        editGuardActive: true,
        frozen: null,
        compute,
      });
      expect(compute).toHaveBeenCalledTimes(1);
      expect(out.computed).toBe(true);
      expect(out.value).toBe("entry-gate");
    });

    it("computes again once the guard is released (Prepare signature links clicked)", () => {
      const compute = vi.fn(() => "released-gate");
      const out = resolveOrReuseFrozenForSignerEdit({
        editGuardActive: false,
        frozen: "frozen-gate",
        compute,
      });
      expect(compute).toHaveBeenCalledTimes(1);
      expect(out.computed).toBe(true);
      expect(out.value).toBe("released-gate");
    });

    it("simulated keystroke storm calls the VS01 resolver at most once during signer editing", () => {
      type Gate = { allowed: boolean; corpus: string };
      const resolver = vi.fn((): Gate => ({ allowed: true, corpus: "SOT" }));
      let frozen: Gate | null = null;
      // Entry render (guard active, no frozen yet) computes once and captures.
      for (const _keystroke of ["I", "Ir", "Iro", "Iron", "Iron Vale"]) {
        const out: { value: Gate; computed: boolean } = resolveOrReuseFrozenForSignerEdit<Gate>({
          editGuardActive: true,
          frozen,
          compute: resolver,
        });
        if (out.computed) frozen = out.value;
      }
      expect(resolver).toHaveBeenCalledTimes(1);
      // Prepare signature links → guard released → resolver allowed to run again.
      resolveOrReuseFrozenForSignerEdit<Gate>({ editGuardActive: false, frozen, compute: resolver });
      expect(resolver).toHaveBeenCalledTimes(2);
    });
  });
});

describe("paidProSigningCorpusFreezeActive (mode-independent VS01/handoff freeze)", () => {
  it("is true whenever a paid SoT exists and Prepare signature links has NOT been clicked", () => {
    expect(
      paidProSigningCorpusFreezeActive({
        hasPaidProSourceOfTruth: true,
        prepareSignatureLinksRequested: false,
      }),
    ).toBe(true);
  });

  it("is independent of signer-setup predicates (no signerSetupActive input at all)", () => {
    // The invariant only needs SoT + not-yet-requested; it engages even when displayPhase is review.
    expect(
      paidProSigningCorpusFreezeActive({
        hasPaidProSourceOfTruth: true,
        prepareSignatureLinksRequested: false,
      }),
    ).toBe(true);
  });

  it("is false with no SoT, and false once Prepare signature links is clicked", () => {
    expect(
      paidProSigningCorpusFreezeActive({
        hasPaidProSourceOfTruth: false,
        prepareSignatureLinksRequested: false,
      }),
    ).toBe(false);
    expect(
      paidProSigningCorpusFreezeActive({
        hasPaidProSourceOfTruth: true,
        prepareSignatureLinksRequested: true,
      }),
    ).toBe(false);
  });

  // Mirror the exact component branch: if (freeze) return frozen; else resolveFinalVs01CorpusOrBlock().
  function renderVs01Gate(args: {
    hasSot: boolean;
    prepareSignatureLinksRequested: boolean;
    resolver: () => { source: string; allowed: boolean };
  }) {
    if (
      paidProSigningCorpusFreezeActive({
        hasPaidProSourceOfTruth: args.hasSot,
        prepareSignatureLinksRequested: args.prepareSignatureLinksRequested,
      })
    ) {
      return { source: "deferred", allowed: false };
    }
    return args.resolver();
  }

  it("typing signer name/email/title/address never calls the VS01 resolver (no vs01_signing / handoff_corpus)", () => {
    const resolver = vi.fn(() => ({ source: "handoff_corpus", allowed: true }));
    for (const _field of ["name", "email", "title", "address"]) {
      const gate = renderVs01Gate({
        hasSot: true,
        prepareSignatureLinksRequested: false,
        resolver,
      });
      expect(gate.source).toBe("deferred");
      expect(gate.source).not.toBe("handoff_corpus");
    }
    expect(resolver).not.toHaveBeenCalled();
  });

  it("after Prepare signature links is clicked, the VS01 resolver runs", () => {
    const resolver = vi.fn(() => ({ source: "paidProSourceOfTruth", allowed: true }));
    const gate = renderVs01Gate({
      hasSot: true,
      prepareSignatureLinksRequested: true,
      resolver,
    });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(gate.allowed).toBe(true);
  });

  it("review state never enters FAILED_PREMIUM_CORPUS while frozen, even if render len is temporarily 0", () => {
    // The component feeds the freeze invariant into signerMetadataEditActive.
    const state = resolvePaidProReviewState({
      ...baseArgs,
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      hasValidAuthoritativeCorpus: false,
      premiumCorpusValidationFailed: true,
      authoritativeBodyLen: 0,
      signerMetadataEditActive: true,
    });
    expect(state).not.toBe("FAILED_PREMIUM_CORPUS");
    // And a non-NOT_PAID state always blocks the free starter surface from mounting.
    expect(paidProReviewStateBlocksStarterSurface(state)).toBe(true);
  });
});

/**
 * Regression for the recurring repro: the freeze never engaged because the component derived
 * `prepareSignatureLinksRequested` from "entered signer setup" booleans
 * (`guidedSendIntentSelected`, `finalReviewSendPathChosenRef`, and even
 * `guidedSigningConfirmationActive`) that are latched TRUE while the inline signer form is still
 * mounted. That made the freeze inactive during typing, so `resolveFinalVs01CorpusOrBlock` ran on
 * every keystroke (stack: compute @ AgreementBuilderIntake.tsx VS01 memo).
 *
 * The fix: a dedicated `signaturePreparationRequested` flag set TRUE *only* by the real
 * proceed-to-signing action (continueGuidedFinalReviewToSigning signature branch /
 * enterGuidedSignatureTrackRoute) and reset FALSE on (re)entering signer setup. This block models a
 * faithful state machine for that flag and drives the REAL resolver to count invocations.
 */
describe("signer-typing freeze: release flag + real resolveFinalVs01CorpusOrBlock call count", () => {
  // Minimal faithful model of the component's signaturePreparationRequested flag.
  class FreezeModel {
    signaturePreparationRequested = false;
    // The real proceed-to-signing CTA.
    clickPrepareSignatureLinks() {
      this.signaturePreparationRequested = true;
    }
    // Entering / re-entering the inline signer setup form.
    enterSignerSetup() {
      this.signaturePreparationRequested = false;
    }
    // Going back to final review from the signing confirmation surface.
    backToFinalReview() {
      this.signaturePreparationRequested = false;
    }
    freezeActive(hasSot: boolean) {
      return paidProSigningCorpusFreezeActive({
        hasPaidProSourceOfTruth: hasSot,
        prepareSignatureLinksRequested: this.signaturePreparationRequested,
      });
    }
  }

  it("entering signer setup keeps the freeze ACTIVE (release flag stays false)", () => {
    const m = new FreezeModel();
    m.enterSignerSetup();
    expect(m.signaturePreparationRequested).toBe(false);
    expect(m.freezeActive(true)).toBe(true);
  });

  it("clicking Prepare signature links RELEASES the freeze; re-entering setup re-arms it", () => {
    const m = new FreezeModel();
    m.enterSignerSetup();
    expect(m.freezeActive(true)).toBe(true);
    m.clickPrepareSignatureLinks();
    expect(m.freezeActive(true)).toBe(false);
    m.backToFinalReview();
    expect(m.freezeActive(true)).toBe(true);
    m.enterSignerSetup();
    expect(m.freezeActive(true)).toBe(true);
  });

  // The exact component render branch, wired to the REAL resolver so we can count invocations.
  function renderGateWithRealResolver(args: {
    hasSot: boolean;
    model: FreezeModel;
    resolver: typeof resolveFinalVs01CorpusOrBlock;
  }) {
    if (args.model.freezeActive(args.hasSot)) {
      return { allowed: false, source: "deferred" as const };
    }
    return args.resolver({
      agreementCorpusText: "x".repeat(4000),
      guidedPro: true,
    } as Parameters<typeof resolveFinalVs01CorpusOrBlock>[0]);
  }

  it("repeated Party 2 signer typing NEVER executes resolveFinalVs01CorpusOrBlock", () => {
    const spy = vi.fn(resolveFinalVs01CorpusOrBlock);
    const m = new FreezeModel();
    m.enterSignerSetup(); // inline signer setup mounted over an accepted paid SoT
    // Simulate a Party 2 signer name/email/title/address keystroke storm.
    const keystrokes = [
      "A", "Ac", "Acm", "Acme", "Acme ", "Acme C", "a@", "a@x", "Mgr", "1 Rd",
    ];
    for (const _stroke of keystrokes) {
      const gate = renderGateWithRealResolver({ hasSot: true, model: m, resolver: spy });
      expect(gate.source).toBe("deferred");
      expect(gate.source).not.toBe("handoff_corpus");
    }
    // The single most important assertion: the resolver was executed ZERO times during typing.
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("clicking Prepare signature links executes resolveFinalVs01CorpusOrBlock exactly once", () => {
    const spy = vi.fn(resolveFinalVs01CorpusOrBlock);
    const m = new FreezeModel();
    m.enterSignerSetup();
    // type a bit (frozen), then click prepare
    renderGateWithRealResolver({ hasSot: true, model: m, resolver: spy });
    renderGateWithRealResolver({ hasSot: true, model: m, resolver: spy });
    expect(spy).toHaveBeenCalledTimes(0);
    m.clickPrepareSignatureLinks();
    renderGateWithRealResolver({ hasSot: true, model: m, resolver: spy });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
