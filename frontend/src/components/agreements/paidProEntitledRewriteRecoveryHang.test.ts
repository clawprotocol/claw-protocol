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
  it("failure terminals clear wait phase and return to intake — not generating_draft or empty review", () => {
    const entitled = planEntitledRewriteGenerationFailureTerminal({
      reason: "entitled_rewrite_missing_agreement_or_corpus",
      dashboardRoute: true,
    });
    expect(entitled.premiumPostCheckoutPhase).toBe(null);
    expect(entitled.displayPhase).toBe("intake");
    expect(entitled.createFlowPhase).toBe("capturing_input");
    expect(entitled.createUiStage).toBe(CreateUiStage.INPUT);
    expect(entitled.proFullDraftQualityRetry).toBe(false);
    expect(entitled.clearLocalDraft).toBe(true);
    expect(entitled.hardError).toMatch(/notes and last saved agreement are unchanged/i);

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
    const missingBlock = intake.slice(missingIdx, missingIdx + 1600);
    expect(missingBlock).toContain("planEntitledRewriteGenerationFailureTerminal");
    expect(missingBlock).toContain("setDisplayPhase(terminal.displayPhase)");
    const snapBlock = intake.slice(snapIdx, snapIdx + 1800);
    expect(snapBlock).toContain("planEntitledRewriteGenerationFailureTerminal");
    expect(snapBlock).toContain("setDisplayPhase(terminal.displayPhase)");
    expect(intake).toMatch(
      /finally\s*\{[\s\S]{0,400}setPremiumPostCheckoutPhase\(\(prev\)\s*=>/,
    );
  });
});
