/**
 * GTM retest: 4-party named prompt cleared clarification, then generate spinner stuck
 * ("Pro draft generating" / "Structuring key terms…") after entitled rewrite failure.
 */
import { describe, expect, it } from "vitest";
import { planEntitledRewriteGenerationFailureTerminal } from "./paidProEntitledRewriteLaunch";
import { planDashboardPaidCreateValidationFailureTerminal } from "./dashboardPaidCreateRoute";
import { resolveDashboardPaidCreateScreen } from "./dashboardPaidCreateRoute";
import { shouldSuppressPaidProGeneratingPrimaryCta } from "./paidProPostFreezeStickyGenerating";
import { CreateUiStage } from "./createUiStage";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("paidPro entitled rewrite recovery hang (universal)", () => {
  it("failure terminals clear wait phase and leave review recovery — not generating_draft", () => {
    const entitled = planEntitledRewriteGenerationFailureTerminal({
      reason: "entitled_rewrite_missing_agreement_or_corpus",
      dashboardRoute: true,
    });
    expect(entitled.premiumPostCheckoutPhase).toBe(null);
    expect(entitled.displayPhase).toBe("review");
    expect(entitled.createFlowPhase).toBe("draft_ready_for_review");
    expect(entitled.proFullDraftQualityRetry).toBe(true);

    const dashboard = planDashboardPaidCreateValidationFailureTerminal();
    expect(dashboard.displayPhase).toBe("review");
    expect(dashboard.createFlowPhase).toBe("draft_ready_for_review");
    expect(
      resolveDashboardPaidCreateScreen({
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: dashboard.displayPhase,
        createFlowPhase: dashboard.createFlowPhase,
        proFullDraftQualityRetry: true,
        premiumPostCheckoutPhase: null,
      }),
    ).toBe("review_recovery");
  });

  it("quality-retry suppresses busy Structuring CTA while isGenerating is stale", () => {
    expect(
      shouldSuppressPaidProGeneratingPrimaryCta({
        isGenerating: true,
        hasSourceOfTruth: false,
        acceptedPaidProAuthority: false,
        inlineSignerSetupLatched: false,
        canonicalReviewSignerSetupActive: false,
        signerSetupStickyCtaSurfaceActive: false,
        proFullDraftQualityRetry: true,
      }),
    ).toBe(true);
  });

  it("entitled rewrite early returns dismiss processing wait modal", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const missingIdx = intake.indexOf('reason: "entitled_rewrite_missing_agreement_or_corpus"');
    const snapIdx = intake.indexOf('reason: "entitled_rewrite_snapshot_prepare_failed"');
    expect(missingIdx).toBeGreaterThan(-1);
    expect(snapIdx).toBeGreaterThan(-1);
    for (const idx of [missingIdx, snapIdx]) {
      const block = intake.slice(idx, idx + 900);
      expect(block).toContain("resolvePaidProGenerationFailurePostCheckoutPhase");
      expect(block).toContain('setDisplayPhase("review")');
    }
    expect(intake).toMatch(
      /finally\s*\{[\s\S]{0,400}setPremiumPostCheckoutPhase\(\(prev\)\s*=>/,
    );
  });
});
