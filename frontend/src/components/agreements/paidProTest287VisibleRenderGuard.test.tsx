/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";
import {
  measureHtmlDomVisibleTextLen,
  resetPaidProFirstReviewRenderGuardForTests,
  resolvePaidProFirstReviewDocumentPresentation,
  PAID_PRO_REVIEW_VISIBLE_TEXT_MIN,
} from "./paidProFirstReviewRenderGuard";

const CANONICAL_PLAIN = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "Section 1. Scope of services and deliverables.",
  "",
  "This Agreement is between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
  "",
  ...Array.from({ length: 24 }, (_, i) => `Section ${i + 2}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n\n");

const HIDDEN_HTML = [
  `<div style="display:none"><h1>Hidden title</h1><p>${"Hidden clause text. ".repeat(400)}</p></div>`,
  `<div aria-hidden="true"><p>${"Aria-hidden body. ".repeat(300)}</p></div>`,
  `<div class="premium-doc-body">${" ".repeat(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN + 200)}</div>`,
].join("");

describe("Test287 paid Pro visible document render guard", () => {
  afterEach(() => {
    resetPaidProFirstReviewRenderGuardForTests();
    cleanup();
    vi.restoreAllMocks();
  });

  it("measureHtmlDomVisibleTextLen ignores display:none and aria-hidden markup", () => {
    expect(measureHtmlDomVisibleTextLen(HIDDEN_HTML)).toBeLessThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);
    expect(measureHtmlDomVisibleTextLen(`<p>Visible agreement clause. ${"x".repeat(1200)}</p>`)).toBeGreaterThan(
      PAID_PRO_REVIEW_VISIBLE_TEXT_MIN,
    );
  });

  it("forces canonical_plain when HTML is long but DOM-visible text is near-empty", () => {
    const presentation = resolvePaidProFirstReviewDocumentPresentation({
      agreementHtml: HIDDEN_HTML,
      paidReviewPlain: CANONICAL_PLAIN,
      canonicalPaidProReview: true,
    });
    expect(presentation.mode).toBe("canonical_plain");
    expect(presentation.fallbackApplied).toBe(true);
    expect(presentation.renderedVisibleTextLen).toBe(CANONICAL_PLAIN.length);
    expect(presentation.renderedVisibleTextLen).toBeGreaterThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);
  });

  it("renders visible agreement text when SoT plain exists but HTML is visually empty", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml={HIDDEN_HTML}
        canonicalPaidProReview
        paidReviewPlain={CANONICAL_PLAIN}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );

    const documentShell = screen.getByTestId("simple-pro-final-review-document");
    expect(within(documentShell).getByText(/CONSULTING AND IMPLEMENTATION AGREEMENT/i)).toBeTruthy();
    expect(within(documentShell).getByText(/Section 1\. Scope of services/i)).toBeTruthy();
    expect((documentShell.textContent || "").length).toBeGreaterThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);
    expect(screen.getByTestId("simple-pro-final-review-paid-sot-body")).toBeTruthy();
  });
});
