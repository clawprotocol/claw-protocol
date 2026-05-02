import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Canonical Paid Pro → VS01 → agreement workspace (dashboard) — regression locks on source.
 */
describe("starter Pro VS01 full flow (canonical dashboard path)", () => {
  it("routes paid Pro signature through VS01 esign with agreement_bridge before send fallback", () => {
    const bridge = readFileSync(join(__dirname, "agreementToVs01SigningBridge.ts"), "utf8");
    const create = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
    expect(bridge).toContain("/app/esign/");
    expect(bridge).toContain("agreement_bridge=1");
    expect(create).toContain("tryNavigatePaidProAgreementSenderFirstVs01Esign");
    expect(create).toContain("shouldSuppressReviewPipelineTelemetry");
  });

  it("workspace shell prioritizes post-sign banner and tucks memory + editor under advanced details", () => {
    const shell = readFileSync(join(__dirname, "../../agreement/AgreementWizardShell.tsx"), "utf8");
    expect(shell).toContain("[flow] dashboard_landing_post_sign");
    expect(shell).toContain("data-vs01-post-sign-landing=");
    expect(shell).toContain("vs01-agreement-advanced-workspace");
    expect(shell).toContain("Advanced workspace details");
    const idxPostSignBanner = shell.indexOf('wizardBoot === "ready" && postVs01SignatureFirstLanding');
    const idxMemory = shell.indexOf("<AgreementMemoryAgreementStrip");
    expect(idxPostSignBanner).toBeGreaterThanOrEqual(0);
    expect(idxMemory).toBeGreaterThan(idxPostSignBanner);
  });

  it("suppresses intake review telemetry and blocks review displayPhase on VS01 bridge path", () => {
    const intake = readFileSync(join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("shouldSuppressReviewPipelineTelemetry");
    expect(intake).toContain("shouldBlockIntakeReviewDisplayPhaseForVs01");
    expect(intake).toContain("[flow] review_blocked_after_vs01");
    expect(intake).toContain("[flow-guard] blocked review after VS01");
    expect(intake).toContain('if (shouldSuppressReviewPipelineTelemetry()) return;');
    expect(intake).toContain('console.debug("[review-handoff]"');
  });

  it("logs VS01 signature complete then workspace navigate", () => {
    const wizard = readFileSync(join(__dirname, "../../vs01/Vs01Wizard.tsx"), "utf8");
    expect(wizard).toContain("[flow] vs01_signature_complete");
    expect(wizard).toContain("[vs01-paid-pro-workspace-navigate]");
    expect(wizard).toContain("/app/agreements/");
    expect(wizard).toContain("vs01_saved=1");
  });

  it("workspace review UI does not advertise Ready for review on post-VS01 signature landing", () => {
    const review = readFileSync(join(__dirname, "../../components/agreements/AgreementReview.tsx"), "utf8");
    expect(review).toContain("postVs01SignatureFirstLanding");
    expect(review).toContain("Awaiting signatures");
    expect(review).toContain("if (postVs01SignatureFirstLanding) return;");
    expect(review).toContain('console.info("[create-review-links-click]"');
  });

  it("VS01 sender toolbar includes distinct Text after Printed name", () => {
    const signingFields = readFileSync(join(__dirname, "../../vs01/signingFields.ts"), "utf8");
    expect(signingFields).toMatch(
      /\{ type: "printed_name", label: "Printed name" \}[\s\S]*\{ type: "text", label: "Text" \}/,
    );
    expect(signingFields).toContain('case "text":\n      return "";');
  });

  it("dashboard flow helper exports VS01 bridge detection", () => {
    const flow = readFileSync(join(__dirname, "../../vs01/vs01SignatureDashboardFlow.ts"), "utf8");
    expect(flow).toContain("shouldSuppressReviewPipelineTelemetry");
    expect(flow).toContain("shouldBlockIntakeReviewDisplayPhaseForVs01");
    expect(flow).toContain("paid_pro_sender_first");
    expect(flow).toContain("agreement_bridge");
  });
});
