import { describe, expect, it } from "vitest";
import {
  normalizeForRecipientSameDocumentCompare,
  recipientBaselinePlainFromRenderedHtml,
  recipientImportsMatchAuthoritativeBaseline,
} from "./recipientNoChangeCompareGuard";

describe("recipientNoChangeCompareGuard", () => {
  it("treats identical agreement text as same after normalization", () => {
    const body = "1. Scope The parties agree to consulting services. 2. Payment Net 30.";
    const html = `<article><p>${body}</p></article>`;
    expect(recipientImportsMatchAuthoritativeBaseline({ baselineRenderedHtml: html, importedAgreementPlain: body })).toBe(
      true,
    );
  });

  it("treats line wrapping and footer noise as equivalent", () => {
    const core =
      "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega section end.";
    const html = `<p>${core}</p>`;
    const imported =
      "Alpha beta\n" +
      "gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega section end.\n\n" +
      "Page 1 of 2\n" +
      "Created with LawDog — draft for review\n" +
      "2026-05-10T09:53:00Z";
    expect(recipientImportsMatchAuthoritativeBaseline({ baselineRenderedHtml: html, importedAgreementPlain: imported })).toBe(
      true,
    );
  });

  it("treats smart quotes and en-dash as equivalent", () => {
    const html =
      "<p>Fee is “Net 30” — payable on receipt for professional consulting services and reimbursable expenses as described herein.</p>";
    const imported =
      'Fee is "Net 30" - payable on receipt for professional consulting services and reimbursable expenses as described herein.';
    expect(recipientImportsMatchAuthoritativeBaseline({ baselineRenderedHtml: html, importedAgreementPlain: imported })).toBe(
      true,
    );
  });

  it("treats hyphenated line-wrap breaks as equivalent", () => {
    const html =
      "<p>Counterparty indemnification obligations survive termination of this consulting agreement for claims arising from the relationship.</p>";
    const imported =
      "Counterparty indem-\nnification obligations survive termination of this consulting agreement for claims arising from the relationship.";
    expect(recipientImportsMatchAuthoritativeBaseline({ baselineRenderedHtml: html, importedAgreementPlain: imported })).toBe(
      true,
    );
  });

  it("returns false when substantive wording differs", () => {
    const html = "<p>Payment is Net 30.</p>";
    const imported = "Payment is Net 60.";
    expect(recipientImportsMatchAuthoritativeBaseline({ baselineRenderedHtml: html, importedAgreementPlain: imported })).toBe(
      false,
    );
  });

  it("returns false for very short bodies (avoid trivial matches)", () => {
    const html = "<p>Hi.</p>";
    expect(recipientImportsMatchAuthoritativeBaseline({ baselineRenderedHtml: html, importedAgreementPlain: "Hi." })).toBe(false);
  });

  it("normalizeForRecipientSameDocumentCompare strips Sarah Collins QA cover lines", () => {
    const s = normalizeForRecipientSameDocumentCompare(
      "Sarah Collins proposed revised draft for QA testing\n\n1. Start Real clause body here with enough length to qualify.",
    );
    expect(s.toLowerCase()).not.toContain("sarah collins");
    expect(s).toContain("Real clause body");
  });

  it("recipientBaselinePlainFromRenderedHtml decodes entities like htmlToPlainText", () => {
    expect(recipientBaselinePlainFromRenderedHtml("<p>Pay &amp; wire.</p>")).toContain("Pay");
  });
});
