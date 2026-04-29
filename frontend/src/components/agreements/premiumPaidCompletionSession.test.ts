import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPaidPremiumCompletionSession,
  hasPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
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
  });

  it("mark/clear round-trip persists paid return across URL strip", () => {
    expect(hasPaidPremiumCompletionSession()).toBe(false);
    markPaidPremiumCompletionSession();
    expect(hasPaidPremiumCompletionSession()).toBe(true);
    clearPaidPremiumCompletionSession();
    expect(hasPaidPremiumCompletionSession()).toBe(false);
  });
});
