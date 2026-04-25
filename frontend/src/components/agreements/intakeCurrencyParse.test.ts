import { describe, expect, it } from "vitest";
import {
  BORROWER_PRINCIPAL_INSTALLMENTS_SCHEDULE_A,
  extractIntakePayment,
  formatPaymentCadencePhrase,
  formatPaymentTermsLine,
  normalizeCurrency,
} from "./intakeCurrencyParse";

describe("normalizeCurrency", () => {
  it("parses shorthand k and comma amounts", () => {
    expect(normalizeCurrency("$5k")).toBe(5000);
    expect(normalizeCurrency("$5K")).toBe(5000);
    expect(normalizeCurrency("5k/month")).toBe(5000);
    expect(normalizeCurrency("$5,000")).toBe(5000);
    expect(normalizeCurrency("5000")).toBe(5000);
  });
});

describe("extractIntakePayment", () => {
  it('parses "$5k/month paid monthly" into amount and monthly cadence', () => {
    const input = "$5k/month paid monthly";
    const parsed = { payment: extractIntakePayment(input) };
    expect(parsed.payment.amount).toBe(5000);
    expect(parsed.payment.cadence).toBe("monthly");
    expect(parsed.payment.valid).toBe(true);
  });

  it("parses personal loan: principal + monthly schedule without equating a monthly payment to principal", () => {
    const input = "Lent friend $5,000 repay monthly.";
    const p = extractIntakePayment(input);
    expect(p.amount).toBe(5000);
    expect(p.cadence).toBe("monthly");
    expect(p.installmentAmountUnspecified).toBe(true);
    expect(formatPaymentTermsLine(p)).toBe(
      `Principal: $5,000. ${BORROWER_PRINCIPAL_INSTALLMENTS_SCHEDULE_A}`,
    );
  });

  it("does not set installment-unspecified when a per-month installment is explicit", () => {
    const p = extractIntakePayment("Lent friend $5,000; $200 per month until paid in full");
    expect(p.installmentAmountUnspecified).toBeFalsy();
  });
});

describe("formatPaymentCadencePhrase", () => {
  it("uses conversational payment timing labels", () => {
    expect(formatPaymentCadencePhrase("monthly")).toBe("monthly payment");
    expect(formatPaymentCadencePhrase("weekly")).toBe("weekly payment");
    expect(formatPaymentCadencePhrase("annually")).toBe("annual payment");
    expect(formatPaymentCadencePhrase("biweekly")).toBe("payment schedule");
  });
});

describe("formatPaymentTermsLine", () => {
  it("joins amount and natural timing phrase", () => {
    expect(formatPaymentTermsLine({ amount: 5000, cadence: "monthly", valid: true })).toBe(
      "$5,000, monthly payment",
    );
    expect(formatPaymentTermsLine({ amount: 100, cadence: "custom_plan", valid: true })).toBe(
      "$100, payment schedule",
    );
  });
});
