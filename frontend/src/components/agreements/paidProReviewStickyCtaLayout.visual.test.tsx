/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PAID_PRO_EXECUTION_BLOCK_MIN_WHITESPACE_PX,
  PAID_PRO_STICKY_CTA_BUFFER_PX,
  PaidProReviewStickyScrollSpacer,
  auditPaidProExecutionBlockClearance,
  computePaidProReviewScrollPaddingPx,
  measureStickyBottomInsetPx,
} from "./paidProStickyBottomInset";

describe("paidProReviewStickyCtaLayout visual regression", () => {
  it("scroll padding equals CTA height + safe-area + 48px buffer", () => {
    const bar = document.createElement("div");
    bar.getBoundingClientRect = () =>
      ({
        height: 88,
        width: 390,
        top: 712,
        left: 0,
        right: 390,
        bottom: 800,
        x: 0,
        y: 712,
        toJSON: () => ({}),
      }) as DOMRect;

    expect(measureStickyBottomInsetPx(bar)).toBe(
      computePaidProReviewScrollPaddingPx({ ctaHeightPx: 88, safeAreaInsetBottomPx: 0 }),
    );
    expect(measureStickyBottomInsetPx(bar)).toBe(88 + PAID_PRO_STICKY_CTA_BUFFER_PX);
  });

  it("renders bottom spacer at measured inset height", () => {
    render(<PaidProReviewStickyScrollSpacer heightPx={136} />);
    const spacer = screen.getByTestId("paid-pro-review-bottom-spacer");
    expect(spacer.style.height).toBe("136px");
    expect(spacer.style.minHeight).toBe("136px");
  });

  it("at max scroll, execution block clears sticky CTA by at least 40px when padding matches formula", () => {
    const viewportH = 800;
    const ctaHeight = 96;
    const safeArea = 12;
    const scrollPadding = computePaidProReviewScrollPaddingPx({
      ctaHeightPx: ctaHeight,
      safeAreaInsetBottomPx: safeArea,
    });

    const execution = document.createElement("div");
    execution.setAttribute("data-testid", "paid-pro-execution-block-tail");
    const sticky = document.createElement("div");
    sticky.setAttribute("data-testid", "paid-pro-sticky-cta-bar");

    const executionBottomPx = viewportH - scrollPadding;
    const stickyCtaTopPx = viewportH - ctaHeight;
    execution.getBoundingClientRect = () =>
      ({
        bottom: executionBottomPx,
        top: executionBottomPx - 80,
        height: 80,
        width: 400,
        left: 0,
        right: 400,
        x: 0,
        y: executionBottomPx - 80,
        toJSON: () => ({}),
      }) as DOMRect;
    sticky.getBoundingClientRect = () =>
      ({
        top: stickyCtaTopPx,
        bottom: viewportH,
        height: ctaHeight,
        width: 400,
        left: 0,
        right: 400,
        x: 0,
        y: stickyCtaTopPx,
        toJSON: () => ({}),
      }) as DOMRect;

    const audit = auditPaidProExecutionBlockClearance({
      executionBlockEl: execution,
      stickyCtaEl: sticky,
    });

    expect(audit.requiredWhitespacePx).toBe(PAID_PRO_EXECUTION_BLOCK_MIN_WHITESPACE_PX);
    expect(audit.whitespaceBelowExecutionPx).toBe(scrollPadding - ctaHeight);
    expect(audit.pass).toBe(true);
    expect(audit.whitespaceBelowExecutionPx).toBeGreaterThanOrEqual(
      PAID_PRO_EXECUTION_BLOCK_MIN_WHITESPACE_PX,
    );
  });
});
