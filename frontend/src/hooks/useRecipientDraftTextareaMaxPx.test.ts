import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeRecipientDraftTextareaMaxPx,
  computeRecipientDraftTextareaMinPx,
} from "./useRecipientDraftTextareaMaxPx";

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

  it("uses 80vh on desktop capped at 900px", () => {
    const w = mockWindow(1000, false);
    expect(computeRecipientDraftTextareaMaxPx(w)).toBe(800);
    const w2 = mockWindow(2000, false);
    expect(computeRecipientDraftTextareaMaxPx(w2)).toBe(900);
  });

  it("uses 65vh on mobile capped at 900px", () => {
    const w = mockWindow(800, true);
    expect(computeRecipientDraftTextareaMaxPx(w)).toBe(520);
  });
});

describe("computeRecipientDraftTextareaMinPx", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 420 desktop and 280 mobile", () => {
    expect(computeRecipientDraftTextareaMinPx(mockWindow(500, false))).toBe(420);
    expect(computeRecipientDraftTextareaMinPx(mockWindow(500, true))).toBe(280);
  });
});
