import { afterEach, describe, expect, it, vi } from "vitest";
import { computeRecipientDraftTextareaMaxPx } from "./useRecipientDraftTextareaMaxPx";

function mockWindow(innerHeight: number, mobile: boolean) {
  return {
    innerHeight,
    matchMedia: (q: string) => ({
      matches: mobile && q.includes("640px"),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  } as unknown as Pick<Window, "innerHeight"> & { matchMedia: Window["matchMedia"] };
}

describe("computeRecipientDraftTextareaMaxPx", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses ~70vh on desktop capped at 720", () => {
    const w = mockWindow(1000, false);
    expect(computeRecipientDraftTextareaMaxPx(w)).toBe(700);
    const w2 = mockWindow(1200, false);
    expect(computeRecipientDraftTextareaMaxPx(w2)).toBe(720);
  });

  it("uses ~55vh on mobile and still caps at 720", () => {
    const w = mockWindow(800, true);
    expect(computeRecipientDraftTextareaMaxPx(w)).toBe(440);
  });
});
