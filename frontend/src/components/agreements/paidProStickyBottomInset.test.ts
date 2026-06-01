/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { measureStickyBottomInsetPx } from "./paidProStickyBottomInset";

describe("paidProStickyBottomInset", () => {
  it("measures bar height plus buffer without hardcoded 180px", () => {
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
    expect(inset).toBeGreaterThanOrEqual(96 + 24);
    expect(inset).toBeLessThan(200);
  });
});
