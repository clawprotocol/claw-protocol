/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import { PaidProCanonicalPlainReviewDocument } from "./paidProCanonicalPlainReviewDocument";
import { summarizePaidProDocumentBlockClassifications } from "./paidProDocumentBlockClassifier";

const SAMPLE_PLAIN = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "This Agreement is entered into as of the Effective Date by and between the parties.",
  "1. SCOPE OF SERVICES",
  "1.1 Provider shall deliver consulting and implementation services.",
  "2. COMPENSATION",
  "Client shall pay the fees described in Exhibit A.",
  "9. MISCELLANEOUS",
  "This section contains general provisions.",
  "10. Independent Contractor and Access",
  "Each party acts as an independent contractor.",
  "11. WARRANTIES AND COMPLIANCE",
  "Each party represents that it complies with applicable law.",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "CLIENT:",
  "Blue Canyon Analytics LLC",
  "By: __________________________",
  "Name: Sarah Mitchell",
  "Title: CEO",
  "SERVICE PROVIDER:",
  "Iron Vale Systems Inc.",
  "By: __________________________",
  "Name: Michael Torres",
  "Title: President",
].join("\n\n");

function countHtmlMatches(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

function countReactMatches(container: HTMLElement, selector: string): number {
  return container.querySelectorAll(selector).length;
}

describe("Test310 paid Pro render authority parity", () => {
  it("shared classifier counts match HTML builder and React renderer", () => {
    const summary = summarizePaidProDocumentBlockClassifications(SAMPLE_PLAIN);
    const expectedSectionHeadings =
      summary.mainSectionHeadingCount + summary.legacySectionHeadingCount;

    const html = buildPremiumAgreementReadonlyHtml(SAMPLE_PLAIN, {
      signatureSectionMode: "collaboration",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    });

    expect(countHtmlMatches(html, /<h1\b/g)).toBe(summary.titleCount);
    expect(countHtmlMatches(html, /class="premium-doc-section-heading"/g)).toBe(
      expectedSectionHeadings,
    );
    expect(countHtmlMatches(html, /class="premium-doc-signature-party-start"/g)).toBe(
      summary.signaturePartyStartCount,
    );
    expect(countHtmlMatches(html, /class="premium-doc-signature-entity-name"/g)).toBe(
      summary.signatureEntityCount,
    );

    const { container, unmount } = render(
      <PaidProCanonicalPlainReviewDocument
        plain={SAMPLE_PLAIN}
        tailPaddingClass="pb-12"
        compactTopPadding
        authoritativeSource="test310"
      />,
    );

    expect(countReactMatches(container, "h1")).toBe(summary.titleCount);
    expect(countReactMatches(container, "h2.premium-doc-section-heading")).toBe(
      expectedSectionHeadings,
    );

    unmount();
    cleanup();
  });

  it("title-case main sections receive h2.premium-doc-section-heading in both renderers", () => {
    const plain = [
      "SERVICES AGREEMENT",
      "1. SCOPE",
      "Body text.",
      "10. Independent Contractor and Access",
      "More body text.",
    ].join("\n\n");

    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["A", "B"],
    });
    expect(html).toContain('class="premium-doc-section-heading"');
    expect(html).toContain("10. Independent Contractor and Access");

    const { container, unmount } = render(
      <PaidProCanonicalPlainReviewDocument
        plain={plain}
        tailPaddingClass="pb-12"
        compactTopPadding
        authoritativeSource="test310"
      />,
    );
    const headings = container.querySelectorAll("h2.premium-doc-section-heading");
    expect(headings.length).toBe(2);
    expect(Array.from(headings).some((h) => h.textContent?.includes("Independent Contractor"))).toBe(
      true,
    );

    unmount();
    cleanup();
  });

  it("subsections remain body paragraphs in both renderers", () => {
    const plain = [
      "SERVICES AGREEMENT",
      "1. SCOPE",
      "1.1 Detailed scope paragraph.",
      "1.2 Another subsection.",
    ].join("\n\n");

    const summary = summarizePaidProDocumentBlockClassifications(plain);
    expect(summary.mainSectionHeadingCount).toBe(1);
    expect(summary.bodyParagraphCount).toBeGreaterThanOrEqual(2);

    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["A", "B"],
    });
    expect(countHtmlMatches(html, /class="premium-doc-section-heading"/g)).toBe(1);
    expect(html).toContain("1.1 Detailed scope paragraph.");

    const { container, unmount } = render(
      <PaidProCanonicalPlainReviewDocument
        plain={plain}
        tailPaddingClass="pb-12"
        compactTopPadding
        authoritativeSource="test310"
      />,
    );
    expect(countReactMatches(container, "h2.premium-doc-section-heading")).toBe(1);
    expect(container.textContent).toContain("1.1 Detailed scope paragraph.");

    unmount();
    cleanup();
  });
});
