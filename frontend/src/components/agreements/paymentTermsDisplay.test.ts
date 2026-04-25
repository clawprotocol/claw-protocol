import { describe, expect, it } from "vitest";
import {
  normalizePaymentTermsForDisplay,
  normalizeStarterPaymentTermsForDisplay,
  pickStarterPaymentTermsFallback,
  STARTER_PAYMENT_FALLBACK_COMMERCIAL,
  STARTER_PAYMENT_FALLBACK_COMPENSATION,
  STARTER_PAYMENT_FALLBACK_PAYMENT,
} from "./paymentTermsDisplay";

describe("normalizePaymentTermsForDisplay (non-starter)", () => {
  it("uses neutral copy for empty input", () => {
    expect(normalizePaymentTermsForDisplay("")).toBe("To be agreed between the parties.");
    expect(normalizePaymentTermsForDisplay("   ")).toBe("To be agreed between the parties.");
  });

  it("normalizes net and days-only fragments", () => {
    expect(normalizePaymentTermsForDisplay("Net 30")).toBe("Payment due within 30 days of invoice.");
    expect(normalizePaymentTermsForDisplay("net15")).toBe("Payment due within 15 days of invoice.");
    expect(normalizePaymentTermsForDisplay("15 days")).toBe("Payment due within 15 days of invoice.");
  });

  it("normalizes monthly + first phrasing", () => {
    expect(normalizePaymentTermsForDisplay("monthly on the 1st")).toBe(
      "Monthly fee due on the 1st of each month.",
    );
  });

  it("replaces garbage fragments with legacy professional fallback", () => {
    expect(normalizePaymentTermsForDisplay("due")).toBe("Compensation as agreed in writing by the parties.");
    expect(normalizePaymentTermsForDisplay("Net")).toBe("Compensation as agreed in writing by the parties.");
    expect(normalizePaymentTermsForDisplay("42")).toBe("Compensation as agreed in writing by the parties.");
  });

  it("passes through substantive lines including weak-looking starter fragments", () => {
    expect(normalizePaymentTermsForDisplay("$2,500 due on execution")).toBe("$2,500 due on execution");
    expect(normalizePaymentTermsForDisplay("s if sales targets are hit")).toBe("s if sales targets are hit");
  });
});

describe("normalizeStarterPaymentTermsForDisplay", () => {
  it("uses polished payment fallback for empty input", () => {
    expect(normalizeStarterPaymentTermsForDisplay("")).toBe(STARTER_PAYMENT_FALLBACK_PAYMENT);
  });

  it("normalizes net and days-only fragments", () => {
    expect(normalizeStarterPaymentTermsForDisplay("Net 30")).toBe("Payment due within 30 days of invoice.");
    expect(normalizeStarterPaymentTermsForDisplay("net15")).toBe("Payment due within 15 days of invoice.");
    expect(normalizeStarterPaymentTermsForDisplay("15 days")).toBe("Payment due within 15 days of invoice.");
  });

  it("replaces clipped mid-sentence payment fragments", () => {
    expect(normalizeStarterPaymentTermsForDisplay("s if sales targets are hit")).toBe(
      STARTER_PAYMENT_FALLBACK_COMPENSATION,
    );
  });

  it("replaces tiny or stray-punctuation fragments", () => {
    expect(normalizeStarterPaymentTermsForDisplay(",net")).toBe(STARTER_PAYMENT_FALLBACK_PAYMENT);
    expect(normalizeStarterPaymentTermsForDisplay("x")).toBe(STARTER_PAYMENT_FALLBACK_COMMERCIAL);
  });

  it("replaces garbage head tokens with deterministic fallback", () => {
    expect(normalizeStarterPaymentTermsForDisplay("due")).toBe(STARTER_PAYMENT_FALLBACK_PAYMENT);
    expect(normalizeStarterPaymentTermsForDisplay("Net")).toBe(STARTER_PAYMENT_FALLBACK_PAYMENT);
    expect(normalizeStarterPaymentTermsForDisplay("42")).toBe(STARTER_PAYMENT_FALLBACK_PAYMENT);
  });

  it("passes through substantive lines", () => {
    expect(normalizeStarterPaymentTermsForDisplay("$2,500 due on execution")).toBe("$2,500 due on execution");
  });

  it("routes fallback hints from fragment keywords", () => {
    expect(pickStarterPaymentTermsFallback("bonus if we ship")).toBe(STARTER_PAYMENT_FALLBACK_COMPENSATION);
    expect(pickStarterPaymentTermsFallback("invoice weekly")).toBe(STARTER_PAYMENT_FALLBACK_PAYMENT);
    expect(pickStarterPaymentTermsFallback("zzz")).toBe(STARTER_PAYMENT_FALLBACK_COMMERCIAL);
  });
});
