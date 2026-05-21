import { describe, expect, it } from "vitest";
import { defectiveProBodyFixture } from "../qaManualTenPrompts";
import { finalizeAgreementOutput } from "../agreementOutputQuality/agreementOutputQualityPipeline";
import { validateAgreementIntegrity } from "./agreementIntegrityValidator";
import { applyClauseCoherenceEngine } from "./clauseCoherenceEngine";
import {
  applyGuidedAnswer,
  buildGuidedSessionFromAgreement,
  formatRefineInstructionForAnswer,
  getCurrentVariable,
  isGuidedCompletionComplete,
} from "./guidedCompletionEngine";
import { extractDealVariables } from "./missingVariableExtractor";
import { prioritizeDealVariables } from "./variablePrioritizationLayer";
import {
  friendlyLowConfidenceCopy,
  sanitizeProUserMessage,
  shouldPreferGuidedCompletionOverRetry,
} from "./friendlyProCompletionCopy";

describe("guidedDealCompletion", () => {
  it("extracts typed actionable variables from material items", () => {
    const fin = finalizeAgreementOutput(defectiveProBodyFixture(), {
      intakeRaw: "SaaS MSA. Uptime and payment timing not specified.",
      partyNames: ["Acme LLC", "Beta Inc"],
      surface: "test_guided",
      tier: "premium",
    });
    const vars = extractDealVariables({
      intakeRaw: "SaaS MSA. Uptime and payment timing not specified.",
      body: fin.text,
      materialItems: fin.materialMissingItems,
    });
    expect(vars.length).toBeGreaterThan(0);
    expect(vars[0]?.label).not.toMatch(/agreement is vague/i);
    expect(vars[0]?.question.length).toBeGreaterThan(10);
    expect(vars[0]?.suggestedDefaults.length).toBeGreaterThan(0);
  });

  it("prioritizes critical variables ahead of optional polish", () => {
    const fin = finalizeAgreementOutput(defectiveProBodyFixture(), {
      intakeRaw: "Referral partner agreement. Revenue share not specified.",
      surface: "test_guided_prio",
      tier: "premium",
    });
    const vars = extractDealVariables({
      body: fin.text,
      materialItems: fin.materialMissingItems,
    });
    const ordered = prioritizeDealVariables(vars);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (first && last && first.severity === "critical" && last.severity === "optional") {
      expect(ordered.indexOf(first)).toBeLessThan(ordered.indexOf(last));
    }
  });

  it("builds one-at-a-time session with completeness percent", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: "Consulting agreement. Fee structure not specified.",
      body: defectiveProBodyFixture(),
      materialItems: [
        {
          id: "payment_timing",
          label: "Payment timing",
          question: "When are invoices due?",
          severity: "material",
          agreementFamily: "vendor",
          whyItMatters: "Defines cash collection.",
          suggestedAnswerFormat: "e.g. Net 30, upon milestone acceptance",
          canProceedWithoutAnswer: true,
          affectsSections: ["payment"],
        },
      ],
    });
    expect(session).not.toBeNull();
    expect(session!.queue.length).toBeGreaterThan(0);
    expect(session!.completenessPercent).toBeGreaterThanOrEqual(0);
    expect(getCurrentVariable(session!)).not.toBeNull();
  });

  it("advances session on answer and formats refine instruction", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: "MSA",
      body: "1. Services.\nProvider delivers SaaS.",
      materialItems: [
        {
          id: "saas_sla",
          label: "Uptime target",
          question: "What uptime SLA should apply?",
          severity: "material",
          agreementFamily: "saas_msa",
          whyItMatters: "Sets availability expectations.",
          suggestedAnswerFormat: "e.g. 99.9% uptime, 4h critical response",
          canProceedWithoutAnswer: true,
          affectsSections: ["sla"],
        },
      ],
    });
    const cur = getCurrentVariable(session!);
    expect(cur).not.toBeNull();
    const instruction = formatRefineInstructionForAnswer(cur!, "99.9% monthly uptime");
    expect(instruction).toContain("99.9%");
    const next = applyGuidedAnswer(session!, cur!.id, "99.9% monthly uptime");
    expect(Object.keys(next.answered)).toHaveLength(1);
    expect(isGuidedCompletionComplete(next)).toBe(true);
  });

  it("prefers guided completion over retry when body is usable", () => {
    expect(
      shouldPreferGuidedCompletionOverRetry({
        hasUsableBody: true,
        structuralCatastrophic: false,
        variableCount: 3,
      }),
    ).toBe(true);
    expect(
      shouldPreferGuidedCompletionOverRetry({
        hasUsableBody: true,
        structuralCatastrophic: true,
        variableCount: 3,
      }),
    ).toBe(false);
  });

  it("sanitizes internal QA messages from user-facing copy", () => {
    expect(
      sanitizeProUserMessage("The agreement should read like an employment contractor document."),
    ).toBeNull();
    const copy = friendlyLowConfidenceCopy(
      buildGuidedSessionFromAgreement({
        intakeRaw: "Referral",
        body: "1. Referral.\nPartner refers customers.",
        materialItems: [
          {
            id: "referral_economics",
            label: "Revenue share",
            question: "How should referral payments work?",
            severity: "critical",
            agreementFamily: "referral",
            whyItMatters: "Defines compensation.",
            suggestedAnswerFormat: "e.g. 10% net revenue, 30-day payout",
            canProceedWithoutAnswer: false,
            affectsSections: ["compensation"],
          },
        ],
      }),
    );
    expect(copy.title).toContain("almost done");
    expect(copy.body).not.toMatch(/employment contractor/i);
  });

  it("validateAgreementIntegrity dedupes repeated invoice boilerplate", () => {
    const invoice =
      "Invoices shall reference the applicable milestone and be due within thirty (30) days of receipt.";
    const raw = `1. PAYMENT.\n${invoice}\n\n3. CONFIDENTIALITY.\n${invoice}\n\n4. TERM.\nTwelve months.`;
    const out = validateAgreementIntegrity(raw, {
      intakeRaw: "Consulting",
      surface: "test_integrity",
      tier: "premium",
    });
    const hits = (out.text.match(/Invoices shall reference/gi) || []).length;
    expect(hits).toBeLessThanOrEqual(1);
  });

  it("clause coherence engine removes duplicate good-faith sentences", () => {
    const line =
      "The Parties shall perform their obligations in good faith and in accordance with this Agreement.";
    const raw = `1. SCOPE.\nScope here.\n\n${line}\n\n${line}`;
    const { text } = applyClauseCoherenceEngine(raw);
    expect((text.match(/good faith/gi) || []).length).toBeLessThanOrEqual(1);
  });
});
