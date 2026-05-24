import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPaidPremiumCompletionSession,
  hasPaidPremiumCompletionSession,
  hasStoredPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
  readPaidPremiumCompletionSessionMarker,
} from "./premiumCompletionStorage";

describe("premium paid completion session flag", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage);
    vi.stubGlobal("window", {
      location: { href: "https://example.test/app/create" },
    } as unknown as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hasPaidPremiumCompletionSession is true when premiumCompletion=1 in URL", () => {
    vi.stubGlobal("window", {
      location: { href: "https://example.test/app/create?premiumCompletion=1" },
    } as unknown as Window & typeof globalThis);
    expect(hasPaidPremiumCompletionSession()).toBe(true);
    expect(hasStoredPaidPremiumCompletionSession()).toBe(false);
  });

  it("mark/clear round-trip persists paid return across URL strip", () => {
    expect(hasPaidPremiumCompletionSession()).toBe(false);
    markPaidPremiumCompletionSession();
    expect(hasPaidPremiumCompletionSession()).toBe(true);
    expect(hasStoredPaidPremiumCompletionSession()).toBe(true);
    expect(readPaidPremiumCompletionSessionMarker()).toMatchObject({ source: "settled_checkout" });
    clearPaidPremiumCompletionSession();
    expect(hasPaidPremiumCompletionSession()).toBe(false);
  });

  it("records QA bypass source on the same paid completion session marker", () => {
    markPaidPremiumCompletionSession({ source: "qa_bypass" });
    expect(hasPaidPremiumCompletionSession()).toBe(true);
    expect(readPaidPremiumCompletionSessionMarker()).toMatchObject({
      v: 1,
      source: "qa_bypass",
    });
  });

  it("keeps legacy settled marker readable", () => {
    sessionStorage.setItem("claw_paid_premium_completion_session_v1", "1");
    expect(hasStoredPaidPremiumCompletionSession()).toBe(true);
    expect(readPaidPremiumCompletionSessionMarker()).toMatchObject({ source: "settled_checkout" });
  });
});
