/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PaidProReviewVerticalLayoutFixture } from "./PaidProReviewVerticalLayoutFixture";
import {
  PAID_PRO_REVIEW_VERTICAL_LAYOUT_AFTER,
  PAID_PRO_REVIEW_VERTICAL_LAYOUT_BEFORE,
  PAID_PRO_REVIEW_VERTICAL_SAVINGS_PX,
  estimatePaidProReviewChromeAfterDocumentPx,
  estimatePaidProReviewChromeBeforeDocumentPx,
} from "./paidProReviewVerticalLayout";

function tailwindClassPx(className: string, token: string): number | null {
  const match = className.match(new RegExp(`${token}-(\\d+(?:\\.\\d+)?)`));
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? Math.round(n * 4) : null;
}

describe("paidProReviewVerticalLayout", () => {
  afterEach(() => {
    cleanup();
  });

  it("documents before/after spacing constants and material savings", () => {
    expect(estimatePaidProReviewChromeBeforeDocumentPx()).toBeGreaterThan(
      estimatePaidProReviewChromeAfterDocumentPx(),
    );
    expect(PAID_PRO_REVIEW_VERTICAL_SAVINGS_PX).toBeGreaterThan(120);
    expect(PAID_PRO_REVIEW_VERTICAL_LAYOUT_AFTER.documentCardPaddingTopPx).toBe(32);
    expect(PAID_PRO_REVIEW_VERTICAL_LAYOUT_BEFORE.documentCardPaddingTopPx).toBe(44);
  });

  it("after layout: no duplicate control line and document precedes guidance panels", () => {
    const { getByTestId, queryByTestId } = render(<PaidProReviewVerticalLayoutFixture mode="after" />);
    expect(queryByTestId("paid-pro-review-shell-control-line")).toBeNull();
    expect(queryByTestId("paid-pro-review-in-panel-chrome")).toBeNull();

    const document = getByTestId("simple-pro-final-review-document");
    const status = getByTestId("paid-pro-review-status-panel");
    expect(document.compareDocumentPosition(status)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const article = getByTestId("premium-agreement-readonly-article");
    expect(article.className).toContain("pt-8");
  });

  it("applies tighter layout utility classes in after mode", () => {
    const before = render(<PaidProReviewVerticalLayoutFixture mode="before" />);
    const frameBefore = before.getByTestId("paid-pro-review-document-frame");
    const articleBefore = before.getByTestId("premium-agreement-readonly-article");
    cleanup();

    const after = render(<PaidProReviewVerticalLayoutFixture mode="after" />);
    const frameAfter = after.getByTestId("paid-pro-review-document-frame");
    const articleAfter = after.getByTestId("premium-agreement-readonly-article");
    const previewAfter = after.getByTestId("paid-pro-review-preview-root");

    expect(frameBefore.className).toContain("mt-4");
    expect(frameAfter.className).toContain("mt-2");
    expect(articleBefore.className).toContain("pt-11");
    expect(articleAfter.className).toContain("pt-8");
    expect(previewAfter.className).toContain("mt-2");
    expect(tailwindClassPx(articleAfter.className, "pt")).toBe(
      PAID_PRO_REVIEW_VERTICAL_LAYOUT_AFTER.documentCardPaddingTopPx,
    );
  });

  it("before layout retains duplicate control line and panels above document", () => {
    const { getByTestId } = render(<PaidProReviewVerticalLayoutFixture mode="before" />);
    expect(getByTestId("paid-pro-review-shell-control-line")).toBeTruthy();
    const document = getByTestId("simple-pro-final-review-document");
    const status = getByTestId("paid-pro-review-status-panel");
    expect(status.compareDocumentPosition(document)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
