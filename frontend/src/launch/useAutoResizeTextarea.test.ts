/** @vitest-environment jsdom */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAutoResizeTextarea, useResponsiveTextareaMaxPx } from "./useAutoResizeTextarea";

describe("useAutoResizeTextarea", () => {
  it("grows height for long pasted content up to maxPx", () => {
    const long = "Line of deal terms.\n".repeat(80);
    const el = document.createElement("textarea");
    el.style.boxSizing = "border-box";
    el.style.lineHeight = "24px";
    el.style.paddingTop = "16px";
    el.style.paddingBottom = "16px";
    el.value = long;
    document.body.appendChild(el);

    const ref = { current: el };
    const { result } = renderHook(() => useAutoResizeTextarea(ref, long, { minRows: 4, maxPx: 360 }));
    act(() => {
      result.current.sync();
    });

    const heightPx = parseFloat(el.style.height);
    expect(heightPx).toBeGreaterThan(120);
    expect(heightPx).toBeLessThanOrEqual(360);
    document.body.removeChild(el);
  });

  it("remasures when sync runs after longer value (example prompt)", () => {
    const el = document.createElement("textarea");
    el.style.boxSizing = "border-box";
    el.style.width = "480px";
    el.style.lineHeight = "24px";
    el.style.paddingTop = "16px";
    el.style.paddingBottom = "16px";
    el.rows = 1;
    document.body.appendChild(el);

    const ref = { current: el };
    const short = "Hi";
    const { result, rerender } = renderHook(
      ({ v }) => useAutoResizeTextarea(ref, v, { minRows: 4, maxPx: 360 }),
      { initialProps: { v: short } },
    );
    el.value = short;
    act(() => result.current.sync());
    const shortH = parseFloat(el.style.height);

    const long = "Example agreement details for a multi-party SaaS reseller deal.\n".repeat(200);
    el.value = long;
    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      get: () => (el.value.length > short.length ? 320 : 130),
    });
    rerender({ v: long });
    act(() => result.current.sync());
    const longH = parseFloat(el.style.height);

    expect(longH).toBeGreaterThan(shortH);
    document.body.removeChild(el);
  });

  it("onPaste and onDrop schedule remeasure", () => {
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    const ref = { current: document.createElement("textarea") };
    const { result } = renderHook(() => useAutoResizeTextarea(ref, "short", { maxPx: 360 }));
    act(() => {
      result.current.onPaste();
      result.current.onDrop();
    });
    expect(raf.mock.calls.length).toBeGreaterThanOrEqual(4);
    raf.mockRestore();
  });

  it("useResponsiveTextareaMaxPx defaults to desktop cap", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: !q.includes("639px"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const { result } = renderHook(() => useResponsiveTextareaMaxPx());
    expect(result.current).toBe(360);
  });
});
