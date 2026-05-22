import { describe, expect, it } from "vitest";
import {
  buildConsolidatedGuidedRegenerationPrompt,
  validateGuidedBulkRegeneration,
  validateGuidedBulkRegenerationStrictPlacement,
} from "./guidedBulkRegeneration";
import type { GuidedCompletionSession } from "./types";

const BASE = "SERVICES AGREEMENT\n" + "Section 1\n".repeat(80) + "\n2. FEES\nTotal fee.\n";

function sessionStub(): GuidedCompletionSession {
  return {
    variables: [
      {
        id: "payment_timing",
        category: "compensation",
        label: "Payment",
        question: "Payment?",
        severity: "important",
        suggestedDefaults: [],
        agreementImpact: "x",
        requiredForExecution: true,
        applicableAgreementFamilies: ["services_agreement"],
        uiControlType: "pills",
        currentValue: null,
        confidence: 0.5,
        affectsSections: [],
      },
    ],
    queue: ["payment_timing"],
    answered: { payment_timing: "Net 30 $12,000" },
    skipped: new Set(),
    currentIndex: 1,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: 1,
  };
}

describe("validateGuidedBulkRegeneration", () => {
  it("accepts bulk rewrite with orphan fragment that strict placement rejects", () => {
    const bad = BASE.replace("2. FEES", "build and\n\n2. FEES");
    const lenient = validateGuidedBulkRegeneration(BASE, bad);
    const strict = validateGuidedBulkRegenerationStrictPlacement(BASE, bad);
    expect(lenient.ok).toBe(true);
    expect(strict.ok).toBe(false);
  });

  it("rejects severely shrunk output", () => {
    const r = validateGuidedBulkRegeneration(BASE, "short");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("output_too_short");
  });

  it("rejects bloated output when session quality gate runs", () => {
    const bloated = BASE + "\n\n" + "padding ".repeat(500);
    const r = validateGuidedBulkRegeneration(BASE, bloated, sessionStub());
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("output_bloated_vs_initial");
  });

  it("consolidated prompt is family-agnostic and anti-duplication", () => {
    const prompt = buildConsolidatedGuidedRegenerationPrompt({
      intakeText: "Contractor SOW",
      session: sessionStub(),
    });
    expect(prompt).toMatch(/services, contractor, NDA, marketing/i);
    expect(prompt).toMatch(/parallel duplicate sections/i);
    expect(prompt).toMatch(/Net 30 \$12,000/);
  });
});
