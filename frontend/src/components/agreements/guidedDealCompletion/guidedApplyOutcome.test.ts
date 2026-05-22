import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GuidedCompletionSession } from "./types";
import {
  GUIDED_RETRY_APPLY_ANSWERS_CTA,
  resolveGuidedSignerSetupStickyCta,
  resolveGuidedSignerSetupStatus,
} from "./guidedAnswerApplyOrchestration";
import {
  isGuidedApplyOutputBodyUsable,
  shouldSoftPassGuidedPostApplyQuality,
} from "./guidedPostApplyQuality";
import {
  resolveGuidedBackgroundApplyOutcome,
  validateGuidedBulkRefinedOutputForApply,
} from "./guidedApplyOutcome";

function sessionWithAnswers(count: number): GuidedCompletionSession {
  const answered: Record<string, string> = {};
  const queue: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `q${i}`;
    queue.push(id);
    answered[id] = i === 0 ? "Monthly $6,000 net 15" : "99.9% monthly uptime";
  }
  return {
    sessionKey: "gen:fp",
    queue: [],
    variables: queue.map((id) => ({
      id,
      category: "compensation",
      label: id,
      question: `Question ${id}?`,
      severity: "important",
      suggestedDefaults: [],
      agreementImpact: "x",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0.5,
      affectsSections: [],
    })),
    answered,
    skipped: new Set(),
    currentIndex: count,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: count,
  };
}

const BASE_BODY = `LawDog is not a law firm.
Not legal advice.

1. Services and Scope
Provider delivers services.

2. Fees and Payment
Client pays $10,000 net 30.

3. Confidentiality
Mutual duties.

4. Ownership
Client owns deliverables.

5. Support
Business hours support.

6. Term
30 day notice.
`;

describe("guidedApplyOutcome (test25)", () => {
  it("accepts surgical revision at ~100.6% length (ratio 1.0061)", () => {
    const beforeLen = 10_000;
    const afterLen = 10_061;
    expect(isGuidedApplyOutputBodyUsable(beforeLen, afterLen)).toBe(true);
    expect(afterLen / beforeLen).toBeGreaterThanOrEqual(0.95);
    expect(afterLen / beforeLen).toBeLessThan(1.02);
  });

  it("soft-passes when refine accepted, body usable at ~100.6% length, quality warns", () => {
    const before =
      BASE_BODY +
      "\n" +
      "Supplemental commercial terms for integration testing. ".repeat(10);
    const pad = "x".repeat(Math.ceil(before.length * 0.006));
    const after = before + pad;
    expect(isGuidedApplyOutputBodyUsable(before.length, after.length)).toBe(true);
    const session = sessionWithAnswers(5);
    const outcome = resolveGuidedBackgroundApplyOutcome({
      stableBeforePlain: before,
      postBodyPlain: after,
      session,
      refineAccepted: true,
      refineOk: false,
    });
    expect(outcome.status).toBe("applied");
    expect(outcome.softPass).toBe(true);
  });

  it("validateGuidedBulkRefinedOutputForApply returns true for accepted usable candidate", () => {
    const before =
      BASE_BODY +
      "\n" +
      "The parties agree on supplemental commercial terms as listed herein. ".repeat(8);
    expect(before.length).toBeGreaterThanOrEqual(500);
    const after = before.replace("net 30", "net 15 days; monthly retainer $6,000");
    const session = sessionWithAnswers(2);
    const outcome = resolveGuidedBackgroundApplyOutcome({
      stableBeforePlain: before,
      postBodyPlain: after,
      session,
      refineAccepted: true,
      refineOk: true,
    });
    expect(outcome.status).toBe("applied");
    expect(
      validateGuidedBulkRefinedOutputForApply({
        stableBeforePlain: before,
        candidatePlain: after,
        session,
        refineAccepted: true,
      }),
    ).toBe(true);
  });

  it("failed_retryable only when body unusable", () => {
    const session = sessionWithAnswers(3);
    const outcome = resolveGuidedBackgroundApplyOutcome({
      stableBeforePlain: BASE_BODY,
      postBodyPlain: "short",
      session,
      refineAccepted: true,
      refineOk: false,
    });
    expect(outcome.status).toBe("failed_retryable");
    expect(outcome.softPass).toBe(false);
  });

  it("sticky CTA uses Try applying answers again only for failed_retryable", () => {
    const retry = resolveGuidedSignerSetupStickyCta({
      signerStatus: resolveGuidedSignerSetupStatus(true),
      applyStatus: "failed_retryable",
    });
    expect(retry.label).toBe(GUIDED_RETRY_APPLY_ANSWERS_CTA);
    expect(retry.label).not.toMatch(/Retry Pro update/i);
    const ready = resolveGuidedSignerSetupStickyCta({
      signerStatus: resolveGuidedSignerSetupStatus(true),
      applyStatus: "applied",
    });
    expect(ready.label).toBe("Continue to final review");
  });

  it("shouldSoftPassGuidedPostApplyQuality rejects hard blockers", () => {
    expect(
      shouldSoftPassGuidedPostApplyQuality({
        applyDecisionAccepted: true,
        bodyUsable: true,
        answeredCount: 5,
        qualityReasons: ["placeholder_regression"],
      }),
    ).toBe(false);
  });

  it("intake wires soft-pass outcome resolution", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("resolveGuidedBackgroundApplyOutcome");
    expect(intake).toContain("validateGuidedBulkRefinedOutputForApply");
    expect(intake).toContain("logPostApplyQualityWarningNonblocking");
    expect(intake).toContain("GUIDED_RETRY_APPLY_ANSWERS_CTA");
  });
});
