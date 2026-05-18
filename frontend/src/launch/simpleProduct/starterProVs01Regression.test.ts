import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression lock: starter → LawDog Pro → VS01 sender-first → workspace (not review-first shell).
 * Static assertions on source so refactors keep routing + intent wiring.
 */
describe("starter Pro VS01 regression (source locks)", () => {
  it("Continue with LawDog Pro path arms starter signature session (not review-only)", () => {
    const intake = readFileSync(join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("armPaidProStarterSignatureSendFromCreateFlow");
    expect(intake).toContain("PRO_CTA_CONTINUE");
    expect(intake).not.toMatch(/label:\s*["']Upgrade to send["']/);
    expect(intake).toContain("STARTER_PARTY_PRO_REQUIRED_CTA_LABEL");
    expect(intake).toContain("persistPremiumForkUserSendMode(\"signature\")");
  });

  it("free starter CTA does not advance unpaid users to RECIPIENTS without paid signer surface", () => {
    const intake = readFileSync(join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"), "utf8");
    const i = intake.indexOf('case "continue_basic_draft"');
    expect(i).toBeGreaterThanOrEqual(0);
    const j = intake.indexOf('case "update_agreement_from_buffer"', i);
    const block = intake.slice(i, j);
    expect(block).toMatch(/\(paidProAuthoritative && premiumSignersSurfaceReady\)/);
  });

  it("SimpleCreate paid Pro post-recipient setup prefers skip-interstitial handoff before /app/send fallback", () => {
    const page = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
    const handoff = readFileSync(join(__dirname, "paidProPostRecipientSetupHandoff.ts"), "utf8");
    const bridge = readFileSync(join(__dirname, "agreementToVs01SigningBridge.ts"), "utf8");
    expect(page).toContain("executePaidProPostRecipientSetupHandoff");
    expect(page).toContain("shouldSkipPaidProPrepareReviewLinkInterstitial");
    expect(handoff).toContain("[send-flow-skip-review-link-interstitial]");
    expect(bridge).toContain("/app/esign/");
    expect(bridge).toContain("agreement_bridge=1");
    const onCreated = page.indexOf("onCreated={");
    expect(onCreated).toBeGreaterThanOrEqual(0);
    const slice = page.slice(onCreated, onCreated + 3200);
    const sendIdx = slice.indexOf("/app/send/");
    const skipIdx = slice.indexOf("shouldSkipPaidProPrepareReviewLinkInterstitial");
    expect(skipIdx).toBeGreaterThanOrEqual(0);
    expect(sendIdx).toBeGreaterThan(skipIdx);
  });

  it("VS01 paid Pro workspace navigate targets agreements workspace with vs01_saved", () => {
    const wizard = readFileSync(join(__dirname, "../../vs01/Vs01Wizard.tsx"), "utf8");
    expect(wizard).toContain("[vs01-paid-pro-workspace-navigate]");
    expect(wizard).toContain("/app/agreements/");
    expect(wizard).toContain("vs01_saved=1");
  });

  it("recipient placement includes distinct Text tool alongside Printed name", () => {
    const signingFields = readFileSync(join(__dirname, "../../vs01/signingFields.ts"), "utf8");
    expect(signingFields).toMatch(
      /\{\s*type:\s*"printed_name",\s*label:\s*"Printed name"\s*\}[\s\S]*\{\s*type:\s*"text",\s*label:\s*"Text"\s*\}/,
    );
    const types = readFileSync(join(__dirname, "../../vs01/types.ts"), "utf8");
    expect(types).toContain('"printed_name" | "text"');
  });

  it("sender placement (StepPrepareSignature) uses distinct Text label, not merged Printed name / Text", () => {
    const prepare = readFileSync(join(__dirname, "../../vs01/StepPrepareSignature.tsx"), "utf8");
    expect(prepare).not.toContain("Printed name / Text");
    expect(prepare).toContain('labelForFieldType(type)');
    expect(prepare).toContain('case "text":');
    expect(prepare).toContain('base = "Text"');
  });
});
