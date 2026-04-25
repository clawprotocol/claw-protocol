import { describe, expect, it } from "vitest";
import { isFreshSimpleCreateStart } from "./freshSimpleCreateStart";

describe("isFreshSimpleCreateStart", () => {
  it("is true for empty landing with no handoff or resume", () => {
    expect(
      isFreshSimpleCreateStart({
        quickSendTypedArrival: false,
        handoffFromHome: false,
        heroPrefillText: undefined,
        usingTemplate: false,
        persistedIntakeWillApply: false,
        resumeNotice: null,
      }),
    ).toBe(true);
  });

  it("is false for continuity / quick-send", () => {
    expect(
      isFreshSimpleCreateStart({
        quickSendTypedArrival: true,
        handoffFromHome: false,
        heroPrefillText: undefined,
        usingTemplate: false,
        persistedIntakeWillApply: false,
        resumeNotice: null,
      }),
    ).toBe(false);
  });

  it("is false when resume notice is set", () => {
    expect(
      isFreshSimpleCreateStart({
        quickSendTypedArrival: false,
        handoffFromHome: false,
        heroPrefillText: undefined,
        usingTemplate: false,
        persistedIntakeWillApply: false,
        resumeNotice: "Restored",
      }),
    ).toBe(false);
  });

  it("is true for marketing homepage handoff (including prefilled text)", () => {
    expect(
      isFreshSimpleCreateStart({
        quickSendTypedArrival: false,
        handoffFromHome: true,
        heroPrefillText: "NDA between Acme and Beta",
        usingTemplate: false,
        persistedIntakeWillApply: false,
        resumeNotice: null,
      }),
    ).toBe(true);
  });

  it("is false for non-home hero/session prefill with text", () => {
    expect(
      isFreshSimpleCreateStart({
        quickSendTypedArrival: false,
        handoffFromHome: false,
        heroPrefillText: "Some restored text",
        usingTemplate: false,
        persistedIntakeWillApply: false,
        resumeNotice: null,
      }),
    ).toBe(false);
  });
});
