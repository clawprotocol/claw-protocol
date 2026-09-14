import { afterEach, describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../../launch/corePaidJourneyAcceptanceMatrix";
import {
  UNCONFIRMED_PAYMENT_DUE_QUESTION,
  UNCONFIRMED_PAYMENT_TIMING_QUESTION,
} from "./proAgreementCompleteness";
import {
  appendPaymentClarificationAnswer,
  clearPaymentClarificationForTests,
  paymentClarificationQuestions,
  persistPaymentClarification,
  readPaymentClarification,
} from "./paymentClarificationSession";

const BODY = [
  "3. Fees and Payment",
  "Client will pay Consultant a fixed fee of $48,000.",
  "4. Term",
  "Twelve months.",
].join("\n");

describe("payment clarification session", () => {
  afterEach(() => {
    clearPaymentClarificationForTests();
  });

  it("keeps Harbor intake free of payment terms and asks only the remaining field", () => {
    expect(CORE_PAID_JOURNEY_FILLED_INTAKE).not.toMatch(/net\s*[- ]?30|installment/i);
    persistPaymentClarification({
      agreementId: "agr-1",
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      answers: "",
    });
    const first = paymentClarificationQuestions({
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      answers: "",
      body: BODY,
    });
    expect(first).toContain(UNCONFIRMED_PAYMENT_TIMING_QUESTION);
    const next = appendPaymentClarificationAnswer("agr-1", CORE_PAID_JOURNEY_FILLED_INTAKE, "Invoice monthly");
    expect(next).toBe("Invoice monthly");
    expect(readPaymentClarification("agr-1")?.answers).toBe("Invoice monthly");
    const partial = paymentClarificationQuestions({
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      answers: next,
      body: BODY,
    });
    expect(partial).toEqual([UNCONFIRMED_PAYMENT_DUE_QUESTION]);
  });
});
