import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/experimentation/productEvents", () => ({
  logProductEvent: vi.fn(),
}));

import { hasMarkedSimpleFlowSent, markSimpleFlowSent, simpleFlowSentStorageKey } from "./simpleFlowSent";

describe("simpleFlowSent", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      length: 0,
      key: () => null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(store)) delete store[k];
  });

  it("records explicit send only after mark", () => {
    expect(simpleFlowSentStorageKey("a1")).toContain("a1");
    expect(hasMarkedSimpleFlowSent("a1")).toBe(false);
    markSimpleFlowSent("a1");
    expect(hasMarkedSimpleFlowSent("a1")).toBe(true);
  });
});
