/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  classifyPaidProDocumentBlocks,
  detectPaidProPlainParagraphHeadingLeaks,
} from "./paidProDocumentBlockClassifier";
import { PaidProCanonicalPlainReviewDocument } from "./paidProCanonicalPlainReviewDocument";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";

const PAD = "Operative clause text for commercial substance and performance obligations. ".repeat(8);

function buildSectionsSixThroughNineCorpus(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    `This Agreement is entered into as of the Effective Date by and between Red Mesa Logistics LLC and Harbor Peak Automation LLC.`,
    `6. Insurance and Risk Allocation\n${PAD}`,
    "7. Representations, Warranties and Compliance",
    "Each party represents that it has authority to enter into this Agreement and will comply with applicable law.",
    "8. Relationship of the Parties; Personnel; Non-Solicitation",
    "Neither party is an agent, partner, or joint venturer of the other.",
    "9. Termination, Suspension and Effect of Termination",
    "Either party may terminate this Agreement upon thirty (30) days' written notice.",
    PAD,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Red Mesa Logistics LLC",
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
    "SERVICE PROVIDER:",
    "Harbor Peak Automation LLC",
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
  ].join("\n\n");
}

function expectAllMainHeadingsBold(plain: string): void {
  const blocks = classifyPaidProDocumentBlocks(plain);
  const mainHeadings = blocks
    .filter((b) => b.kind === "main_section_heading")
    .map((b) => b.firstLine);
  expect(mainHeadings).toEqual(
    expect.arrayContaining([
      "7. Representations, Warranties and Compliance",
      "8. Relationship of the Parties; Personnel; Non-Solicitation",
      "9. Termination, Suspension and Effect of Termination",
    ]),
  );
  expect(detectPaidProPlainParagraphHeadingLeaks(plain).plainParagraphHeadingLeakCount).toBe(0);

  const html = buildPremiumAgreementReadonlyHtml(plain, {
    signatureSectionMode: "collaboration",
    partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
    surface: "test346_section_heading_regression",
  });
  for (const heading of mainHeadings.filter((h) => /^[6-9]\./.test(h))) {
    expect(html).toContain(`<h2 class="premium-doc-section-heading">${heading}</h2>`);
  }

  const { container, unmount } = render(
    <PaidProCanonicalPlainReviewDocument
      plain={plain}
      tailPaddingClass="pb-12"
      compactTopPadding
      authoritativeSource="test346"
    />,
  );
  const reactHeadings = Array.from(
    container.querySelectorAll("h2.premium-doc-section-heading"),
  ).map((el) => el.textContent?.trim() ?? "");
  expect(reactHeadings).toEqual(expect.arrayContaining(mainHeadings.filter((h) => /^[6-9]\./.test(h))));
  unmount();
  cleanup();
}

describe("paidProTest346 section heading regression", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    cleanup();
  });

  it("classifies and bolds sections 6–9 including Representations, Warranties and Compliance", () => {
    const plain = preparePaidProReviewDisplayPlain(buildSectionsSixThroughNineCorpus()).text;
    expectAllMainHeadingsBold(plain);
  });

  it("review render plain uses the same heading classifier path as owner review", () => {
    const raw = buildSectionsSixThroughNineCorpus();
    establishPaidProSourceOfTruth({
      text: raw,
      source: "server_full_draft",
      intakeText: "consulting between Red Mesa and Harbor Peak",
    });
    const ownerReview = getPaidProDocumentForSurface("review")?.text ?? "";
    const renderPlain = resolvePaidProReviewRenderPlain();
    expect(renderPlain).toBe(ownerReview);
    expectAllMainHeadingsBold(renderPlain);
  });
});
