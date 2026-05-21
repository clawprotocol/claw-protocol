import { describe, expect, it } from "vitest";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { resolveDeterministicIntentTitleAndSeed } from "./deterministicIntentTitleMapper";
import { isFounderEquityVestingIntent } from "./founderIntentRouter";
import { finalizeAgreementOutput } from "./agreementOutputQuality";
import { applyVisibleBodyQualityGate } from "./visibleBodyQualityGate";
import { buildMaterialMissingItems } from "./proAgreementCompleteness";
import { bodyHasManualSignatureFields } from "./premiumExecutionNormalization";
import { QA_MANUAL_TEN_PROMPTS, defectiveProBodyFixture } from "./qaManualTenPrompts";

const PLACEHOLDER_TABLE_RE = /^\s*\|.*TBD.*\|/im;

describe("qaManualTenPrompts — family classification", () => {
  for (const fx of QA_MANUAL_TEN_PROMPTS) {
    it(`${fx.id}: detectAgreementFamily`, () => {
      const family = detectAgreementFamily(fx.intake);
      if (fx.expectFamily) {
        expect(family, `${fx.id} family`).toBe(fx.expectFamily);
      }
      expect(family.length).toBeGreaterThanOrEqual(3);
    });

    it(`${fx.id}: deterministic title`, () => {
      const det = resolveDeterministicIntentTitleAndSeed(fx.intake);
      const titleHay = `${det?.title || ""} ${fx.intake}`.toLowerCase();
      if (fx.expectTitleIncludes) {
        expect(titleHay).toContain(fx.expectTitleIncludes.toLowerCase());
      }
      if (fx.expectNotTitle) {
        expect((det?.title || "").toLowerCase()).not.toContain(fx.expectNotTitle.toLowerCase());
      }
    });

    if (fx.expectIntent) {
      it(`${fx.id}: intent contract`, () => {
        const ic = resolveAgreementIntentContract(fx.intake);
        expect(ic.intent_id).toBe(fx.expectIntent);
      });
    }
  }

  it("growth advisor is not founder vesting intent", () => {
    const intake = QA_MANUAL_TEN_PROMPTS.find((p) => p.id === "growth-advisor")!.intake;
    expect(isFounderEquityVestingIntent(intake)).toBe(false);
    expect(resolveDeterministicIntentTitleAndSeed(intake)?.title).toBe("Growth Advisor Agreement");
  });

  it("JV prompt is not founder vesting title", () => {
    const intake = QA_MANUAL_TEN_PROMPTS.find((p) => p.id === "prompt-7-jv")!.intake;
    expect(isFounderEquityVestingIntent(intake)).toBe(false);
    expect(resolveDeterministicIntentTitleAndSeed(intake)?.title).toContain("Joint Venture");
  });
});

describe("visible body quality — Pro defects", () => {
  it("repairs blank subsections, splice lines, and signature artifacts", () => {
    const raw = defectiveProBodyFixture();
    const out = applyVisibleBodyQualityGate(raw, {
      intakeRaw: "Services agreement with open commercial terms",
      partyNames: ["Acme LLC", "Beta Inc"],
      surface: "test_defective_body",
    });
    expect(out.text).toMatch(/4\.1\s+Confidentiality[\s\S]{24,}/);
    expect(out.text).not.toMatch(/3\.\s+Confidentiality[\s\S]{0,200}Invoices are due within thirty/i);
    expect(PLACEHOLDER_TABLE_RE.test(out.text)).toBe(false);
    expect(/4\.1\s+Confidentiality/i.test(out.text)).toBe(true);
    expect(out.text.length).toBeGreaterThan(raw.length * 0.8);
  });

  it("finalizeAgreementOutput premium routes material gaps to Ask LawDog", () => {
    const fin = finalizeAgreementOutput(defectiveProBodyFixture(), {
      intakeRaw: "Consulting agreement. Fee structure not specified.",
      partyNames: ["Acme LLC", "Beta Inc"],
      surface: "test_finalize_premium",
      tier: "premium",
    });
    expect(fin.structuralCatastrophic).not.toBe(true);
    expect((fin.materialMissingItems ?? []).length).toBeGreaterThan(0);
    expect(bodyHasManualSignatureFields(fin.text)).toBe(false);
  });

  it("starter tier runs visible body gate without material items", () => {
    const fin = finalizeAgreementOutput(defectiveProBodyFixture(), {
      intakeRaw: "NDA between parties",
      surface: "test_finalize_starter",
      tier: "starter",
    });
    expect(fin.text).not.toMatch(/3\.\s+Confidentiality[\s\S]{0,200}Invoices are due within thirty/i);
    expect(/^\s*signature\.\s*$/im.test(fin.text)).toBe(false);
    expect((fin.materialMissingItems ?? []).length).toBe(0);
  });

  it("incomplete SaaS intake yields MSA questions not placeholder tables", () => {
    const items = buildMaterialMissingItems({
      intakeRaw: QA_MANUAL_TEN_PROMPTS.find((p) => p.id === "short-002")!.intake,
      body: "1. Services\nHosted platform.\n2. Fees\nMonthly subscription.",
    });
    expect(items.some((i) => i.id === "saas_sla" || i.id === "payment_timing")).toBe(true);
  });
});
