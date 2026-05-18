/** @vitest-environment jsdom */
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAutoResizeTextarea } from "./useAutoResizeTextarea";

function mountTextareaHook(value: string, maxPx = 320) {
  const ref = { current: null as HTMLTextAreaElement | null };
  const view = renderHook(
    ({ v }) => {
      const elRef = useRef<HTMLTextAreaElement | null>(null);
      const handlers = useAutoResizeTextarea(elRef, v, { minRows: 4, maxPx });
      ref.current = elRef.current;
      return { elRef, handlers };
    },
    { initialProps: { v: value } },
  );
  return { view, ref };
}

describe("useAutoResizeTextarea", () => {
  it("grows height for long pasted content up to maxPx", () => {
    const long = "Line of deal terms.\n".repeat(80);
    const { view } = mountTextareaHook(long, 200);
    const { elRef, handlers } = view.result.current;

    const el = document.createElement("textarea");
    el.style.boxSizing = "border-box";
    el.style.lineHeight = "24px";
    el.style.paddingTop = "16px";
    el.style.paddingBottom = "16px";
    el.value = long;
    document.body.appendChild(el);
    elRef.current = el;

    act(() => {
      handlers.sync();
    });

    const heightPx = parseFloat(el.style.height);
    expect(heightPx).toBeGreaterThan(100);
    expect(heightPx).toBeLessThanOrEqual(200);
    document.body.removeChild(el);
  });

  it("onPaste schedules a remeasure after paste", () => {
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    const { view } = mountTextareaHook("short");
    act(() => {
      view.result.current.handlers.onPaste();
    });
    expect(raf.mock.calls.length).toBeGreaterThanOrEqual(2);
    raf.mockRestore();
  });
});
