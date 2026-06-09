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
  resetPaidProTest313HeadingRenderSourceLogsForTests,
  resolvePaidProFirstReviewVisibleDisplayPlain,
} from "./paidProFirstReviewDisplayAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
  resolveCanonicalPlainForVisibleShell,
  resolvePaidProVisibleShellRenderBranch,
} from "./paidProVisibleDocumentShell";
import { isForbiddenPaidProDisplayRenderSource } from "./premiumGenerationApiAvailability";

function buildTest313Corpus(): string {
  const pad = "Operative clause text for commercial substance. ".repeat(60);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "This Agreement is between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
    "6. Limitation of Liability",
    "6.1 Neither party shall be liable for indirect damages.",
    "6.2 Direct damages are capped as stated herein.",
    "8. Notices",
    "Notices shall be sent to the addresses on file.",
    "9. Miscellaneous",
    "Entire agreement and severability apply.",
    "10. INDEPENDENT CONTRACTOR AND ACCESS. Each party is an independent contractor and not an agent of the other.",
    "11. WARRANTIES AND COMPLIANCE\nEach party represents compliance with applicable law.",
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

const LIVE_PREVIEW_CORPUS = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "This is a simplified starter preview for review.",
  "10. INDEPENDENT CONTRACTOR AND ACCESS. Each party is an independent contractor.",
  "11. WARRANTIES AND COMPLIANCE. Each party represents compliance.",
].join("\n\n");

function countHtmlHeadings(html: string): number {
  return (html.match(/class="premium-doc-section-heading"/g) ?? []).length;
}

describe("TEST313 paid Pro heading render hardening", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProTest313HeadingRenderSourceLogsForTests();
    cleanup();
  });

  it("classifies sections 8–11 as main headings and 6.1/6.2/9.x as body", () => {
    const plain = buildTest313Corpus();
    const blocks = classifyPaidProDocumentBlocks(plain);
    const mainHeadings = blocks.filter((b) => b.kind === "main_section_heading").map((b) => b.firstLine);
    expect(mainHeadings).toEqual(
      expect.arrayContaining([
        "8. Notices",
        "9. Miscellaneous",
        "10. INDEPENDENT CONTRACTOR AND ACCESS",
        "11. WARRANTIES AND COMPLIANCE",
      ]),
    );
    expect(blocks.find((b) => b.firstLine.startsWith("6.1"))?.kind).toBe("body_paragraph");
    expect(blocks.find((b) => b.firstLine.startsWith("6.2"))?.kind).toBe("body_paragraph");
    expect(detectPaidProPlainParagraphHeadingLeaks(plain).plainParagraphHeadingLeakCount).toBe(0);
  });

  it("renders sections 8–11 as h2.premium-doc-section-heading in React and HTML", () => {
    const plain = buildTest313Corpus();
    const summary = summarizePaidProDocumentBlockClassifications(plain);
    const expectedHeadings =
      summary.mainSectionHeadingCount + summary.legacySectionHeadingCount;

    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    });
    expect(countHtmlHeadings(html)).toBe(expectedHeadings);

    const { container, unmount } = render(
      <PaidProCanonicalPlainReviewDocument
        plain={plain}
        tailPaddingClass="pb-12"
        compactTopPadding
        authoritativeSource="test313"
      />,
    );
    const reactHeadings = Array.from(
      container.querySelectorAll("h2.premium-doc-section-heading"),
    ).map((el) => el.textContent?.trim() ?? "");
    expect(reactHeadings.length).toBe(expectedHeadings);
    expect(reactHeadings).toEqual(
      expect.arrayContaining([
        "8. Notices",
        "9. Miscellaneous",
        "10. INDEPENDENT CONTRACTOR AND ACCESS",
        "11. WARRANTIES AND COMPLIANCE",
      ]),
    );
    expect(countHtmlHeadings(html)).toBe(reactHeadings.length);
    unmount();
  });

  it("blocks live_generated_preview and starter_preview for paid Pro first review display", () => {
    for (const forbidden of ["live_generated_preview", "starter_preview", "renderedAgreementPreview"]) {
      const resolution = resolvePaidProFirstReviewVisibleDisplayPlain({
        premiumCheckoutCompleted: true,
        premiumPaidDocumentSurface: true,
        paidProActive: true,
        pickerPlain: LIVE_PREVIEW_CORPUS,
        pickerSource: forbidden,
      });
      expect(resolution.plain).toBe("");
      expect(resolution.forbiddenSourceBlocked).toBe(true);
      expect(isForbiddenPaidProDisplayRenderSource(resolution.source)).toBe(true);
    }
  });

  it("uses authoritative SoT for visible shell instead of live preview picker", () => {
    const authority = buildTest313Corpus();
    establishPaidProSourceOfTruth({ text: authority, source: "server_full_draft" });
    const { plain, source } = resolveCanonicalPlainForVisibleShell({
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      pickerPlain: LIVE_PREVIEW_CORPUS,
      pickerSource: "live_generated_preview",
    });
    expect(plain.length).toBeGreaterThanOrEqual(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);
    expect(source).toBe("paidProReviewRenderPlain");
    expect(plain).toContain("Sarah Mitchell");
    expect(detectPaidProPlainParagraphHeadingLeaks(plain).plainParagraphHeadingLeakCount).toBe(0);
  });

  it("does not route paid first review to HTML when only live preview html exists", () => {
    const branch = resolvePaidProVisibleShellRenderBranch({
      hasSoT: false,
      sotLen: 0,
      htmlLen: 5000,
      canonicalPlainLen: 0,
      paidProFirstReviewActive: true,
    });
    expect(branch.branch).toBe("empty");
  });
});
