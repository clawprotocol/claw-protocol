/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";
import {
  hasPaidProFirstReviewAuthoritativeCorpus,
  PAID_PRO_REVIEW_VISIBLE_TEXT_MIN,
  resetPaidProFirstReviewRenderGuardForTests,
  resolvePaidProFirstReviewDocumentPresentation,
  shouldSynchronouslyRenderCanonicalPlainFirstReview,
} from "./paidProFirstReviewRenderGuard";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";

const CANONICAL_PLAIN = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "Section 1. Scope of services and deliverables.",
  "",
  ...Array.from({ length: 28 }, (_, i) => `Section ${i + 2}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n\n");

const HOLLOW_HTML = `<div class="premium-doc-body min-h-[12rem]" aria-hidden="true">${" ".repeat(1800)}</div>`;

describe("Test291 first-review visible render with frozen SoT", () => {
  afterEach(() => {
    resetPaidProFirstReviewRenderGuardForTests();
    clearPaidProSourceOfTruth();
    cleanup();
    vi.restoreAllMocks();
  });

  it("authoritative corpus is detected from SoT even when canonicalPaidProReview prop is false", () => {
    establishPaidProSourceOfTruth({
      text: CANONICAL_PLAIN,
      source: "server_full_document_text",
    });
    expect(
      hasPaidProFirstReviewAuthoritativeCorpus({
        paidReviewPlain: CANONICAL_PLAIN,
        canonicalPaidProReview: false,
      }),
    ).toBe(true);
    const presentation = resolvePaidProFirstReviewDocumentPresentation({
      agreementHtml: HOLLOW_HTML,
      paidReviewPlain: CANONICAL_PLAIN,
      canonicalPaidProReview: false,
    });
    expect(presentation.mode).toBe("canonical_plain");
    expect(
      shouldSynchronouslyRenderCanonicalPlainFirstReview({
        paidReviewPlain: CANONICAL_PLAIN,
        canonicalPaidProReview: false,
        presentation,
      }),
    ).toBe(true);
  });

  it("renders visible agreement text synchronously when SoT exists but canonicalPaidProReview prop is false", () => {
    establishPaidProSourceOfTruth({
      text: CANONICAL_PLAIN,
      source: "server_full_document_text",
    });
    render(
      <SimpleProFinalReviewScreen
        agreementHtml={HOLLOW_HTML}
        canonicalPaidProReview={false}
        paidReviewPlain={CANONICAL_PLAIN}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    const documentShell = screen.getByTestId("simple-pro-final-review-document");
    expect(within(documentShell).getByText(/CONSULTING AND IMPLEMENTATION AGREEMENT/i)).toBeTruthy();
    expect((documentShell.textContent || "").length).toBeGreaterThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);
    expect(documentShell.getAttribute("data-paid-pro-review-render-mode")).toBe("canonical_plain");
  });
});

describe("Test291 intake wiring", () => {
  const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
  const screenSrc = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
  const guardSrc = readFileSync(join(__dirname, "paidProFirstReviewRenderGuard.ts"), "utf8");

  it("intake broadens canonicalPaidProReview when SoT exists", () => {
    expect(intakeSrc).toContain("hasPaidProSourceOfTruth() &&");
    expect(intakeSrc).toContain("paidProAuthoritativeBodyLen >= PAID_PRO_AUTHORITY_MIN_LEN");
  });

  it("screen exports emergency fallback and render-branch diagnostics", () => {
    expect(screenSrc).toContain("paid-pro-first-review-emergency-banner");
    expect(screenSrc).toContain("firstReviewAuthorityActive");
    expect(screenSrc).toContain("logPaidProFirstReviewRenderBranch");
    expect(screenSrc).toContain("logPaidProFirstReviewDomVisible");
    expect(guardSrc).toContain("[paid-pro-first-review-render-branch]");
    expect(guardSrc).toContain("[paid-pro-first-review-dom-visible]");
    expect(guardSrc).toContain("[paid-pro-first-review-emergency-fallback]");
  });
});
