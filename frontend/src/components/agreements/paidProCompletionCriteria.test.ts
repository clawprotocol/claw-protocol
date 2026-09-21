import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../../launch/corePaidJourneyAcceptanceMatrix";
import { PHASE4C1_COMPLETE_SAAS } from "../../launch/phase4c1QuickIntakeCoverage";
import {
  hasCompletionMeaning,
  isHostedSaasDeal,
  unconfirmedCompletionCriteriaQuestion,
} from "./paidProCompletionCriteria";
import { buildMaterialMissingItems, isCompletionCriteriaQuestion } from "./proAgreementCompleteness";
import { contentClarificationQuestions } from "./PaidDraftContentAdvisory";
import { unconfirmedEffectiveDateQuestion } from "./paidProDateMeaning";

function replayFixture(): { authoritative_draft: string; visible_agreement?: string } {
  const rel = "evals/commercial-readiness/fixtures/consulting-unconfirmed-payment-replay.json";
  const candidates = [resolve(process.cwd(), rel), resolve(process.cwd(), "..", rel)];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`consulting replay fixture missing: ${candidates.join(", ")}`);
  return JSON.parse(readFileSync(found, "utf8"));
}

const COMPLETION_QUESTION = unconfirmedCompletionCriteriaQuestion(CORE_PAID_JOURNEY_FILLED_INTAKE);
const COMPLETION_ANSWER =
  "Completion is Client's written confirmation that the implemented AI workflow is in operational use.";

describe("paid draft completion meaning", () => {
  it("reproduces the Harbor consulting gap without treating the keyword warning as the defect", () => {
    const body = String(replayFixture().authoritative_draft || "");
    expect(body).toMatch(/AI workflow implementation/i);
    expect(body).toMatch(/deliverables/i);
    expect(hasCompletionMeaning(body)).toBe(false);
    expect(CORE_PAID_JOURNEY_FILLED_INTAKE).not.toMatch(/complete when|accepted when/i);
    const missing = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      body,
    });
    const ask = missing.find((item) => isCompletionCriteriaQuestion(item.question));
    expect(ask?.question).toBe(COMPLETION_QUESTION);
    expect(ask?.canProceedWithoutAnswer).toBe(true);
    expect(missing.some((item) => /milestone approval and acceptance process/i.test(item.question))).toBe(
      false,
    );
  });

  it("keeps the supplied completion answer and does not re-ask", () => {
    const body = `${String(replayFixture().authoritative_draft || "")}\n\n${COMPLETION_ANSWER}`;
    const missing = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      userGapAnswers: COMPLETION_ANSWER,
      body,
    });
    expect(missing.some((item) => isCompletionCriteriaQuestion(item.question))).toBe(false);
    expect(hasCompletionMeaning(body)).toBe(true);
  });

  it("does not attach consulting deliverables or project acceptance to the hosted SaaS control", () => {
    expect(isHostedSaasDeal(PHASE4C1_COMPLETE_SAAS)).toBe(true);
    const saasBody = [
      "This SaaS Subscription Agreement is entered into by and between Orion Harbor LLC and Northwind Retail Inc.",
      "1. Services",
      "Provider will provide hosted platform access and standard onboarding. Scope is the hosted platform only — no professional services.",
      "2. Fees",
      "Northwind Retail Inc pays $48,000 annual subscription, net 30.",
    ].join("\n");
    const missing = buildMaterialMissingItems({
      intakeRaw: PHASE4C1_COMPLETE_SAAS,
      body: saasBody,
    });
    expect(missing.some((item) => isCompletionCriteriaQuestion(item.question))).toBe(false);
    expect(missing.some((item) => /milestone approval and acceptance process/i.test(item.question))).toBe(
      false,
    );
    expect(saasBody).not.toMatch(/AI workflow implementation/i);
    expect(saasBody).not.toMatch(/accept or reject each milestone/i);
  });

  it("exposes date and completion questions to the painted-paper advisory", () => {
    const body = [
      "CONSULTING SERVICES AGREEMENT",
      'This Consulting Services Agreement (the "Agreement") is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").',
      "1. PARTIES AND ROLES",
      "Consultant shall perform AI workflow implementation.",
      "4. TERM AND DURATION",
      "The initial term is twelve months beginning October 1, 2026.",
    ].join("\n");
    const questions = contentClarificationQuestions({
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      body,
    });
    expect(questions).toContain(unconfirmedEffectiveDateQuestion("October 1, 2026"));
    expect(questions).toContain(COMPLETION_QUESTION);
    expect(
      contentClarificationQuestions({
        intake: PHASE4C1_COMPLETE_SAAS,
        body: saasControlBody(),
      }),
    ).toEqual([]);
  });
});

function saasControlBody(): string {
  return [
    "This SaaS Subscription Agreement is entered into by and between Orion Harbor LLC and Northwind Retail Inc.",
    "1. Services",
    "Provider will provide hosted platform access and standard onboarding. Scope is the hosted platform only — no professional services.",
    "2. Fees",
    "Northwind Retail Inc pays $48,000 annual subscription, net 30.",
  ].join("\n");
}
