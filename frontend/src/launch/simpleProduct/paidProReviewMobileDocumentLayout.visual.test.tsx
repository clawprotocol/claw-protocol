/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PaidProReviewMobileLayoutFixture } from "./PaidProReviewMobileLayoutFixture";
import { PaidProReviewVerticalLayoutFixture } from "./PaidProReviewVerticalLayoutFixture";
import {
  PAID_PRO_REVIEW_MOBILE_VIEWPORT_PX,
  auditPaidProMobilePaperContainment,
} from "./paidProReviewMobileDocumentLayout";

function mockContainmentRects(root: HTMLElement) {
  const viewportWidth = PAID_PRO_REVIEW_MOBILE_VIEWPORT_PX;
  const paper = root.querySelector('[data-testid="simple-pro-final-review-document"]')!;
  const title = root.querySelector(".premium-readonly-doc h1")!;
  const signature = root.querySelector(".premium-doc-signature-field")!;
  const paperRect = { left: 8, right: 368, top: 0, bottom: 400, width: 360, height: 400, x: 8, y: 0, toJSON: () => ({}) };
  const titleRect = { left: 24, right: 352, top: 32, bottom: 72, width: 328, height: 40, x: 24, y: 32, toJSON: () => ({}) };
  const sigRect = { left: 24, right: 340, top: 200, bottom: 220, width: 316, height: 20, x: 24, y: 200, toJSON: () => ({}) };
  paper.getBoundingClientRect = () => paperRect as DOMRect;
  title.getBoundingClientRect = () => titleRect as DOMRect;
  signature.getBoundingClientRect = () => sigRect as DOMRect;
  return auditPaidProMobilePaperContainment({
    viewportWidth,
    paperLeft: paperRect.left,
    paperRight: paperRect.right,
    titleLeft: titleRect.left,
    titleRight: titleRect.right,
    signatureLeft: sigRect.left,
    signatureRight: sigRect.right,
  });
}

describe("paidProReviewMobileDocumentLayout visual regression", () => {
  afterEach(() => cleanup());

  it("mobile fixture wires compact preview, paper attr, and overflow classes", () => {
    const { getByTestId } = render(<PaidProReviewMobileLayoutFixture />);
    const preview = getByTestId("paid-pro-review-mobile-fixture");
    expect(preview.getAttribute("data-paid-pro-review-compact")).toBe("true");
    expect(preview.style.overflowX).toBe("hidden");

    const article = getByTestId("premium-agreement-readonly-article");
    expect(article.getAttribute("data-paid-pro-review-paper")).toBe("true");
    expect(article.className).toContain("max-[480px]:px-4");
    expect(article.className).toContain("overflow-x-hidden");
    expect(article.className).toContain("max-w-full");

    const documentShell = getByTestId("simple-pro-final-review-document");
    expect(documentShell.className).toContain("overflow-x-hidden");
    expect(documentShell.className).toContain("min-w-0");
  });

  it("at 376px viewport, containment audit passes for paper, title, and signature", () => {
    const { getByTestId } = render(<PaidProReviewMobileLayoutFixture />);
    const audit = mockContainmentRects(getByTestId("paid-pro-review-mobile-fixture"));
    expect(audit.pass).toBe(true);
  });

  it("desktop vertical compact layout keeps pt-8 and sm breakpoint padding utilities", () => {
    const { getByTestId } = render(<PaidProReviewVerticalLayoutFixture mode="after" />);
    const article = getByTestId("premium-agreement-readonly-article");
    expect(article.className).toContain("pt-8");
    expect(article.className).toContain("sm:px-[clamp");
    expect(article.getAttribute("data-paid-pro-review-paper")).toBe("true");
  });

  it("launch.css blocks horizontal overflow on compact preview root", () => {
    const launchCss = readFileSync(join(__dirname, "../launch.css"), "utf8");
    expect(launchCss).toMatch(
      /#claw-simple-create-preview\[data-paid-pro-review-compact="true"\][\s\S]*overflow-x:\s*hidden/,
    );
  });
});
