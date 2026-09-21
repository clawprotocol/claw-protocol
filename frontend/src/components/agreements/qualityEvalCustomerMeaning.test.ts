import { describe, expect, it } from "vitest";
import { PHASE4C1_COMPLETE_SAAS } from "../../launch/phase4c1QuickIntakeCoverage";
import { contentClarificationQuestions } from "./PaidDraftContentAdvisory";
import {
  extractDateMeanings,
  unconfirmedEffectiveDateQuestion,
} from "./paidProDateMeaning";
import {
  hasCompletionMeaning,
  isHostedSaasDeal,
  unconfirmedCompletionCriteriaQuestion,
} from "./paidProCompletionCriteria";
import {
  buildMaterialMissingItems,
  isCompletionCriteriaQuestion,
  isDateMeaningQuestion,
} from "./proAgreementCompleteness";

const HARBOR_PARAPHRASE = [
  "Please prepare a consulting agreement for Harbor Peak Analytics LLC as consultant",
  "and Ironvale Manufacturing Inc as client.",
  "The work is AI workflow implementation.",
  "Fixed fee $48,000.",
  "The term begins October 1, 2026 and runs twelve months.",
  "Governing law Delaware.",
  "Consultant keeps pre-existing tools; Client owns deliverables after payment.",
].join(" ");

const GENERIC_CONSULTING_PARAPHRASE = [
  "Need a consulting agreement between Riverstone Advisors LLC and Maple Court Foods Inc.",
  "Professional services for warehouse process cleanup.",
  "Fee $12,000.",
  "Services start on November 2, 2026.",
].join(" ");

const SAAS_PARAPHRASE = [
  "Draft a software as a service subscription agreement between Orion Harbor LLC and Northwind Retail Inc.",
  "Hosted platform access only, no professional services.",
  "Annual subscription $48,000, net 30.",
  "Governing law New York.",
].join(" ");

const CONSULTING_BODY = [
  "CONSULTING SERVICES AGREEMENT",
  'This Consulting Services Agreement (the "Agreement") is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").',
  "2. SCOPE OF SERVICES. Consultant shall perform AI workflow implementation.",
  "4. TERM AND DURATION. The initial term is twelve months beginning October 1, 2026.",
  "3. FEES AND PAYMENT. Client shall pay a fixed fee of $48,000.",
].join("\n");

