/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  PAID_PRO_STICKY_CTA_BUFFER_PX,
  computePaidProReviewScrollPaddingPx,
  measureStickyBottomInsetPx,
} from "./paidProStickyBottomInset";

describe("paidProStickyBottomInset", () => {
  it("measures bar height plus 48px buffer and safe-area without hardcoded 180px", () => {
    const bar = document.createElement("div");
    bar.getBoundingClientRect = () =>
      ({
        height: 96,
        width: 400,
        top: 0,
        left: 0,
        right: 400,
        bottom: 96,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const inset = measureStickyBottomInsetPx(bar);
    expect(inset).toBe(96 + PAID_PRO_STICKY_CTA_BUFFER_PX);
    expect(inset).toBe(
      computePaidProReviewScrollPaddingPx({ ctaHeightPx: 96, safeAreaInsetBottomPx: 0 }),
    );
    expect(inset).toBeLessThan(200);
  });
});
