import { describe, expect, it } from "vitest";
import { buildReviewFirstTextDiffSummary } from "./reviewFirstTextDiff";
import { formatAgreementPlainTextForEditing } from "./formatAgreementPlainTextForEditing";

const COLLAPSED_FEES_SECTION =
  "CONSULTING AGREEMENT Between Acme and Beta 3. Fees, Invoicing and Payment 3.1 Fixed Fee. Client will pay Consultant a fixed fee of US$8,500 for the Services. 3.2 Invoicing and Payment Timing. Consultant may invoice Client for the fixed fee upon execution of this Agreement unless the parties agree in writing to a different invoicing schedule. Client will pay each undisputed invoice within thirty (30) days after receipt. 3.3 Disputed Amounts. Either party may dispute an invoice in good faith.";

describe("formatAgreementPlainTextForEditing", () => {
  it("restores section and subsection breaks from collapsed copy text", () => {
    const formatted = formatAgreementPlainTextForEditing(COLLAPSED_FEES_SECTION);
    expect(formatted).toContain("3. Fees, Invoicing and Payment");
    expect(formatted).toContain("3.1 Fixed Fee. Client will pay Consultant a fixed fee of US$8,500 for the Services.");
    expect(formatted).toContain("3.2 Invoicing and Payment Timing.");
    expect(formatted).toContain("within thirty (30) days after receipt.");
    expect(formatted).toContain("3.3 Disputed Amounts.");
    expect(formatted.indexOf("3. Fees")).toBeLessThan(formatted.indexOf("3.1 Fixed Fee"));
    expect(formatted.indexOf("3.1 Fixed Fee")).toBeLessThan(formatted.indexOf("3.2 Invoicing"));
    expect(formatted).toMatch(/\n\n/);
  });

  it("strips draft template and page artifacts without mutating operative clauses", () => {
    const noisy = [
      "Draft Agreement (non-binding template)",
      "Page 1 of 9",
      "2. Payment. Client pays within thirty (30) days after receipt.",
      "Created with LawDog",
    ].join(" ");
    const formatted = formatAgreementPlainTextForEditing(noisy);
    expect(formatted).not.toMatch(/draft agreement/i);
    expect(formatted).not.toMatch(/page 1 of 9/i);
    expect(formatted).toContain("within thirty (30) days after receipt");
  });

  it("preserves already well-structured plain text", () => {
    const structured = [
      "CONSULTING AGREEMENT",
      "",
      "1. Services. Provider performs services.",
      "",
      "2. Payment. Client pays within thirty (30) days after receipt.",
      "",
      "CLIENT:",
      "Acme LLC",
    ].join("\n");
    const formatted = formatAgreementPlainTextForEditing(structured);
    expect(formatted).toContain("CLIENT:");
    expect(formatted).toContain("1. Services.");
    expect(formatted.split("\n\n").length).toBeGreaterThanOrEqual(3);
  });

  it("supports reviewer paste round-trip: copy → single phrase edit → correct diff", () => {
    const copied = formatAgreementPlainTextForEditing(COLLAPSED_FEES_SECTION);
    const edited = copied.replace("within thirty (30) days after receipt", "within fifteen (15) days after receipt");
    const diff = buildReviewFirstTextDiffSummary(copied, edited);
    const section = diff.changedSections[0];

    expect(diff.hasMaterialChanges).toBe(true);
    expect(section?.title).toBe("Payment timing changed");
    expect(section?.beforePhrase).toContain("thirty (30) days after receipt");
    expect(section?.afterPhrase).toContain("fifteen (15) days after receipt");
    expect(section?.clauseLabel).toContain("3.2 Invoicing and Payment Timing");
  });
});
