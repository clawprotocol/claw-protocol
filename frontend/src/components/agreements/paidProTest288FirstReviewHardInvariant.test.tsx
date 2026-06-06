/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";
import {
  enforcePaidProFirstReviewHardRenderInvariant,
  PAID_PRO_REVIEW_VISIBLE_TEXT_MIN,
  resetPaidProFirstReviewRenderGuardForTests,
  resolveEffectivePaidProReviewPlain,
  resolvePaidProFirstReviewDocumentPresentation,
} from "./paidProFirstReviewRenderGuard";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";

const CANONICAL_PLAIN = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "Section 1. Scope of services and deliverables.",
  "",
  ...Array.from({ length: 30 }, (_, i) => `Section ${i + 2}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n\n");

const HOLLOW_HTML = `<div class="premium-doc-body min-h-[12rem]" aria-hidden="true">${" ".repeat(1800)}</div>`;
const HIDDEN_HTML = `<div style="display:none"><p>${"Hidden clause. ".repeat(500)}</p></div>`;

describe("Test288 paid Pro first-review hard render invariant", () => {
  afterEach(() => {
    resetPaidProFirstReviewRenderGuardForTests();
    clearPaidProSourceOfTruth();
    cleanup();
    vi.restoreAllMocks();
  });

  it("hard invariant forces canonical_plain when renderMode is html but visible text is hollow", () => {
    const forced = enforcePaidProFirstReviewHardRenderInvariant({
      mode: "html",
      agreementHtml: HOLLOW_HTML,
      paidReviewPlain: CANONICAL_PLAIN,
      htmlLen: HOLLOW_HTML.length,
      plainLen: CANONICAL_PLAIN.length,
      htmlVisibleTextLen: 0,
      renderedVisibleTextLen: 0,
      blockedBlankWithCanonical: false,
      fallbackApplied: false,
    });
    expect(forced.mode).toBe("canonical_plain");
    expect(forced.hardInvariantForced).toBe(true);
    expect(forced.fallbackApplied).toBe(true);
    expect(forced.renderedVisibleTextLen).toBeGreaterThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);
  });

  it("resolveEffectivePaidProReviewPlain falls back to frozen SoT when prop is empty", () => {
    establishPaidProSourceOfTruth({
      text: CANONICAL_PLAIN,
      source: "server_full_draft",
    });
    const resolved = resolveEffectivePaidProReviewPlain({
      paidReviewPlain: "",
      canonicalPaidProReview: true,
    });
    expect(resolved.length).toBeGreaterThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);
    expect(resolved).toContain("CONSULTING AND IMPLEMENTATION AGREEMENT");
    expect(resolved).toContain("Section 1. Scope of services");
  });

  it("hollow HTML shell renders visible canonical plain on first review", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml={HOLLOW_HTML}
        canonicalPaidProReview
        paidReviewPlain={CANONICAL_PLAIN}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    const documentShell = screen.getByTestId("simple-pro-final-review-document");
    expect(documentShell.getAttribute("data-paid-pro-review-render-mode")).toBe("canonical_plain");
    expect(within(documentShell).getByText(/CONSULTING AND IMPLEMENTATION AGREEMENT/i)).toBeTruthy();
    expect(within(documentShell).getByText(/Section 1\. Scope of services/i)).toBeTruthy();
    expect((documentShell.textContent || "").length).toBeGreaterThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);
    expect(screen.queryByTestId("simple-pro-final-review-document-empty")).toBeNull();
  });

  it("hidden HTML text renders visible canonical plain on first review", () => {
    const presentation = resolvePaidProFirstReviewDocumentPresentation({
      agreementHtml: HIDDEN_HTML,
      paidReviewPlain: CANONICAL_PLAIN,
      canonicalPaidProReview: true,
    });
    expect(presentation.mode).toBe("canonical_plain");
    expect(presentation.renderedVisibleTextLen).toBeGreaterThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);

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
    expect((documentShell.textContent || "").length).toBeGreaterThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);
  });
});

describe("Test288 first-review wiring (static)", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
  const screenSrc = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
  const guardSrc = readFileSync(join(__dirname, "paidProFirstReviewRenderGuard.ts"), "utf8");

  it("AgreementBuilderIntake wires authoritative review + SoT plain fallback into SimpleProFinalReviewScreen", () => {
    expect(intake).toContain("<SimpleProFinalReviewScreen");
    expect(intake).toContain("simpleProFinalReviewDisplayPlain");
    expect(intake).toContain("isAuthoritativePaidProReviewActive");
    expect(intake).toContain("hasPaidProSourceOfTruth()");
    expect(intake).toContain("paidProAuthoritativeBodyLen >= PAID_PRO_AUTHORITY_MIN_LEN");
    expect(intake).toContain("getPaidProSourceOfTruthText()");
    expect(intake).toContain("paidReviewPlain={");
  });

  it("SimpleProFinalReviewScreen logs visible render guard and render source", () => {
    expect(screenSrc).toContain("logPaidProReviewVisibleRenderGuardOnce");
    expect(screenSrc).toContain("logPaidProReviewRenderSourceOnce");
    expect(screenSrc).toContain("resolveEffectivePaidProReviewPlain");
    expect(screenSrc).toContain("PaidProCanonicalPlainReviewDocument");
    expect(screenSrc).toContain("data-paid-pro-review-render-mode");
  });

  it("paidProFirstReviewRenderGuard exports hard invariant + diagnostics helpers", () => {
    expect(guardSrc).toContain("enforcePaidProFirstReviewHardRenderInvariant");
    expect(guardSrc).toContain("[paid-pro-review-visible-render-guard]");
    expect(guardSrc).toContain("[paid-pro-review-render-source]");
    expect(guardSrc).toContain("[paid-pro-review-blank-render-blocked]");
  });

  it("Test287 artifact files exist", () => {
    const canonicalDoc = readFileSync(join(__dirname, "paidProCanonicalPlainReviewDocument.tsx"), "utf8");
    const test287 = readFileSync(join(__dirname, "paidProTest287VisibleRenderGuard.test.tsx"), "utf8");
    const readonlyView = readFileSync(join(__dirname, "PremiumAgreementReadonlyView.tsx"), "utf8");
    expect(canonicalDoc.length).toBeGreaterThan(0);
    expect(test287.length).toBeGreaterThan(0);
    expect(readonlyView).toContain("PREMIUM_READONLY_DOC_STYLES");
  });
});
