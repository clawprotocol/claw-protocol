import { describe, expect, it } from "vitest";
import {
  classifyPaidProDocumentBlocks,
  detectPaidProPlainParagraphHeadingLeaks,
  extractMainSectionHeadingPrefix,
  isMainSectionHeadingLine,
  splitSinglePaidProDocumentBlock,
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";

describe("paidProDocumentBlockClassifier", () => {
  it("classifies ALL CAPS and title-case main section headings", () => {
    expect(isMainSectionHeadingLine("1. SCOPE OF SERVICES")).toBe(true);
    expect(isMainSectionHeadingLine("8. Notices")).toBe(true);
    expect(isMainSectionHeadingLine("9. MISCELLANEOUS")).toBe(true);
    expect(isMainSectionHeadingLine("9. Miscellaneous")).toBe(true);
    expect(isMainSectionHeadingLine("10. Independent Contractor and Access")).toBe(true);
    expect(isMainSectionHeadingLine("10. INDEPENDENT CONTRACTOR AND ACCESS")).toBe(true);
    expect(isMainSectionHeadingLine("11. WARRANTIES AND COMPLIANCE")).toBe(true);
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
});
