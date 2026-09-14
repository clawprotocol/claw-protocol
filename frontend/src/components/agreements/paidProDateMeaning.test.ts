import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../../launch/corePaidJourneyAcceptanceMatrix";
import { PHASE4C1_COMPLETE_SAAS } from "../../launch/phase4c1QuickIntakeCoverage";
import {
  UNCONFIRMED_EFFECTIVE_DATE_QUESTION,
  extractDateMeanings,
  unconfirmedEffectiveDateQuestion,
} from "./paidProDateMeaning";
import { buildMaterialMissingItems, isDateMeaningQuestion } from "./proAgreementCompleteness";

function replayFixture(): { authoritative_draft: string; visible_agreement?: string } {
  const rel = "evals/commercial-readiness/fixtures/consulting-unconfirmed-payment-replay.json";
  const candidates = [resolve(process.cwd(), rel), resolve(process.cwd(), "..", rel)];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`consulting replay fixture missing: ${candidates.join(", ")}`);
  return JSON.parse(readFileSync(found, "utf8"));
}

const DATE_QUESTION = unconfirmedEffectiveDateQuestion("October 1, 2026");

describe("paid draft date meaning", () => {
  it("reproduces undefined Effective Date and silent interchange on the preserved response", () => {
    const raw = replayFixture();
    const visible = String(raw.visible_agreement || "");
    const authoritative = String(raw.authoritative_draft || "");
    expect(visible).toMatch(/as of the Effective Date/i);
    expect(visible).toMatch(/begins on October 1, 2026/i);
    expect(visible).not.toMatch(/as of October 1, 2026 \(the "Effective Date"\)/i);
    expect(authoritative).toMatch(/effective as of October 1, 2026/i);
    expect(authoritative).toMatch(/begins on October 1, 2026/i);
    expect(CORE_PAID_JOURNEY_FILLED_INTAKE).toMatch(/starting October 1, 2026/i);
    expect(CORE_PAID_JOURNEY_FILLED_INTAKE).not.toMatch(/effective date/i);
  });

  it("asks when only a service start is supplied and does not treat invoice wording as the effective date", () => {
    const meanings = extractDateMeanings(CORE_PAID_JOURNEY_FILLED_INTAKE, "");
    expect(meanings.serviceStart).toBe("October 1, 2026");
    expect(meanings.effectiveDate).toBeNull();
    expect(meanings.needsQuestion).toBe(true);
    const missing = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      body: String(replayFixture().authoritative_draft || ""),
    });
    const ask = missing.find((item) => isDateMeaningQuestion(item.question));
    expect(ask?.question).toBe(DATE_QUESTION);
    expect(ask?.canProceedWithoutAnswer).toBe(true);
    const afterInvoice = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      userGapAnswers: "Invoice once on October 1, 2026. Payment due net 60.",
      body: String(replayFixture().authoritative_draft || ""),
    });
    expect(afterInvoice.some((item) => item.question === DATE_QUESTION)).toBe(true);
  });

  it("treats an explicit same-date answer as confirmed and does not re-ask", () => {
    const answer = "The agreement effective date is the same as the October 1, 2026 service start.";
    const meanings = extractDateMeanings(CORE_PAID_JOURNEY_FILLED_INTAKE, answer);
    expect(meanings.effectiveDate).toBe("October 1, 2026");
    expect(meanings.serviceStart).toBe("October 1, 2026");
    expect(meanings.sameAsServiceStart).toBe(true);
    expect(meanings.needsQuestion).toBe(false);
    const paper =
      'This Consulting Services Agreement (the "Agreement") is entered into as of October 1, 2026 (the "Effective Date") by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").\n\n2. Term\nThe term begins on October 1, 2026.';
    const missing = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      userGapAnswers: answer,
      body: paper,
    });
    expect(missing.some((item) => isDateMeaningQuestion(item.question))).toBe(false);
    const fromPaperOnly = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      body: paper,
    });
    expect(fromPaperOnly.some((item) => isDateMeaningQuestion(item.question))).toBe(false);
  });

  it("preserves explicitly different effective and service-start dates", () => {
    const answer =
      "The agreement is effective September 15, 2026. Services start October 1, 2026.";
    const meanings = extractDateMeanings(CORE_PAID_JOURNEY_FILLED_INTAKE, answer);
    expect(meanings.effectiveDate).toBe("September 15, 2026");
    expect(meanings.serviceStart).toBe("October 1, 2026");
    expect(meanings.sameAsServiceStart).toBe(false);
    expect(meanings.needsQuestion).toBe(false);
    const missing = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      userGapAnswers: answer,
      body: String(replayFixture().visible_agreement || ""),
    });
    expect(missing.some((item) => isDateMeaningQuestion(item.question))).toBe(false);
  });

  it("re-asks after TBD or a later contradiction and does not invent a date", () => {
    const tbd = extractDateMeanings(CORE_PAID_JOURNEY_FILLED_INTAKE, "The effective date is TBD.");
    expect(tbd.effectiveDate).toBeNull();
    expect(tbd.needsQuestion).toBe(true);
    const contradicted = extractDateMeanings(
      CORE_PAID_JOURNEY_FILLED_INTAKE,
      "The agreement is effective September 15, 2026.\nThe effective date is TBD.",
    );
    expect(contradicted.effectiveDate).toBeNull();
    expect(contradicted.needsQuestion).toBe(true);
    expect(UNCONFIRMED_EFFECTIVE_DATE_QUESTION).toMatch(/service start date/);
    const missing = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      userGapAnswers: "The effective date is TBD.",
      body: String(replayFixture().visible_agreement || ""),
    });
    expect(missing.some((item) => item.question === DATE_QUESTION)).toBe(true);
  });

  it("does not invent a consulting date question for the hosted SaaS control", () => {
    const missing = buildMaterialMissingItems({
      intakeRaw: PHASE4C1_COMPLETE_SAAS,
      body: "This SaaS Subscription Agreement is entered into by and between Orion Harbor LLC and Northwind Retail Inc.",
    });
    expect(missing.some((item) => isDateMeaningQuestion(item.question))).toBe(false);
  });
});
