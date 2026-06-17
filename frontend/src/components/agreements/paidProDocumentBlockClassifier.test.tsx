/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PaidProCanonicalPlainReviewDocument } from "./paidProCanonicalPlainReviewDocument";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  classifyPaidProDocumentBlocks,
  detectPaidProPlainParagraphHeadingLeaks,
  extractMainSectionHeadingPrefix,
  isMainSectionHeadingLine,
  splitSinglePaidProDocumentBlock,
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";

describe("paidProDocumentBlockClassifier", () => {
  afterEach(() => {
    cleanup();
  });

  it("classifies ALL CAPS and title-case main section headings", () => {
    expect(isMainSectionHeadingLine("1. SCOPE OF SERVICES")).toBe(true);
    expect(isMainSectionHeadingLine("8. Notices")).toBe(true);
    expect(isMainSectionHeadingLine("9. MISCELLANEOUS")).toBe(true);
    expect(isMainSectionHeadingLine("9. Miscellaneous")).toBe(true);
    expect(isMainSectionHeadingLine("10. Independent Contractor and Access")).toBe(true);
    expect(isMainSectionHeadingLine("10. INDEPENDENT CONTRACTOR AND ACCESS")).toBe(true);
    expect(isMainSectionHeadingLine("11. WARRANTIES AND COMPLIANCE")).toBe(true);
  });

  it("classifies punctuation-rich main section headings identically to simple titles", () => {
    const punctuationHeadings = [
      "7. Liability Allocation",
      "8. Independent Contractor; Assignment; Force Majeure",
      "9. Fees, Expenses & Reimbursement",
      "10. Governing Law / Dispute Resolution",
      "11. Notices (Email and Mail)",
      "12. INDEPENDENT CONTRACTOR; ASSIGNMENT; FORCE MAJEURE",
    ];
    for (const heading of punctuationHeadings) {
      expect(isMainSectionHeadingLine(heading)).toBe(true);
    }
    expect(isMainSectionHeadingLine("8. Independent Contractor; Assignment; Force Majeure")).toBe(
      isMainSectionHeadingLine("7. Liability Allocation"),
    );
  });

  it("splits embedded same-line headings from body text", () => {
    expect(extractMainSectionHeadingPrefix("10. INDEPENDENT CONTRACTOR AND ACCESS. Each party is an independent contractor.")).toEqual({
      heading: "10. INDEPENDENT CONTRACTOR AND ACCESS",
      remainder: "Each party is an independent contractor.",
    });
    expect(splitSinglePaidProDocumentBlock(
      "11. WARRANTIES AND COMPLIANCE. Each party represents compliance with applicable law.",
    )).toEqual([
      "11. WARRANTIES AND COMPLIANCE",
      "Each party represents compliance with applicable law.",
    ]);
  });

  it("splits multi-line blocks that start with a main section heading", () => {
    expect(splitSinglePaidProDocumentBlock(
      "10. INDEPENDENT CONTRACTOR AND ACCESS\nEach party is an independent contractor.",
    )).toEqual([
      "10. INDEPENDENT CONTRACTOR AND ACCESS",
      "Each party is an independent contractor.",
    ]);
  });

  it("splits recital text from section 1 when they share one block", () => {
    expect(splitSinglePaidProDocumentBlock(
      "This Agreement is entered into by and between the parties.\n1. Scope of Services\nService Provider shall perform consulting services.",
    )).toEqual([
      "This Agreement is entered into by and between the parties.",
      "1. Scope of Services",
      "Service Provider shall perform consulting services.",
    ]);
  });

  it("does not promote subsections to main section headings", () => {
    expect(isMainSectionHeadingLine("1.1 Provider shall deliver services.")).toBe(false);
    expect(isMainSectionHeadingLine("8.1 Confidential Information")).toBe(false);
  });

  it("classifies document title, sections, subsections, and signature lines", () => {
    const plain = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "This Agreement is entered into as of the Effective Date.",
      "1. SCOPE OF SERVICES",
      "1.1 Provider shall perform consulting services.",
      "2. COMPENSATION",
      "Client shall pay fees as set forth herein.",
      "10. Independent Contractor and Access",
      "Each party is an independent contractor.",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "CLIENT:",
      "Blue Canyon Analytics LLC",
      "By: __________________________",
      "Name: Sarah Mitchell",
      "Title: CEO",
    ].join("\n\n");

    const summary = summarizePaidProDocumentBlockClassifications(plain);
    expect(summary.titleCount).toBe(1);
    expect(summary.mainSectionHeadingCount).toBe(3);
    expect(summary.bodyParagraphCount).toBeGreaterThanOrEqual(3);
    expect(summary.signaturePartyStartCount).toBe(1);
    expect(summary.signatureEntityCount).toBe(1);
    expect(summary.signatureFieldCount).toBeGreaterThanOrEqual(2);

    const blocks = classifyPaidProDocumentBlocks(plain);
    const subsection = blocks.find((b) => b.firstLine.startsWith("1.1"));
    expect(subsection?.kind).toBe("body_paragraph");
  });

  it("classifies TEST313 mixed-case headings and keeps subsections as body", () => {
    const plain = [
      "8. Notices",
      "Notices shall be sent to the addresses on file.",
      "9. Miscellaneous",
      "Entire agreement and severability apply.",
      "10. INDEPENDENT CONTRACTOR AND ACCESS. Each party is an independent contractor.",
      "11. WARRANTIES AND COMPLIANCE\nEach party represents compliance with applicable law.",
      "9.1 Entire agreement.",
      "9.2 Severability.",
    ].join("\n\n");

    const blocks = classifyPaidProDocumentBlocks(plain);
    const mainHeadings = blocks.filter((b) => b.kind === "main_section_heading").map((b) => b.firstLine);
    expect(mainHeadings).toEqual([
      "8. Notices",
      "9. Miscellaneous",
      "10. INDEPENDENT CONTRACTOR AND ACCESS",
      "11. WARRANTIES AND COMPLIANCE",
    ]);
    expect(blocks.filter((b) => b.firstLine.startsWith("9.1"))[0]?.kind).toBe("body_paragraph");
    expect(blocks.filter((b) => b.firstLine.startsWith("9.2"))[0]?.kind).toBe("body_paragraph");
    expect(detectPaidProPlainParagraphHeadingLeaks(plain).plainParagraphHeadingLeakCount).toBe(0);
  });

  it("classifies TEST314 recital + sections 1–4 with zero heading leaks", () => {
    const plain = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "This Agreement is entered into as of the Effective Date by and between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
      "1. Scope of Services\nService Provider shall perform consulting services as described herein.",
      "2. Compensation\nClient shall pay fees as set forth in Exhibit A.",
      "3. Ownership of Work Product\nWork product shall be owned as stated herein.",
      "4. Confidentiality\nEach party shall protect confidential information.",
      "1.1 Detailed scope paragraph.",
      "Section 1.1 shall survive termination.",
    ].join("\n\n");

    const blocks = classifyPaidProDocumentBlocks(plain);
    const mainHeadings = blocks.filter((b) => b.kind === "main_section_heading").map((b) => b.firstLine);
    expect(mainHeadings).toEqual([
      "1. Scope of Services",
      "2. Compensation",
      "3. Ownership of Work Product",
      "4. Confidentiality",
    ]);
    expect(blocks.find((b) => b.firstLine.startsWith("1.1"))?.kind).toBe("body_paragraph");
    const leaks = detectPaidProPlainParagraphHeadingLeaks(plain);
    expect(leaks.plainParagraphHeadingLeakCount).toBe(0);
    expect(leaks.leakedLines).not.toContain("1. Scope of Services");
  });

  it("splits section 4 glued heading from first body sentence without period (first Pro run)", () => {
    const glued =
      "4. Project Coordination, Reviews and Changes The parties will each designate a primary contact for day-to-day coordination.";
    expect(isMainSectionHeadingLine(glued)).toBe(false);
    expect(extractMainSectionHeadingPrefix(glued)).toEqual({
      heading: "4. Project Coordination, Reviews and Changes",
      remainder: "The parties will each designate a primary contact for day-to-day coordination.",
    });
    expect(splitSinglePaidProDocumentBlock(glued)).toEqual([
      "4. Project Coordination, Reviews and Changes",
      "The parties will each designate a primary contact for day-to-day coordination.",
    ]);

    const plain = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "This Agreement is entered into as of the Effective Date.",
      glued,
      "Service Provider may rely on approvals and feedback provided by Client in good faith.",
      "5. Ownership and Use of Work Product",
      "5.1 Client Ownership of Paid Deliverables. Client owns paid deliverables upon payment.",
    ].join("\n\n");

    const blocks = classifyPaidProDocumentBlocks(plain);
    const section4 = blocks.find((b) => b.firstLine.startsWith("4. Project Coordination"));
    expect(section4?.kind).toBe("main_section_heading");
    expect(section4?.firstLine).toBe("4. Project Coordination, Reviews and Changes");
    const section4Body = blocks.find((b) =>
      b.firstLine.startsWith("The parties will each designate a primary contact"),
    );
    expect(section4Body?.kind).toBe("body_paragraph");

    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
    });
    expect(html).toMatch(
      /<h2 class="premium-doc-section-heading">4\. Project Coordination, Reviews and Changes<\/h2>/i,
    );
    expect(html).toMatch(
      /<p>The parties will each designate a primary contact for day-to-day coordination\./i,
    );
    expect(html).not.toMatch(
      /<h2[^>]*>4\. Project Coordination, Reviews and Changes The parties will each designate/i,
    );
    expect(detectPaidProPlainParagraphHeadingLeaks(plain).plainParagraphHeadingLeakCount).toBe(0);
  });

  it("renders punctuation-rich section 7 and 8 with identical h2 heading treatment", () => {
    const plain = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "This Agreement is entered into by and between the parties.",
      "7. Liability Allocation",
      "Each party's liability is limited as stated herein.",
      "8. Independent Contractor; Assignment; Force Majeure",
      "Neither party may assign without consent except as permitted herein.",
    ].join("\n\n");

    const blocks = classifyPaidProDocumentBlocks(plain);
    const mainHeadings = blocks
      .filter((b) => b.kind === "main_section_heading")
      .map((b) => b.firstLine);
    expect(mainHeadings).toEqual([
      "7. Liability Allocation",
      "8. Independent Contractor; Assignment; Force Majeure",
    ]);
    expect(detectPaidProPlainParagraphHeadingLeaks(plain).plainParagraphHeadingLeakCount).toBe(0);

    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    });
    expect(html.match(/class="premium-doc-section-heading"/g)?.length).toBe(2);

    const { container, unmount } = render(
      <PaidProCanonicalPlainReviewDocument
        plain={plain}
        tailPaddingClass="pb-12"
        compactTopPadding
        authoritativeSource="heading-punctuation-regression"
      />,
    );
    const reactHeadings = Array.from(
      container.querySelectorAll("h2.premium-doc-section-heading"),
    ).map((el) => el.textContent?.trim() ?? "");
    expect(reactHeadings).toEqual([
      "7. Liability Allocation",
      "8. Independent Contractor; Assignment; Force Majeure",
    ]);
    expect(container.querySelector("p")?.textContent).not.toMatch(
      /^8\. Independent Contractor; Assignment; Force Majeure/m,
    );
    unmount();
  });

  it("merges split main heading fragments and keeps subsections unchanged", () => {
    const raw = [
      "5. Ownership, Work Product and",
      "Client Materials",
      "",
      "5.1 Client Ownership of Paid Deliverables",
      "Client owns paid deliverables upon payment.",
      "5.2 Service Provider Retained Materials",
      "Service Provider retains pre-existing tools and methods.",
    ].join("\n");

    const result = preparePaidProReviewDisplayPlain(raw);
    expect(result.text).toContain("5. Ownership, Work Product and Client Materials");
    const prepared = result.text;
    const blocks = classifyPaidProDocumentBlocks(prepared);
    const mainHeadings = blocks
      .filter((b) => b.kind === "main_section_heading")
      .map((b) => b.firstLine);
    expect(mainHeadings).toContain("5. Ownership, Work Product and Client Materials");
    expect(blocks.some((b) => b.kind === "body_paragraph" && b.firstLine === "Client Materials")).toBe(
      false,
    );
    expect(prepared).toMatch(/5\.1 Client Ownership of Paid Deliverables/);
    expect(isMainSectionHeadingLine("5. Ownership, Work Product and Client Materials")).toBe(true);
    expect(detectPaidProPlainParagraphHeadingLeaks(prepared).plainParagraphHeadingLeakCount).toBe(0);
  });

  it("does not merge split heading prefix with a body sentence on the next line", () => {
    const raw = [
      "5. Ownership, Work Product and",
      "The Service Provider will deliver work product as described herein.",
    ].join("\n\n");

    const prepared = preparePaidProReviewDisplayPlain(raw).text;
    const blocks = classifyPaidProDocumentBlocks(prepared);
    expect(blocks.some((b) => b.firstLine === "5. Ownership, Work Product and")).toBe(true);
    expect(
      blocks.some((b) =>
        b.firstLine.startsWith("The Service Provider will deliver work product"),
      ),
    ).toBe(true);
    expect(blocks.some((b) => b.firstLine.includes("Client Materials"))).toBe(false);
  });
});
