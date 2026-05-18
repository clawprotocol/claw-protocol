/** @vitest-environment jsdom */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP,
  HOMEPAGE_TEXTAREA_MAX_PX_MOBILE,
  syncTextareaSize,
  useAutoResizeTextarea,
  useResponsiveTextareaMaxPx,
} from "./useAutoResizeTextarea";

/** Production-scale homepage prompt (Ironclad / 5-party confidentiality), multiline like pasted intake. */
export const IRONCLAD_HOMEPAGE_PROMPT = [
  "Create a confidentiality and commercial protections agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC.",
  "Signers: Ethan Cole (Ironclad), Maya Bennett (Harborline), Lucas Reed (Northwind), Olivia Hart (Silver Mesa), Adrian Vale (VertexGrid).",
  "Emails: ethan@ironclad.example, maya@harborline.example, lucas@northwind.example, olivia@silvermesa.example, adrian@vertexgrid.example.",
  "Scope: enterprise workflow automation, API integrations, white-label deployment, data processing, and security obligations.",
  "Term 24 months with 90-day termination for convenience. Governing law Delaware.",
  "Include mutual confidentiality, IP ownership of deliverables after payment, limitation of liability caps, indemnification, audit rights, subprocessors, breach notification within 72 hours, non-solicitation, dispute resolution, and electronic signatures.",
  "Each party shall maintain commercially reasonable security controls and permit annual audits on 30 days notice.",
  "Deliverables remain confidential for five years; trade secrets survive termination.",
].join("\n");

function mountTextareaLikeHomepage(widthPx = 560) {
  const el = document.createElement("textarea");
  el.style.boxSizing = "border-box";
  el.style.width = `${widthPx}px`;
  el.style.lineHeight = "26px";
  el.style.paddingTop = "16px";
  el.style.paddingBottom = "56px";
  el.style.paddingLeft = "16px";
  el.style.paddingRight = "64px";
  el.style.border = "1px solid #cbd5e1";
  el.rows = 4;
  document.body.appendChild(el);
  return el;
}

describe("syncTextareaSize", () => {
  it("does not cap scrollHeight measurement with maxHeight (applies max only after measure)", () => {
    const el = document.createElement("textarea");
    document.body.appendChild(el);
    let measuredScroll = 180;
    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      get: () => measuredScroll,
    });

    const initial = syncTextareaSize(el, { minRows: 4, maxPx: HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP });
    expect(initial.heightPx).toBe(181);
    expect(initial.overflowAuto).toBe(false);
    expect(el.style.overflowY).toBe("hidden");
    expect(el.style.maxHeight).toBe(`${HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP}px`);

    measuredScroll = 900;
    const grown = syncTextareaSize(el, { minRows: 4, maxPx: HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP });
    expect(grown.heightPx).toBe(HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP);
    expect(grown.overflowAuto).toBe(true);
    expect(el.style.overflowY).toBe("auto");

    document.body.removeChild(el);
  });

  it("uses overflow hidden below cap and auto at cap", () => {
    const el = document.createElement("textarea");
    document.body.appendChild(el);
    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      get: () => 400,
    });
    const under = syncTextareaSize(el, { minRows: 4, maxPx: HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP });
    expect(under.overflowAuto).toBe(false);
    expect(el.style.overflowY).toBe("hidden");

    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      get: () => 700,
    });
    const over = syncTextareaSize(el, { minRows: 4, maxPx: HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP });
    expect(over.overflowAuto).toBe(true);
    expect(el.style.overflowY).toBe("auto");
    document.body.removeChild(el);
  });
});

