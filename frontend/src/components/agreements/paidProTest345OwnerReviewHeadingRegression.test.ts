/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyPaidProDocumentBlocks,
  detectPaidProPlainParagraphHeadingLeaks,
  isMainSectionHeadingLine,
} from "./paidProDocumentBlockClassifier";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { splitGluedSectionHeadingFromLine } from "./documentSectionHeadingSplit";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

/** Flattened owner-review corpus with short glued main headings (test345 screenshot). */
export function buildTest345GluedOwnerReviewCorpus(): string {
  const operative = [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    `This Consulting and Implementation Agreement (this "Agreement") is entered into as of the Effective Date by and between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
    "1. Services Service Provider will provide: (a) AI workflow consulting; (b) implementation support; (c) process documentation; (d) configuration assistance; (e) staff training; and (f) automation deployment services.",
    "2. Deliverables and Acceptance To the extent the services include deliverables, Client will review them in good faith and provide timely feedback.",
    "3. Term The term of this Agreement begins on the Effective Date and continues for twelve (12) months unless earlier terminated.",
    "4. Changes and Additional Work Either party may request changes to the scope of services in writing.",
    "5. Fees and Payment 5.1 Fixed Fee Client will pay Service Provider a fixed fee of $48,000 paid monthly.",
    "5.2 Invoicing and Payment Timing Service Provider will invoice Client monthly in advance.",
    "6. Confidentiality Each party will protect the other party's confidential information.",
    "7. Governing Law This Agreement is governed by the laws of Oklahoma.",
  ].join(" ");

  const witness = [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    RED_MESA,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
    "SERVICE PROVIDER:",
    HARBOR_PEAK,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
  ].join("\n");

  return `${operative}\n\n${witness}`;
}

function assertMainHeadingBlocks(text: string): void {
  const blocks = classifyPaidProDocumentBlocks(text);
  const mainHeadings = blocks
    .filter((b) => b.kind === "main_section_heading")
    .map((b) => b.firstLine);

  expect(mainHeadings.some((h) => /^2\.\s+Deliverables and Acceptance$/i.test(h))).toBe(true);
  expect(mainHeadings.some((h) => /^3\.\s+Term$/i.test(h))).toBe(true);
  expect(mainHeadings.some((h) => /^5\.\s+Fees and Payment$/i.test(h))).toBe(true);

  for (const heading of mainHeadings) {
    expect(isMainSectionHeadingLine(heading)).toBe(true);
    expect(heading).not.toMatch(/\bTo the extent\b/i);
    expect(heading).not.toMatch(/\bThe term of\b/i);
    expect(heading).not.toMatch(/\b5\.1\b/);
  }

  const leaks = detectPaidProPlainParagraphHeadingLeaks(text);
  expect(leaks.plainParagraphHeadingLeakCount).toBe(0);
}

function assertSubsectionReadable(text: string): void {
  expect(text).toMatch(/\n5\.1 Fixed Fee/i);
  expect(text).toMatch(/5\.2 Invoicing and Payment Timing/i);
}

describe("paidProTest345OwnerReviewHeadingRegression", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("splitGluedSectionHeadingFromLine isolates sections 2, 3, and 5 headings from body text", () => {
    const line2 =
      "2. Deliverables and Acceptance To the extent the services include deliverables, Client will review them.";
    const line3 = "3. Term The term of this Agreement begins on the Effective Date.";
    const line5 = "5. Fees and Payment 5.1 Fixed Fee Client will pay Service Provider a fixed fee.";

    expect(splitGluedSectionHeadingFromLine(line2)).toBe(
      "2. Deliverables and Acceptance\nTo the extent the services include deliverables, Client will review them.",
    );
    expect(splitGluedSectionHeadingFromLine(line3)).toBe(
      "3. Term\nThe term of this Agreement begins on the Effective Date.",
    );
    expect(splitGluedSectionHeadingFromLine(line5)).toBe(
      "5. Fees and Payment\n5.1 Fixed Fee Client will pay Service Provider a fixed fee.",
    );
  });

  it("preparePaidProReviewDisplayPlain splits glued short headings without touching witness tail", () => {
    const formatted = preparePaidProReviewDisplayPlain(buildTest345GluedOwnerReviewCorpus()).text;
    assertMainHeadingBlocks(formatted);
    assertSubsectionReadable(formatted);
    expect((formatted.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length).toBe(1);
    expect(countPaidProExecutionBlocks(formatted)).toBe(1);
  });

  it("owner review render plain matches display-formatted corpus", () => {
    const raw = buildTest345GluedOwnerReviewCorpus();
    const frozenHash = hashPaidProCorpus(raw);
    establishPaidProSourceOfTruth({
      text: raw,
      source: "server_full_draft_retry",
      intakeText: "consulting between Red Mesa and Harbor Peak",
    });

    const ownerReview = getPaidProDocumentForSurface("review")?.text ?? "";
    const renderPlain = resolvePaidProReviewRenderPlain();

    assertMainHeadingBlocks(ownerReview);
    assertSubsectionReadable(ownerReview);
    expect(renderPlain).toBe(ownerReview);
    expect(hashPaidProCorpus(raw)).toBe(frozenHash);
    expect(hashPaidProCorpus(ownerReview)).not.toBe(frozenHash);
  });

  it("owner review HTML bolds sections 2, 3, and 5 without body text in headings", () => {
    const plain = preparePaidProReviewDisplayPlain(buildTest345GluedOwnerReviewCorpus()).text;

    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: [RED_MESA, HARBOR_PEAK],
      suppressCorpusEmbeddedSignatureForDisplay: false,
      suppressDocumentIntelligenceCallouts: true,
      surface: "test345_owner_review_html",
    });

    expect(html).toContain(
      '<h2 class="premium-doc-section-heading">2. Deliverables and Acceptance</h2>',
    );
    expect(html).toContain('<h2 class="premium-doc-section-heading">3. Term</h2>');
    expect(html).toContain('<h2 class="premium-doc-section-heading">5. Fees and Payment</h2>');
    expect(html).not.toMatch(/premium-doc-section-heading">2\. Deliverables and Acceptance To the/i);
    expect(html).not.toMatch(/premium-doc-section-heading">3\. Term The term/i);
    expect(html).not.toMatch(/premium-doc-section-heading">5\. Fees and<\/h2>/i);
    expect(html).toMatch(/5\.1 Fixed Fee/);
    expect((html.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length).toBe(1);
  });
});
