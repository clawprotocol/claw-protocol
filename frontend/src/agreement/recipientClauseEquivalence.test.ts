import { describe, expect, it } from "vitest";
import {
  areClausesSemanticallyEquivalent,
  materialObligationExpansionLikely,
  normalizeClauseForEquivalence,
} from "./recipientClauseEquivalence";

describe("normalizeClauseForEquivalence", () => {
  it("strips numbering and collapses whitespace", () => {
    expect(normalizeClauseForEquivalence("  2.3.   Fees and Payment  ")).toContain("fees and payment");
    expect(normalizeClauseForEquivalence("(a) Confidentiality")).toContain("confidentiality");
  });

  it("normalizes quotes and dashes", () => {
    const a = "Party\u2019s obligation\u2014payment";
    const b = "Party's obligation-payment";
    expect(normalizeClauseForEquivalence(a)).toBe(normalizeClauseForEquivalence(b));
  });

  it("removes OCR-style single newlines inside a clause", () => {
    const a = "The total fee is\nseven thousand dollars.";
    const b = "The total fee is seven thousand dollars.";
    expect(areClausesSemanticallyEquivalent(a, b)).toBe(true);
  });

  it("strips QA page-label lines so clause bodies still align", () => {
    const noisy =
      "Sarah Collins proposed revised draft for QA testing - Page 2\n\n3.2 Invoices\nFees are due Net 30.";
    const clean = "3.2 Invoices\nFees are due Net 30.";
    expect(areClausesSemanticallyEquivalent(noisy, clean)).toBe(true);
  });
});

describe("areClausesSemanticallyEquivalent", () => {
  it("treats punctuation-only drift as equivalent", () => {
    expect(
      areClausesSemanticallyEquivalent(
        "Fees are due on receipt, without offset.",
        "Fees are due on receipt without offset",
      ),
    ).toBe(true);
  });

  it("treats numbering-only drift as equivalent when body matches", () => {
    expect(
      areClausesSemanticallyEquivalent(
        "1. Payment\nInvoices are payable upon receipt.",
        "1.1 Payment\nInvoices are payable upon receipt.",
      ),
    ).toBe(true);
  });

  it("does not treat payment timing changes as equivalent", () => {
    expect(
      areClausesSemanticallyEquivalent(
        "Invoices are payable upon receipt.",
        "Invoices are due Net 45 from invoice date.",
      ),
    ).toBe(false);
  });

  it("does not collapse meaningfully different payment windows", () => {
    expect(
      areClausesSemanticallyEquivalent(
        "Payment is due within five business days of invoice.",
        "Payment is due within ten calendar days of invoice.",
      ),
    ).toBe(false);
  });

  it("detects material obligation expansion", () => {
    expect(
      materialObligationExpansionLikely(
        "Developer will perform services as described.",
        "Developer will perform services as described. Developer may pause work for nonpayment.",
      ),
    ).toBe(true);
  });
});