describe("useAutoResizeTextarea", () => {
  it("matches production Ironclad intake shape for regression fixtures", () => {
    expect(IRONCLAD_HOMEPAGE_PROMPT).toMatch(/Ironclad Systems Group LLC/);
    expect(IRONCLAD_HOMEPAGE_PROMPT).toMatch(/VertexGrid Technologies LLC/);
    expect(IRONCLAD_HOMEPAGE_PROMPT.length).toBeGreaterThan(500);
    expect(IRONCLAD_HOMEPAGE_PROMPT.split("\n").length).toBeGreaterThan(4);
  });

  it("grows Ironclad-scale pasted content above 420px up to desktop cap", () => {
    const pasted = `${IRONCLAD_HOMEPAGE_PROMPT}\n${"Line of deal terms.\n".repeat(100)}`;
    const el = mountTextareaLikeHomepage();
    el.value = pasted;
    // jsdom under-reports scrollHeight for long multiline text; production hero paste ~480px at ~560px width.
    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      get: () => 480,
    });

    const ref = { current: el };
    const { result } = renderHook(() =>
      useAutoResizeTextarea(ref, pasted, { minRows: 4, maxPx: HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP }),
    );
    act(() => {
      result.current.sync();
    });

    const heightPx = parseFloat(el.style.height);
    expect(heightPx).toBeGreaterThan(420);
    expect(heightPx).toBeLessThanOrEqual(HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP);
    expect(el.style.overflowY).toBe("hidden");

    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      get: () => 900,
    });
    act(() => {
      result.current.sync();
    });
    expect(parseFloat(el.style.height)).toBe(HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP);
    expect(el.style.overflowY).toBe("auto");
    document.body.removeChild(el);
  });

  it("grows height for long pasted content up to maxPx", () => {
    const long = `${IRONCLAD_HOMEPAGE_PROMPT.split("\n")[0]}\n${"Line of deal terms.\n".repeat(80)}`;
    const el = mountTextareaLikeHomepage();
    el.value = long;

    const ref = { current: el };
    const { result } = renderHook(() =>
      useAutoResizeTextarea(ref, long, { minRows: 4, maxPx: HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP }),
    );
    act(() => {
      result.current.sync();
    });

    const heightPx = parseFloat(el.style.height);
    expect(heightPx).toBeGreaterThan(120);
    expect(heightPx).toBeLessThanOrEqual(HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP);
    document.body.removeChild(el);
  });

  it("remasures after example-prompt style programmatic insertion", () => {
    const el = mountTextareaLikeHomepage();
    const ref = { current: el };
    const short = "Hi";
    const { result, rerender } = renderHook(
      ({ v }) => useAutoResizeTextarea(ref, v, { minRows: 4, maxPx: HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP }),
      { initialProps: { v: short } },
    );
    el.value = short;
    act(() => result.current.sync());
    const shortH = parseFloat(el.style.height);

    const example = `${HOME_EXAMPLE_PROMPT_TEXT}\n${"Additional scope and payment milestone detail.\n".repeat(12)}`;
    el.value = example;
    rerender({ v: example });
    act(() => result.current.sync());
    const longH = parseFloat(el.style.height);

    expect(longH).toBeGreaterThanOrEqual(shortH);
    expect(example.length).toBeGreaterThan(short.length);
    expect(el.style.overflowY).toBe("hidden");
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
    const { result } = renderHook(() =>
      useAutoResizeTextarea(ref, "short", { maxPx: HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP }),
    );
    act(() => {
      result.current.onPaste();
      result.current.onDrop();
    });
    expect(raf.mock.calls.length).toBeGreaterThanOrEqual(4);
    raf.mockRestore();
  });

  it("useResponsiveTextareaMaxPx uses 520 desktop and 360 mobile", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: q.includes("639px"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const { result: mobile } = renderHook(() => useResponsiveTextareaMaxPx());
    expect(mobile.current).toBe(HOMEPAGE_TEXTAREA_MAX_PX_MOBILE);

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: !q.includes("639px"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const { result: desktop } = renderHook(() => useResponsiveTextareaMaxPx());
    expect(desktop.current).toBe(HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP);
  });
});

const HOME_EXAMPLE_PROMPT_TEXT =
  "Services agreement between Acme LLC and Northwind for website design. $8,500 flat fee, 50% deposit, work starts on signing, California law.";
