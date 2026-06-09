/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import { PaidProCanonicalPlainReviewDocument } from "./paidProCanonicalPlainReviewDocument";
import {
  classifyPaidProDocumentBlocks,
  detectPaidProPlainParagraphHeadingLeaks,
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";
import {
  resetPaidProTest314HeadingInvariantLogsForTests,
} from "./paidProFirstReviewDisplayAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolveCanonicalPlainForVisibleShell } from "./paidProVisibleDocumentShell";

function buildTest314Fixture(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "This Agreement is entered into as of the Effective Date by and between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
    "This Agreement governs the parties' consulting engagement and related deliverables.",
    "1. Scope of Services\nService Provider shall perform consulting services as described herein.",
    "2. Compensation\nClient shall pay fees as set forth in Exhibit A.",
    "3. Ownership of Work Product\nWork product shall be owned as stated herein.",
    "4. Confidentiality\nEach party shall protect confidential information.",
    "1.1 Provider shall deliver milestones on schedule.",
    "Section 1.1 shall survive termination.",
  ].join("\n\n");
}

function buildTest314RecitalMergedFixture(): string {
  const pad = "Operative clause text for commercial substance. ".repeat(60);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    [
      "This Agreement is entered into as of the Effective Date by and between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
      "1. Scope of Services",
      "Service Provider shall perform consulting services as described herein.",
    ].join("\n"),
    "2. Compensation\nClient shall pay fees as set forth in Exhibit A.",
    "3. Ownership of Work Product\nWork product shall be owned as stated herein.",
    "4. Confidentiality\nEach party shall protect confidential information.",
    pad,
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
}

describe("TEST314 paid Pro section 1 heading invariant", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProTest314HeadingInvariantLogsForTests();
    cleanup();
  });

  it("classifies sections 1–4 as main headings with zero leaks in standard fixture", () => {
    const plain = buildTest314Fixture();
    const mainHeadings = classifyPaidProDocumentBlocks(plain)
      .filter((b) => b.kind === "main_section_heading")
      .map((b) => b.firstLine);
    expect(mainHeadings).toEqual([
      "1. Scope of Services",
      "2. Compensation",
      "3. Ownership of Work Product",
      "4. Confidentiality",
    ]);
    const leaks = detectPaidProPlainParagraphHeadingLeaks(plain);
    expect(leaks.plainParagraphHeadingLeakCount).toBe(0);
    expect(leaks.leakedLines).not.toContain("1. Scope of Services");
  });

  it("promotes section 1 when recital and heading share one block", () => {
    const plain = buildTest314RecitalMergedFixture();
    const mainHeadings = classifyPaidProDocumentBlocks(plain)
      .filter((b) => b.kind === "main_section_heading")
      .map((b) => b.firstLine);
    expect(mainHeadings[0]).toBe("1. Scope of Services");
    expect(detectPaidProPlainParagraphHeadingLeaks(plain).plainParagraphHeadingLeakCount).toBe(0);
  });

  it("renders sections 1–4 as h2.premium-doc-section-heading in React and HTML", () => {
    const plain = buildTest314RecitalMergedFixture();
    const expected =
      summarizePaidProDocumentBlockClassifications(plain).mainSectionHeadingCount;

    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    });
    expect((html.match(/class="premium-doc-section-heading"/g) ?? []).length).toBe(expected);

    const { container, unmount } = render(
      <PaidProCanonicalPlainReviewDocument
        plain={plain}
        tailPaddingClass="pb-12"
        compactTopPadding
        authoritativeSource="test314"
      />,
    );
    const headings = Array.from(container.querySelectorAll("h2.premium-doc-section-heading")).map(
      (el) => el.textContent?.trim() ?? "",
    );
    expect(headings).toEqual([
      "1. Scope of Services",
      "2. Compensation",
      "3. Ownership of Work Product",
      "4. Confidentiality",
    ]);
    expect(container.querySelector("p")?.textContent).not.toMatch(/^1\. Scope of Services/m);
    unmount();
  });

  it("does not promote subsection lines or inline Section 1.1 references to h2", () => {
    const plain = buildTest314Fixture();
    const { container, unmount } = render(
      <PaidProCanonicalPlainReviewDocument
        plain={plain}
        tailPaddingClass="pb-12"
        compactTopPadding
        authoritativeSource="test314"
      />,
    );
    const headings = Array.from(container.querySelectorAll("h2.premium-doc-section-heading")).map(
      (el) => el.textContent?.trim() ?? "",
    );
    expect(headings.some((h) => h.startsWith("1.1"))).toBe(false);
    expect(container.textContent).toContain("Section 1.1 shall survive termination.");
    unmount();
  });

  it("SoT first-review visible shell resolves section 1 as main heading", () => {
    const authority = buildTest314RecitalMergedFixture();
    establishPaidProSourceOfTruth({ text: authority, source: "server_full_draft" });
    const { plain } = resolveCanonicalPlainForVisibleShell({ paidProActive: true });
    expect(detectPaidProPlainParagraphHeadingLeaks(plain).plainParagraphHeadingLeakCount).toBe(0);
    const sectionOne = classifyPaidProDocumentBlocks(plain).find(
      (b) => b.kind === "main_section_heading" && /^1\.\s+/.test(b.firstLine),
    );
    expect(sectionOne?.kind).toBe("main_section_heading");
  });
});
