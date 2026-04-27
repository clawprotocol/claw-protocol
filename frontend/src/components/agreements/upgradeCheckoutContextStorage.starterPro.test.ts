import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearUpgradeCheckoutContext,
  readUpgradeCheckoutContext,
  stashUpgradeCheckoutContext,
} from "./upgradeCheckoutContextStorage";

describe("upgradeCheckoutContextStorage — Starter Pro Refine experiment", () => {
  const store: Record<string, string> = {};

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips starterProRefineCtaExperiment with create-flow stash", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    } as unknown as Storage);
    clearUpgradeCheckoutContext();
    stashUpgradeCheckoutContext(["a"], { starterProRefineCtaExperiment: "variant" });
    const read = readUpgradeCheckoutContext();
    expect(read?.starterProRefineCtaExperiment).toBe("variant");
    clearUpgradeCheckoutContext();
    expect(readUpgradeCheckoutContext()).toBeNull();
  });
});