describe("quality-eval customer meaning paraphrases", () => {
  it("keeps effective date, service start, invoice date, and signature date distinct", () => {
    const mixed = [
      HARBOR_PARAPHRASE,
      "Invoice dated October 1, 2026.",
      "Signed on September 20, 2026.",
    ].join(" ");
    const meanings = extractDateMeanings(mixed, "");
    expect(meanings.serviceStart).toBe("October 1, 2026");
    expect(meanings.effectiveDate).toBeNull();
    expect(meanings.invoiceDate).toBe("October 1, 2026");
    expect(meanings.needsQuestion).toBe(true);
    const missing = buildMaterialMissingItems({ intakeRaw: mixed, body: CONSULTING_BODY });
    const dateAsk = missing.find((item) => isDateMeaningQuestion(item.question));
    expect(dateAsk?.question).toBe(unconfirmedEffectiveDateQuestion("October 1, 2026"));
    expect(dateAsk?.canProceedWithoutAnswer).toBe(true);
    const afterInvoiceOnly = buildMaterialMissingItems({
      intakeRaw: mixed,
      userGapAnswers: "Invoice once on October 1, 2026. Signature date is September 20, 2026.",
      body: CONSULTING_BODY,
    });
    expect(afterInvoiceOnly.some((item) => isDateMeaningQuestion(item.question))).toBe(true);
  });

  it("asks or stays unresolved when facts are missing, without inventing a date or completion mark", () => {
    const missing = buildMaterialMissingItems({
      intakeRaw: GENERIC_CONSULTING_PARAPHRASE,
      body: "This Consulting Services Agreement is entered into by and between Riverstone Advisors LLC and Maple Court Foods Inc.\n\n2. Services\nConsultant shall perform warehouse process cleanup.",
    });
    const dateAsk = missing.find((item) => isDateMeaningQuestion(item.question));
    const completionAsk = missing.find((item) => isCompletionCriteriaQuestion(item.question));
    expect(dateAsk?.question).toBe(unconfirmedEffectiveDateQuestion("November 2, 2026"));
    expect(dateAsk?.canProceedWithoutAnswer).toBe(true);
    expect(completionAsk?.question).toBe(unconfirmedCompletionCriteriaQuestion(GENERIC_CONSULTING_PARAPHRASE));
    expect(completionAsk?.canProceedWithoutAnswer).toBe(true);
    expect(hasCompletionMeaning(GENERIC_CONSULTING_PARAPHRASE)).toBe(false);
    expect(extractDateMeanings(GENERIC_CONSULTING_PARAPHRASE, "").effectiveDate).toBeNull();
  });

  it("accepts paraphrased same-date and completion answers and does not re-ask", () => {
    const answers = [
      "Effective date is the same as the October 1, 2026 service start.",
      "Completion means the client confirms the implemented AI workflow is in operational use.",
    ].join("\n");
    const meanings = extractDateMeanings(HARBOR_PARAPHRASE, answers);
    expect(meanings.effectiveDate).toBe("October 1, 2026");
    expect(meanings.sameAsServiceStart).toBe(true);
    expect(meanings.needsQuestion).toBe(false);
    expect(hasCompletionMeaning(answers)).toBe(true);
    const paper = [
      CONSULTING_BODY,
      'This Consulting Services Agreement is entered into as of October 1, 2026 (the "Effective Date").',
      "Completion means the client confirms the implemented AI workflow is in operational use.",
    ].join("\n");
    const questions = contentClarificationQuestions({
      intake: HARBOR_PARAPHRASE,
      appliedAnswers: answers,
      body: paper,
    });
    expect(questions).toEqual([]);
    const missing = buildMaterialMissingItems({
      intakeRaw: HARBOR_PARAPHRASE,
      userGapAnswers: answers,
      body: paper,
    });
    expect(missing.some((item) => isDateMeaningQuestion(item.question))).toBe(false);
    expect(missing.some((item) => isCompletionCriteriaQuestion(item.question))).toBe(false);
    expect(missing.every((item) => item.canProceedWithoutAnswer === true)).toBe(true);
  });

  it("re-asks after conflicting or unresolved customer facts", () => {
    const conflicted = extractDateMeanings(
      HARBOR_PARAPHRASE,
      "The agreement is effective September 15, 2026.\nThe effective date is TBD.",
    );
    expect(conflicted.effectiveDate).toBeNull();
    expect(conflicted.needsQuestion).toBe(true);
    const missing = buildMaterialMissingItems({
      intakeRaw: HARBOR_PARAPHRASE,
      userGapAnswers: "Completion is written confirmation that the work is live.\nCompletion is TBD.",
      body: CONSULTING_BODY,
    });
    expect(missing.some((item) => isDateMeaningQuestion(item.question))).toBe(true);
    expect(missing.find((item) => isDateMeaningQuestion(item.question))?.canProceedWithoutAnswer).toBe(true);
    // Completion TBD is not separately parsed today; missing completion still asks, supplied meaning does not invent SLAs.
  });

  it("does not attach consulting completion or invented dates to paraphrased hosted SaaS", () => {
    expect(isHostedSaasDeal(SAAS_PARAPHRASE)).toBe(true);
    expect(isHostedSaasDeal(PHASE4C1_COMPLETE_SAAS)).toBe(true);
    const saasBody = [
      "SOFTWARE AS A SERVICE SUBSCRIPTION AGREEMENT",
      "This SaaS Subscription Agreement is entered into by and between Orion Harbor LLC and Northwind Retail Inc.",
      "Provider will provide hosted platform access and standard onboarding. Scope is the hosted platform only.",
      "Northwind Retail Inc pays $48,000 annual subscription, net 30.",
    ].join("\n");
    expect(contentClarificationQuestions({ intake: SAAS_PARAPHRASE, body: saasBody })).toEqual([]);
    const missing = buildMaterialMissingItems({ intakeRaw: SAAS_PARAPHRASE, body: saasBody });
    expect(missing.some((item) => isDateMeaningQuestion(item.question))).toBe(false);
    expect(missing.some((item) => isCompletionCriteriaQuestion(item.question))).toBe(false);
    expect(missing.some((item) => /milestone approval and acceptance process/i.test(item.question))).toBe(false);
  });
});
// Manual-edit recovery remains separately unverified unless a journey test edits and restores paper.
